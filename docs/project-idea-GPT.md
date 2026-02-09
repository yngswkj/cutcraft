# 1. 目的と前提

## 目的

- 1つのテーマから、**2分程度の動画を構成（章→シーン）**し、**シーンごとの動画クリップ（例：4〜12秒）**を生成して、外部編集で最終結合できる状態にする。
- 個人利用なので、**最短で回る**ことを優先（運用はローカル中心）。

## やらないこと（Non-goals）

- クリップ同士の結合 / カット編集 / テロップ入れ / BGM完パケ化（外部アプリへ）
- 公開用のユーザー管理、課金、共有リンク、権限設計

---

# 2. システム全体像（アーキテクチャ）

## 推奨構成（ローカルWeb + ワーカー）

- **UI（Web）**: 設計図編集、イメージボード確認、生成ジョブ監視、成果物一覧
- **APIサーバ**: プロジェクト管理、設計図/シーン/台本のCRUD、ジョブ投入
- **Worker（ジョブ実行）**: Sora/Veo APIを叩いて生成→DL→保存→ステータス更新
- **DB（SQLite）**: メタデータ（プロジェクト/シーン/ジョブ/プロンプト履歴）
- **Storage（ローカルFS）**: mp4 / png / export json などを保存

> OpenAIのVideo APIは「作成→状態取得→ダウンロード→一覧/削除」という非同期ジョブ型の設計なので、Worker分離が相性良いです。([OpenAI Platform][1])

---

# 3. 外部API前提（Sora / Veo）

## 3.1 Sora（OpenAI Video API）で必要なこと

- **主に使うエンドポイント**: Create / Status / Content download / List / Delete ([OpenAI Platform][1])
- Create時の主要パラメータ例:
  - `model`: `sora-2` or `sora-2-pro`
  - `seconds`: 4 / 8 / 12
  - `size`: `720x1280` `1280x720` `1024x1792` `1792x1024` ([OpenAI Platform][2])

- 生成物ダウンロード: `GET /v1/videos/{video_id}/content` ([OpenAI Platform][2])

## 3.2 Veo（Vertex AI）で必要なこと

- 主要パラメータ例:
  - `duration`: Veo2は 5–8、Veo3は 4/6/8 ([Google Cloud Documentation][3])
  - `aspectRatio`: `"16:9"` or `"9:16"` ([Google Cloud Documentation][3])
  - `negativePrompt`, `seed`, `sampleCount(1-4)`, `personGeneration` ([Google Cloud Documentation][3])
  - （Veo3系）`resolution`: 720p/1080p/（一部）4k ([Google Cloud Documentation][3])

---

# 4. 機能要件（あなたの7ステップを実装仕様に落とす）

## F1. テーマ→設計図生成（Blueprint Draft）

入力:

- テーマ（必須）
- 任意：目的/視聴者/トーン/尺/アスペクト比

出力（設計図の3層）:

1. **Creative Brief**（狙い・トーン・制約）
2. **Structure**（章立てと秒数配分）
3. **Shot List**（最終生成単位＝シーン、各4〜12秒など）

## F2. 設計図の微調整（人間が編集できるUI）

- 章・シーンの並び替え
- シーン秒数（Soraなら 4/8/12 に丸め）([OpenAI Platform][2])
- 共通スタイル（色/質感/カメラ）を “プロジェクト固定” で保持

## F3. 設計図→イメージボード作成（Storyboard）

- 各シーンにつき 1〜3案 → 1枚採用
- 採用画像は **そのシーンの参照画像** として紐付け（Soraは `input_reference` が使える）([OpenAI Platform][2])

## F4. イメージボードのシーン別調整

- “差分指示” を保存（例：夕方に、被写体は維持、背景情報量↓）
- 再生成履歴（採用/却下）を残す

## F5. 設計図＋ボード→台本生成（Scene Script）

1シーンに3トラックを持つのがおすすめ:

- **映像**（生成プロンプト同等）
- **音声**（ナレーション原稿：後でTTSに回せる）
- **編集メモ**（外部編集で使う）

## F6. 台本→動画生成（Render Pipeline）

- シーンごとに生成ジョブ投入
- ステータス：queued / in_progress / completed / failed
- completed で mp4 をDLして保存（Soraは content endpoint）([OpenAI Platform][2])

## F7. 作成動画の一覧確認（Library）

- 「作品（Project）」一覧
- 「作品詳細」：シーンのサムネグリッド＋再生成ボタン＋エクスポート

---

# 5. データモデル（SQLite想定）

最小で回るER（概念）：

## Project

- `id`, `title`, `theme`, `aspect_ratio`, `target_seconds`(=120), `provider_default`, `created_at`

## Blueprint

- `project_id`, `creative_brief_json`, `structure_json`, `style_guide_json`, `version`

## Scene

- `id`, `project_id`, `order`, `chapter`, `target_seconds`, `status`
- `visual_prompt`, `negative_prompt`（Veo用）([Google Cloud Documentation][3])
- `camera_notes`, `consistency_tags`（キャラ名/小道具ID等）

## StoryboardFrame

- `scene_id`, `image_path`, `chosen`(bool), `prompt_used`, `created_at`

## Script

- `scene_id`, `narration_text`, `edit_notes`, `version`

## RenderJob

- `id`, `scene_id`, `provider`(sora|veo), `provider_job_id`, `params_json`
- `status`, `progress`, `error`, `cost_estimate`, `created_at`, `finished_at`

## Asset

- `scene_id`, `type`(video|image|export), `path`, `hash`, `meta_json`

---

# 6. Provider抽象化（Sora/Veo差し替えインターフェース）

```ts
interface VideoProvider {
  createSceneVideo(input: {
    prompt: string;
    seconds: number;
    sizeOrResolution: string;
    aspectRatio?: string;
    referenceImages?: string[]; // paths
    negativePrompt?: string;
    seed?: number;
    extra?: Record<string, any>;
  }): Promise<{ providerJobId: string }>;

  getJob(providerJobId: string): Promise<{ status: string; progress?: number }>;

  download(providerJobId: string): Promise<Buffer>; // mp4 bytes

  // 任意：差分修正が欲しければ
  remix?(
    providerJobId: string,
    prompt: string,
  ): Promise<{ providerJobId: string }>;
}
```

- Sora側は `seconds(4/8/12)` と `size(4種)` を **入力バリデーション**で強制するのが重要。([OpenAI Platform][2])
- Veo側は `aspectRatio / negativePrompt / seed / sampleCount / personGeneration / duration` をparamsとして持つ。([Google Cloud Documentation][3])

---

# 7. 内部API（ローカルREST例）

## Projects

- `POST /projects` テーマ登録→設計図ドラフト生成
- `GET /projects`
- `GET /projects/:id`

## Blueprint/Scenes

- `PUT /projects/:id/blueprint` 設計図更新（versioning）
- `GET /projects/:id/scenes`
- `PUT /scenes/:sceneId` プロンプト/秒数/参照更新

## Storyboard

- `POST /scenes/:sceneId/storyboard:generate`
- `POST /scenes/:sceneId/storyboard:choose` 採用画像決定

## Render

- `POST /projects/:id/render`（全シーン投入）
- `POST /scenes/:sceneId/render`（単体投入）
- `GET /jobs?project_id=...`

## Export

- `POST /projects/:id/export` → `timeline.json` など吐く

---

# 8. 生成ジョブ設計（失敗しがちな所の仕様）

## キュー

- `concurrency = 1〜2`（API制限/コスト事故回避）
- `retry = 2`（指数バックオフ）
- 再試行時の自動軽量化（例：秒数短縮、解像度ダウン、プロンプト短縮）

## 冪等性

- `scene_id + blueprint_version + prompt_hash + params_hash` をキーにして
  - 同一条件の重複生成を防ぐ（or 明示的に “再生成” として別ジョブ扱い）

## コスト見積り（概算）

- Sora 2 は “per second” の価格表示があるので、**秒×単価×本数**を事前表示できる。([OpenAI Platform][4])
  （実課金は最終的に請求/使用量に従うので「見積り」として扱う）

---

# 9. ファイル配置（ローカルストレージ設計）

```
/data
  /projects/<projectId>/
    project.json
    blueprint_v3.json
    /storyboard/
      scene_010_a.png
      scene_010_b.png
    /renders/
      scene_010_job_<jobId>.mp4
    /exports/
      timeline.json
      shotlist.csv
      storyboard_contactsheet.png
```

---

# 10. UI設計（画面一覧）

1. **Project一覧**（作品カード）
2. **Project詳細**（章→シーンのツリー + 合計秒数バー）
3. **Scene編集**（プロンプト/秒数/参照画像/ネガティブ/seed）
4. **Storyboard**（候補3枚→採用→差分指示）
5. **Render監視**（ジョブ一覧・進捗・失敗理由・再試行）
6. **Export**（timeline.json / shotlist.csv を生成）

---

# 11. セキュリティ/運用（個人利用の現実解）

- APIキーは **環境変数** or **ローカル暗号化ストア**（ログ出力禁止）
- 生成物・プロンプトのログはローカルのみ
- エラー時に外部へ送らない（Sentry等はオプション）

---

# 12. MVPスコープ（最短で回す）

- Projects + Scenes（CRUD）
- Blueprintドラフト生成（LLM）
- Storyboard 1枚/scene（画像生成 or 参照アップロードでも可）
- Render（Sora だけ先に、Veoは後で追加でもOK）
- Library（一覧） + Export（timeline.json）

---

[1]: https://platform.openai.com/docs/guides/video-generation "Video generation with Sora | OpenAI API"
[2]: https://platform.openai.com/docs/api-reference/videos "Videos | OpenAI API Reference"
[3]: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation "Veo on Vertex AI video generation API  |  Generative AI on Vertex AI  |  Google Cloud Documentation"
[4]: https://platform.openai.com/docs/models/sora-2 "Sora 2 Model | OpenAI API"
