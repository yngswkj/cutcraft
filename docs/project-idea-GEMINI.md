## 1. システムアーキテクチャ概要

フロントエンドとバックエンドを一体化させた構成で、データの永続化には手軽でポータブルなSQLiteを使用します。

### 技術スタック (Tech Stack)

- **Framework:** Next.js (App Router) - TypeScript
- _選定理由:_ フロント・バックエンドを単一プロジェクトで完結でき、APIルートの実装も容易。最近関心を持たれている技術領域とも合致。

- **UI Library:** Shadcn/ui + Tailwind CSS
- _選定理由:_ コンポーネントのコピペで素早くUI構築が可能。

- **Database:** SQLite (via Prisma ORM)
- _選定理由:_ サーバー不要でローカルファイルとして管理できるため、個人利用に最適。

- **State Management:** Zustand
- _選定理由:_ シーン管理など複雑なクライアントサイドの状態管理をシンプルにするため。

- **AI Access:** OpenAI SDK (or Vercel AI SDK)
- _選定理由:_ LLM (GPT-4o/Gemini) や画像生成、およびSora/Veo APIへの統一的なインターフェースとして使用。

---

## 2. データ構造の設計 (The "Blueprint")

このシステムの核となる「設計図」のJSONスキーマ定義です。これが動画の構成要素になります。

```typescript
// types/video.ts

type Project = {
  id: string;
  theme: string; // ユーザー入力テーマ (例: "サイバーパンクな東京の夜")
  stylePrompt: string; // 全体の一貫性を保つためのスタイル定義
  totalDuration: number; // 目標尺 (例: 120秒)
  createdAt: Date;
  scenes: Scene[];
};

type Scene = {
  id: string;
  order: number; // シーン順序
  duration: number; // 秒数 (例: 5秒)

  // Step 1-2: 構成フェーズ
  description: string; // シーンの状況説明
  cameraWork: string; // "Pan Right", "Zoom In" など

  // Step 3-4: イメージボードフェーズ
  imagePrompt: string; // 画像生成用プロンプト (自動生成 + 調整)
  imageUrl: string | null; // 生成された画像のローカルパス

  // Step 5-6: 動画・台本フェーズ
  script: string; // ナレーション/セリフ
  videoPrompt: string; // 動画生成APIに投げる最終プロンプト
  videoUrl: string | null; // 生成された動画のローカルパス
  status: "draft" | "image_ready" | "video_processing" | "completed";
};
```

---

## 3. 機能モジュール詳細設計

各ステップを実装レベルのロジックに落とし込みます。

### Step 1 & 2: 設計図の生成と調整 (Blueprint Builder)

- **Input:** テーマ、ジャンル、トーン
- **Process:**
- LLM (GPT-4o等) に「総尺120秒になるように、5秒刻みのシーンを24個生成せよ」と指示。
- JSON形式で出力させ、フロントエンドのドラッグ＆ドロップ可能なリスト（`dnd-kit`推奨）に展開。

- **UI:** シーンの並び替え、削除、追加、秒数調整機能。合計時間が「120秒」になっているか常にバリデーション表示。

### Step 3 & 4: イメージボード作成 (Visualizer)

- **Core Logic:**
- **一貫性維持 (Consistency):** プロジェクト設定の `stylePrompt` を全ての画像生成プロンプトの先頭/末尾に付与します。
- **並列処理:** 生成ボタン押下時、全シーンのAPIリクエストを `Promise.all` ではなく、レートリミットを考慮して `p-limit` 等で並列数（例: 3並列）を制御しながら実行。

- **Storage:** 生成された画像は `public/projects/{projectId}/images/` に保存。

### Step 5: シーン別台本作成 (Script Writer)

- **Process:**
- LLMに対し、「前のシーンの画像内容」と「次のシーンの画像内容」をコンテキストとして与え、つなぎが自然なナレーションや、そのシーンで必要な環境音（Sound Prompt）を生成させます。
- ここで「動画生成用のプロンプト（動きの指定）」も最終決定します。

### Step 6: 動画生成 (Video Synthesizer)

- **Integration:** Sora/Veo APIのエンドポイントを叩きます。
- **Payload Example (Pseudo-code):**

```json
{
  "model": "sora-2.0",
  "prompt": scene.videoPrompt + " high quality, 8k",
  "image_start": scene.imageUrl, // I2V機能を使用
  "duration": scene.duration,
  "aspect_ratio": "16:9"
}

```

- **Async Handling:** 動画生成は時間がかかるため、バックグラウンドジョブ（またはNext.jsのAPIルートでのポーリング処理）として実装し、UIには進捗ステータスを表示します。

### Step 7: 一覧・プレビュー (Gallery)

- **Feature:**
- 生成された動画をローカルファイルシステムから読み込み、一覧表示。
- **Grid View:** 全シーンを並べて再生（簡易プレビュー）。
- **Export:** 素材リスト（動画ファイル、台本テキスト、結合順序指示書）をZipでまとめる機能があると、外部編集ソフトへの連携がスムーズです。

---

## 4. ディレクトリ構成案

Next.js (App Router) を想定した構成です。

```text
my-video-generator/
├── prisma/
│   └── schema.prisma      // SQLiteのDBスキーマ定義
├── public/
│   └── projects/          // 生成物（画像・動画）の保存先
├── src/
│   ├── app/
│   │   ├── api/           // AI処理やファイル操作のエンドポイント
│   │   ├── projects/      // プロジェクト一覧・詳細画面
│   │   └── page.tsx
│   ├── components/
│   │   ├── BlueprintEditor.tsx  // シーン並び替えUI
│   │   ├── ImageBoard.tsx       // 画像生成・確認UI
│   │   └── VideoGallery.tsx     // 動画一覧UI
│   ├── lib/
│   │   ├── ai-client.ts   // LLM/画像/動画生成APIクライアント
│   │   └── db.ts          // Prismaクライアント
│   └── services/
│       ├── generator.ts   // プロンプト生成ロジック
│       └── file-system.ts // ローカルファイル保存ロジック
└── package.json

```

---

## 5. 開発の進め方（SE視点での推奨パス）

1. **Phase 1: 「骨組み」の実装**

- Next.jsのセットアップとPrisma(SQLite)の接続。
- 「プロジェクト作成 → シーン情報をDBに保存」までのCRUDを作る。

2. **Phase 2: 「静止画」の連携**

- OpenAI (DALL-E 3) などのAPIを繋ぎ、シーンごとの画像生成とローカル保存を実装。
- ここまでで「紙芝居」ができる状態になります。

3. **Phase 3: 「動画」の連携**

- Sora2/Veo APIの実装。まずは1シーンだけでテストし、その後にループ処理を実装。

4. **Phase 4: UIの洗練**

- Shadcn/uiを使って見た目を整え、ドラッグ＆ドロップなどの操作性を向上。
