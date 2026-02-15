# AGENTS.md - CutCraft AI エージェントガイドライン

このファイルは、AI コーディングエージェント（Claude Code、GitHub Copilot、Cursor 等）がこのプロジェクトで効果的に作業するための包括的なガイドラインを提供します。

## プロジェクト概要

**CutCraft** は AI 動画生成ワークフローツールです。ユーザーがテーマを入力すると、AI が以下の 5 段階のワークフローで短編動画（約 2 分）を自動生成します。

### ワークフロー

1. **Blueprint（設計図）** - テーマから 8-15 シーンの構成を AI が生成
2. **Imageboard（イメージボード）** - 各シーンの参考画像を生成（gpt-image / Gemini）
3. **Script（台本）** - 動画生成用プロンプトを AI が作成
4. **Generate（動画生成）** - Sora / Veo 3.1 Fast で動画クリップを生成
5. **Complete（完了）** - 承認済み動画の確認・プレビュー

## 技術スタック

| カテゴリ       | 技術                                        |
| -------------- | ------------------------------------------- |
| フレームワーク | Next.js 14 (App Router)                     |
| 言語           | TypeScript (strict mode)                    |
| スタイリング   | Tailwind CSS                                |
| LLM            | OpenAI GPT-5.1                              |
| 画像生成       | gpt-image, Gemini (nano banana pro)         |
| 動画生成       | Sora 2 / Sora 2 Pro, Veo 3.1 Fast           |
| データ保存     | ローカルファイルシステム（JSON + バイナリ） |

## ディレクトリ構造

```
cutcraft/
├── app/                           # Next.js App Router
│   ├── layout.tsx                 # ルートレイアウト
│   ├── page.tsx                   # ホーム（プロジェクト一覧）
│   ├── api/                       # API Routes
│   │   ├── blueprint/generate/    # 設計図生成
│   │   ├── images/generate/       # 画像生成
│   │   ├── scripts/generate/      # 台本生成
│   │   ├── videos/                # 動画生成・ステータス確認
│   │   ├── projects/              # プロジェクト CRUD
│   │   ├── files/                 # ファイル配信
│   │   └── settings/              # 設定管理
│   └── projects/[projectId]/      # プロジェクト詳細ページ
│       ├── page.tsx               # ワークフローハブ
│       ├── blueprint/             # ステップ 1
│       ├── imageboard/            # ステップ 2
│       ├── script/                # ステップ 3
│       ├── generate/              # ステップ 4
│       └── complete/              # ステップ 5
│
├── lib/                           # サービス層・ユーティリティ
│   ├── openai.ts                  # OpenAI/Gemini API 統合
│   ├── video-service.ts           # Sora/Veo 動画生成サービス
│   ├── project-store.ts           # プロジェクト CRUD 操作
│   ├── settings.ts                # 設定管理・プロンプトテンプレート
│   ├── file-storage.ts            # ファイル I/O
│   ├── cost-calculator.ts         # コスト計算
│   └── scene-models.ts            # シーンモデル補助関数
│
├── types/                         # TypeScript 型定義
│   ├── project.ts                 # Project, Scene, VideoGeneration 等
│   └── settings.ts                # Settings 関連型
│
├── data/                          # ローカルデータ（gitignore）
│   ├── projects/{id}/             # プロジェクトデータ
│   │   ├── project.json           # メタデータ
│   │   ├── images/                # 生成画像
│   │   └── videos/                # 生成動画
│   └── settings.json              # グローバル設定
│
└── docs/                          # ドキュメント
    ├── requirements.md            # 要件定義書
    └── design.md                  # 技術設計書
```

## 主要モジュール

### lib/openai.ts

OpenAI/Gemini API との統合を担当。

| 関数                    | 説明                                  |
| ----------------------- | ------------------------------------- |
| `generateBlueprint()`   | テーマからシーン構成を生成（GPT-5.1） |
| `generateImage()`       | 参考画像を生成（gpt-image / Gemini）  |
| `generateVideoScript()` | 動画生成用プロンプトを作成            |

### lib/video-service.ts

Sora/Veo 動画生成の統合管理。

| 関数                     | 説明                               |
| ------------------------ | ---------------------------------- |
| `startVideoGeneration()` | 動画生成ジョブを開始               |
| `checkVideoStatus()`     | ジョブステータスを確認             |
| `downloadVideo()`        | 完成動画をダウンロード             |
| `extractLastFrame()`     | シーンチェーン用の最終フレーム抽出 |

### lib/project-store.ts

プロジェクトデータの CRUD 操作。

| 関数              | 説明                               |
| ----------------- | ---------------------------------- |
| `listProjects()`  | 全プロジェクト一覧（更新日時降順） |
| `getProject()`    | プロジェクト取得                   |
| `createProject()` | 新規作成                           |
| `updateProject()` | 更新                               |
| `deleteProject()` | 削除                               |

### lib/settings.ts

設定管理とプロンプトテンプレート。

| 関数                     | 説明                                                 |
| ------------------------ | ---------------------------------------------------- |
| `getEffectiveSettings()` | 有効な設定を取得（ファイル > 環境変数 > デフォルト） |
| `saveSettings()`         | 設定を保存                                           |
| `buildBlueprintPrompt()` | 設計図生成用プロンプトを構築                         |

## 型定義

### types/project.ts

```typescript
// プロジェクト全体
interface Project {
  id: string;
  theme: string;
  currentStep: "blueprint" | "imageboard" | "script" | "generate" | "complete";
  videoApiPreference: "auto" | "sora" | "veo";
  scenes: Scene[];
  // ...
}

// 個別シーン
interface Scene {
  id: string;
  title: string;
  description: string;
  durationSec: number;
  videoApi: "sora" | "veo";
  images: SceneImage[];
  generations: VideoGeneration[];
  // ...
}

// 動画生成情報
interface VideoGeneration {
  id: string;
  api: "sora" | "veo";
  status: "queued" | "processing" | "completed" | "failed";
  externalJobId?: string;
  videoLocalPath?: string;
  estimatedCost: number;
  // ...
}
```

## API ルート

| エンドポイント               | メソッド         | 説明                   |
| ---------------------------- | ---------------- | ---------------------- |
| `/api/projects`              | GET, POST        | プロジェクト一覧・作成 |
| `/api/projects/[id]`         | GET, PUT, DELETE | プロジェクト CRUD      |
| `/api/blueprint/generate`    | POST             | 設計図生成             |
| `/api/images/generate`       | POST             | 画像生成               |
| `/api/scripts/generate`      | POST             | 台本生成               |
| `/api/videos/generate`       | POST             | 動画生成開始           |
| `/api/videos/status/[jobId]` | GET              | 動画生成ステータス確認 |
| `/api/settings`              | GET, PUT         | 設定管理               |

## コーディング規約

### 言語・形式

- TypeScript strict mode 必須
- 関数型アプローチ優先（純粋関数、副作用の分離）
- async/await 使用（Promise チェーン回避）

### 命名規則

- 関数: camelCase（例: `generateBlueprint`）
- 型/インターフェース: PascalCase（例: `VideoGeneration`）
- 定数: UPPER_SNAKE_CASE（例: `SAFE_ID_REGEX`）
- ファイル: kebab-case（例: `video-service.ts`）

### エラーハンドリング

- API ルートでは try-catch で全エラーをキャッチ
- `NextResponse.json({ error: message }, { status: code })` 形式で返却
- 詳細なエラー情報は `summarizeErrorDetail()` で整形

## 共通パターン

### 入力値検証

```typescript
// ID検証
const SAFE_ID_REGEX = /^[A-Za-z0-9-]+$/;
if (!SAFE_ID_REGEX.test(projectId)) {
  return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
}

// ファイルパス検証
const SAFE_IMAGE_PATH_REGEX = /^images\/[A-Za-z0-9._-]+$/;
```

### Sora モデレーション対策

```typescript
// Sora 固有のモデレーション
const moderation = await runSoraTextModeration(prompt);
if (moderation.flagged) {
  prompt = sanitizePromptForModeration(prompt);
  // 再試行
}
```

### シーンチェーン（前シーンの最終フレームを次シーンの入力に使用）

```typescript
if (chainFromPreviousScene) {
  const lastFrame = await extractLastFrame(previousSceneVideoPath);
  // lastFrame を入力画像として使用
}
```

## セキュリティ考慮事項

- API キーはサーバーサイドのみで使用（クライアントに露出しない）
- ファイルパスは必ず正規表現で検証
- ユーザー入力のプロンプトはモデレーション API でチェック
- エラーメッセージは 2000 文字以下に切り詰め

## 変更時の注意

1. **ワークフロー順序**: 5 段階の順序を維持（Blueprint → ... → Complete）
2. **データ互換性**: Project/Scene の構造変更時は既存データの互換性を考慮
3. **API 命名**: 既存の API ルート命名規則を遵守
4. **型安全**: 新規関数には適切な型注釈を付与
5. **画像モデル制約**: 画像生成は `gpt-image*` か `nanobananapro`（`gemini-3-pro-image-preview`）のみを使用
6. **フォールバック禁止**: 未対応モデルへ自動フォールバックしない。明示的にエラーを返して修正させる
7. **Veoモデル制約**: Veo系は `veo-3.1-fast` を使用し、旧Veoモデル指示を新規追加しない
8. **無駄な後方互換性禁止**: 不要な後方互換性のためにコードを複雑化しない。必要な場合は明確なドキュメントとコメントを追加

## 関連ドキュメント

- `CLAUDE.md` - Claude Code 固有の設定
- `docs/requirements.md` - 要件定義書（実装済み/未実装機能）
- `docs/design.md` - 技術設計書（アーキテクチャ詳細）
