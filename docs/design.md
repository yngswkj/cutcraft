# CutCraft 設計書

## 技術スタック

| カテゴリ | 技術 | バージョン |
|---------|------|-----------|
| フレームワーク | Next.js (App Router) | ^14.2.0 |
| 言語 | TypeScript (strict) | ^5 |
| UI | React | ^18.3.0 |
| スタイリング | Tailwind CSS | ^3.3.0 |
| アイコン | lucide-react | ^0.290.0 |
| フォント | Noto Sans JP (next/font/google) | - |
| LLM | OpenAI GPT-4o (openai) | ^4.77.0 |
| 画像生成 | OpenAI DALL-E 3 (openai) | ^4.77.0 |
| 動画生成 | OpenAI Sora (HTTP直接) | - |
| 動画生成 | Google Veo 2 (@google/genai) | ^1.40.0 |
| ID生成 | uuid | ^9.0.0 |
| コード品質 | ESLint + eslint-config-next | ^8 / ^14.2.0 |

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                      ブラウザ (React)                        │
│                                                             │
│  page.tsx ──── page.tsx ──── page.tsx ──── page.tsx          │
│  (home)      (blueprint)  (imageboard)  (script)            │
│                                                             │
│              page.tsx ──── page.tsx                          │
│             (generate)   (complete)                          │
└────────────────────┬────────────────────────────────────────┘
                     │ fetch (REST API)
┌────────────────────▼────────────────────────────────────────┐
│                 Next.js API Routes                           │
│                                                             │
│  /api/projects/*          CRUD 操作                          │
│  /api/blueprint/generate  GPT-4o 呼び出し                    │
│  /api/images/generate     DALL-E 3 呼び出し                  │
│  /api/scripts/generate    GPT-4o 呼び出し                    │
│  /api/videos/generate     Sora / Veo 呼び出し                │
│  /api/videos/status/*     ステータスポーリング                │
│  /api/files/*/*           画像・動画ファイル配信              │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                      ライブラリ層                             │
│                                                             │
│  lib/openai.ts          OpenAI API 統合                      │
│  lib/video-service.ts   動画生成サービス (Sora/Veo)          │
│  lib/project-store.ts   プロジェクトデータ管理               │
│  lib/file-storage.ts    ファイルシステム I/O                  │
│  lib/cost-calculator.ts コスト計算                            │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                    外部サービス                               │
│                                                             │
│  OpenAI API ─── GPT-4o / DALL-E 3 / Sora                   │
│  Google API ─── Veo 2 (Gemini)                              │
│  ffmpeg    ─── 動画フレーム抽出                               │
└─────────────────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                  ローカルファイルシステム                      │
│                                                             │
│  data/projects/{id}/project.json   プロジェクトデータ        │
│  data/projects/{id}/images/*.png   生成画像                  │
│  data/projects/{id}/videos/*.mp4   生成動画                  │
└─────────────────────────────────────────────────────────────┘
```

---

## ディレクトリ構成

```
cutcraft/
├── app/
│   ├── layout.tsx                          # ルートレイアウト
│   ├── page.tsx                            # ホーム（プロジェクト一覧）
│   ├── globals.css                         # グローバルスタイル
│   ├── api/
│   │   ├── projects/
│   │   │   ├── route.ts                    # GET: 一覧, POST: 作成
│   │   │   └── [projectId]/
│   │   │       └── route.ts                # GET/PUT/DELETE
│   │   ├── blueprint/generate/route.ts     # POST: 設計図生成
│   │   ├── images/generate/route.ts        # POST: 画像生成
│   │   ├── scripts/generate/route.ts       # POST: 台本生成
│   │   ├── videos/
│   │   │   ├── generate/route.ts           # POST: 動画生成開始
│   │   │   └── status/[jobId]/route.ts     # GET: ステータス確認
│   │   └── files/[projectId]/
│   │       ├── images/[filename]/route.ts  # GET: 画像配信
│   │       └── videos/[filename]/route.ts  # GET: 動画配信
│   └── projects/[projectId]/
│       ├── page.tsx                        # ワークフローハブ
│       ├── blueprint/page.tsx              # 設計図ステップ
│       ├── imageboard/page.tsx             # イメージボードステップ
│       ├── script/page.tsx                 # 台本ステップ
│       ├── generate/page.tsx               # 動画生成ステップ
│       └── complete/page.tsx               # 完了ページ
├── lib/
│   ├── openai.ts                           # OpenAI API 統合
│   ├── video-service.ts                    # 動画生成サービス
│   ├── project-store.ts                    # プロジェクト CRUD
│   ├── file-storage.ts                     # ファイル I/O
│   └── cost-calculator.ts                  # コスト計算
├── types/
│   └── project.ts                          # 型定義
├── data/                                   # 永続化データ（gitignore）
│   └── projects/{id}/
│       ├── project.json
│       ├── images/
│       └── videos/
└── docs/
    ├── requirements.md                     # 要件定義書（本書）
    └── design.md                           # 設計書（本書）
```

---

## データモデル

### ER図（概念）

```
Project 1 ──── * Scene 1 ──── * SceneImage
                  │
                  └──── * VideoGeneration
```

### Project

| フィールド | 型 | 説明 |
|-----------|------|------|
| id | string (UUID) | 一意識別子 |
| name | string | プロジェクト名 |
| theme | string | テーマ（AI生成の入力） |
| totalDurationSec | number | 目標合計秒数（デフォルト: 120） |
| currentStep | WorkflowStep | 現在のワークフローステップ |
| videoApiPreference | VideoApiPreference | API選択設定 |
| scenes | Scene[] | シーン配列 |
| createdAt | string (ISO 8601) | 作成日時 |
| updatedAt | string (ISO 8601) | 更新日時 |

### Scene

| フィールド | 型 | 説明 |
|-----------|------|------|
| id | string (UUID) | 一意識別子 |
| order | number | 表示順序 |
| title | string | シーンタイトル |
| description | string | シーンの詳細説明 |
| durationSec | number | シーン秒数 |
| styleDirection | string | 映像スタイルキーワード（英語） |
| videoApi | 'sora' \| 'veo' | 使用する動画API |
| images | SceneImage[] | 生成画像配列 |
| selectedImageId | string \| null | 選択画像ID |
| useAsVideoInput | boolean | Image-to-Video フラグ |
| videoPrompt | string | 動画生成プロンプト（英語） |
| promptMetadata | PromptMetadata | プロンプトメタデータ |
| generations | VideoGeneration[] | 動画生成履歴 |
| approvedGenerationId | string \| null | 承認済み動画ID |
| chainFromPreviousScene | boolean | シーンチェーンフラグ |

### SceneImage

| フィールド | 型 | 説明 |
|-----------|------|------|
| id | string (UUID) | 一意識別子 |
| sceneId | string | 所属シーンID |
| prompt | string | 生成プロンプト（revised_prompt） |
| localPath | string | ファイル配信URL |
| width | number | 画像幅（1792） |
| height | number | 画像高さ（1024） |
| createdAt | string (ISO 8601) | 作成日時 |

### VideoGeneration

| フィールド | 型 | 説明 |
|-----------|------|------|
| id | string (UUID) | 一意識別子 |
| sceneId | string | 所属シーンID |
| version | number | バージョン番号 |
| api | 'sora' \| 'veo' | 使用API |
| externalJobId | string | 外部APIのジョブID |
| status | VideoStatus | 生成ステータス |
| prompt | string | 使用したプロンプト |
| inputImagePath | string \| null | 入力画像パス |
| chainedFramePath | string \| null | チェーンフレームパス |
| localPath | string \| null | ダウンロード済み動画パス |
| durationSec | number | 生成秒数 |
| resolution | string | 解像度 |
| estimatedCost | number | 推定コスト（USD） |
| createdAt | string (ISO 8601) | 作成日時 |
| completedAt | string \| null | 完了日時 |

### 列挙型

```typescript
WorkflowStep    = 'blueprint' | 'imageboard' | 'script' | 'generate' | 'complete'
VideoApiPreference = 'auto' | 'sora' | 'veo'
VideoStatus     = 'queued' | 'processing' | 'completed' | 'failed'
```

---

## API 設計

### プロジェクト管理

| メソッド | パス | リクエスト | レスポンス |
|---------|------|-----------|-----------|
| GET | /api/projects | - | Project[] |
| POST | /api/projects | { name, theme } | Project |
| GET | /api/projects/:id | - | Project |
| PUT | /api/projects/:id | Project | Project |
| DELETE | /api/projects/:id | - | { success } |

### AI 生成

| メソッド | パス | リクエスト | レスポンス |
|---------|------|-----------|-----------|
| POST | /api/blueprint/generate | { projectId } | { scenes: Scene[] } |
| POST | /api/images/generate | { projectId, sceneId, prompt } | { image: SceneImage } |
| POST | /api/scripts/generate | { projectId, sceneId } | { videoPrompt, metadata } |

### 動画生成

| メソッド | パス | リクエスト | レスポンス |
|---------|------|-----------|-----------|
| POST | /api/videos/generate | { projectId, sceneId } | { generation: VideoGeneration } |
| GET | /api/videos/status/:jobId?projectId=&sceneId= | - | { generation: VideoGeneration } |

### ファイル配信

| メソッド | パス | レスポンス |
|---------|------|-----------|
| GET | /api/files/:projectId/images/:filename | image/png or image/jpeg |
| GET | /api/files/:projectId/videos/:filename | video/mp4 |

---

## 外部 API 統合

### OpenAI GPT-4o

- **用途**: 設計図生成、台本（動画プロンプト）生成
- **モデル**: `gpt-4o`
- **出力形式**: `response_format: { type: 'json_object' }`
- **温度**: 0.7

#### 設計図生成プロンプト構造

```
System: 映像ディレクターロール
  - 120秒の動画を8-15シーンに分割
  - APIプリファレンスに応じた指示
    - auto: シーン特性に応じてSora/Veoを選択
    - sora: 全シーンSora（最大20秒）
    - veo: 全シーンVeo（最大8秒）
User: テーマ文
```

#### 台本生成プロンプト構造

```
System: 映像プロダクション専門家ロール
  - API別の得意分野を考慮
  - videoPrompt（英語）+ metadata（日本語）を生成
User: シーンタイトル + 説明 + スタイル方向性
```

### OpenAI DALL-E 3

- **用途**: イメージボード画像生成
- **モデル**: `dall-e-3`
- **サイズ**: 1792×1024（16:9横長）
- **品質**: HD
- **出力**: Base64 JSON

### OpenAI Sora

- **用途**: 動画生成
- **接続**: HTTP直接（SDK未対応のため）
- **エンドポイント**: `https://api.openai.com/v1/videos/generations`
- **対応秒数**: 5, 10, 15, 20秒（最寄りに丸め）
- **アスペクト比**: 16:9
- **解像度**: 1280×720
- **コスト**: $0.04/秒（720p）
- **Image-to-Video**: Base64画像を`image_url`として入力

### Google Veo 2

- **用途**: 動画生成
- **接続**: @google/genai SDK
- **モデル**: `veo-2`
- **対応秒数**: 5〜8秒
- **アスペクト比**: 16:9
- **解像度**: 1920×1080
- **コスト**: $0.75/秒
- **非同期**: `generateVideos` → Operation → ポーリング → レスポンス取得

---

## ワークフロー制御

### ステップ遷移

```
blueprint ──→ imageboard ──→ script ──→ generate ──→ complete
    │              │             │            │
    │   [全シーンに  │  [全シーンに  │ [全シーンの │
    │    画像必要]   │   台本必要]  │  動画承認]  │
    ↓              ↓             ↓            ↓
  自由遷移      条件付き遷移   条件付き遷移   条件付き遷移
```

- 前のステップには自由に戻れる
- 次のステップへの遷移には条件がある
- `currentStep` の更新は遷移時に実行

### 動画生成フロー

```
[生成開始] ──→ API呼び出し ──→ [processing]
                                    │
                              ポーリング(5秒)
                                    │
                              ┌─────┴─────┐
                              ↓           ↓
                         [completed]   [failed]
                              │
                         自動ダウンロード
                              │
                         [localPath設定]
                              │
                         ユーザー承認
                              │
                         [approvedGenerationId設定]
```

### シーンチェーンフロー

```
Scene N-1 (承認済み動画)
    │
    │ ffmpeg -sseof -1 (最終フレーム抽出)
    │
    ↓
lastframe.png
    │
    │ image-to-video 入力
    ↓
Scene N (動画生成)
```

**入力画像の優先順位:**
1. チェーンフレーム（`chainFromPreviousScene` が true の場合）
2. 選択画像（`useAsVideoInput` が true の場合）
3. なし（テキストのみ）

---

## コスト計算ロジック

### 単価テーブル

| サービス | 単位 | 価格 |
|---------|------|------|
| Sora 480p | /秒 | $0.02 |
| Sora 720p | /秒 | $0.04 |
| Sora 1080p | /秒 | $0.10 |
| Veo | /秒 | $0.75 |
| Veo (Fast) | /秒 | $0.40 |
| DALL-E 3 HD | /枚 | $0.12 |

### 現在の計算式

```
シーンコスト = durationSec × 単価（API依存）
画像コスト = シーン数 × $0.12
プロジェクト合計 = Σシーンコスト + 画像コスト
```

※ LLM トークンコストは現在計算に含まれていない

---

## UI / デザインシステム

### カラーパレット

| 名前 | 値 | 用途 |
|------|-----|------|
| primary-50 | #f0f4ff | アクティブステップ背景 |
| primary-500 | #5c7cfa | ボタン、アクセントカラー |
| primary-600 | - | プライマリボタン |
| primary-700 | #4263eb | ボタンホバー |
| Sora | bg-blue-50/text-blue-600 | Sora APIバッジ |
| Veo | bg-purple-50/text-purple-600 | Veo APIバッジ |
| 完了 | bg-green-50/text-green-600 | 完了ステータス |

### タイポグラフィ

| 要素 | 設定 |
|------|------|
| フォント | Noto Sans JP (400, 500, 700) |
| font-feature-settings | "palt" 1 |
| 本文 letter-spacing | 0.02em |
| 見出し letter-spacing | 0.04em |
| 本文 line-height | 1.8 |
| 見出し line-height | 1.4 |
| word-break | auto-phrase |
| text-rendering | optimizeLegibility |
| -webkit-font-smoothing | antialiased |

---

## セキュリティ

| 項目 | 対策 |
|------|------|
| APIキー | サーバーサイド（API Routes）でのみ使用、クライアントに露出しない |
| ファイルアクセス | ファイル名バリデーション（`/^[A-Za-z0-9._-]+$/`） |
| 認証 | なし（個人利用のためローカルネットワーク想定） |

---

## 未設計・検討事項

### 1. データバックアップ

- 現在のローカルファイルストレージにはバックアップ機構がない
- プロジェクトデータのエクスポート/インポート機能の検討

### 2. 並行生成の制御

- 複数シーンの同時動画生成時のレート制限対応
- API側のレート制限に対するバックオフ戦略

### 3. 大容量データ管理

- 動画ファイルの蓄積によるディスク容量の管理
- 不要な中間データ（未承認動画）のクリーンアップ

### 4. Veo image-to-video

- `@google/genai` SDKのimage-to-video入力形式が正式仕様と一致するか未検証
- config.image の構造がSDKバージョンアップで変更される可能性

### 5. ffmpeg 依存

- シーンチェーン機能はシステムにffmpegがインストールされていることが前提
- Windowsでのffmpegパス解決の確認
- ffmpegが未インストールの場合のフォールバック（エラーメッセージ表示）

### 6. キャラクター参照画像アンカー（将来拡張）

- 現在は Character Bible のテキスト制約で人物同一性を担保している
- より高い再現性のため、キャラクターごとに `anchorImagePath` を持ち、画像生成時に参照画像として入力する設計を検討
- 参照入力対応モデルを優先利用し、非対応モデルではテキスト制約のみでフォールバックする

### 7. 自動整合性検証と再生成（将来拡張）

- 画像生成後に Vision モデルで「Character Bible との一致度」を自動判定する設計を検討
- 不一致時は補正プロンプト付きで再生成（例: 最大2回）し、人物属性のドリフトを吸収
- 判定理由と再生成履歴を `SceneImage` メタデータとして保持し、UIで確認できるようにする
