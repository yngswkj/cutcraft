# CutCraft

AI動画生成ツール - テーマから短編動画を自動生成

## 概要

CutCraftは、1つのテーマから2分程度の動画を構成し、シーンごとの動画クリップを生成するAI動画制作支援ツールです。OpenAI SoraやGoogle Veoなどの動画生成APIを活用し、ストーリーボードから最終的な動画クリップまでを一貫して管理します。

## 主な機能

### 📋 ワークフロー

1. **テーマから設計図生成 (Blueprint)**
   - テーマ・目的・トーン等を入力
   - 章構成とシーン構成を自動生成
   - 秒数配分を最適化

2. **設計図の調整**
   - 章・シーンの並び替え
   - シーン秒数の調整（4/8/12秒）
   - スタイル・トーンの統一

3. **イメージボード作成 (Storyboard)**
   - 各シーンの参照画像を生成
   - 複数案から選択可能
   - 視覚的なプレビュー

4. **イメージボードの調整**
   - シーン別の差分指示
   - 再生成履歴の管理
   - 画像から動画への引き継ぎ

5. **台本生成 (Scene Script)**
   - 映像指示の詳細化
   - ナレーション原稿
   - 編集メモの追加

6. **動画生成 (Render)**
   - シーンごとに動画クリップを生成
   - Sora / Veo APIの自動選択
   - 非同期ジョブ管理

7. **作品管理 (Library)**
   - 生成済み動画の一覧
   - プレビュー再生
   - エクスポート機能

## 技術スタック

- **フレームワーク**: Next.js 14 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS
- **AI API**: OpenAI (Sora), Google Vertex AI (Veo)
- **データ保存**: ローカルファイルシステム（JSON）
- **アイコン**: Lucide React

## セットアップ

### 前提条件

- Node.js 20以上
- OpenAI APIキー（Sora使用時）
- Google Cloud APIキー（Veo使用時）

### インストール

```bash
# リポジトリをクローン
git clone https://github.com/yngswkj/cutcraft.git
cd cutcraft

# 依存関係をインストール
npm install
```

### 環境変数の設定

プロジェクトルートに `.env.local` ファイルを作成：

```env
# OpenAI API (Sora)
OPENAI_API_KEY=your_openai_api_key

# Google Cloud API (Veo) - 任意
GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json
```

### 開発サーバーの起動

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開く

## 使い方

### 1. 新規プロジェクト作成

1. ホーム画面で「新規プロジェクト」をクリック
2. プロジェクト名とテーマを入力
3. 「作成」ボタンをクリック

### 2. 設計図生成

- 自動生成された設計図を確認
- 必要に応じて章構成やシーン構成を調整
- スタイル設定を統一

### 3. イメージボード作成

1. 各シーンの「画像生成」をクリック
2. 生成された画像を確認
3. 気に入った画像を選択

### 4. 動画生成

1. 「動画生成」タブに移動
2. 生成したいシーンを選択
3. 生成開始ボタンをクリック
4. 生成完了を待つ

### 5. エクスポート

- 完成した動画クリップをダウンロード
- 外部の動画編集ソフトで最終編集

## プロジェクト構造

```
cutcraft/
├── app/                    # Next.js アプリケーション
│   ├── api/               # API Routes
│   │   ├── blueprint/     # 設計図生成
│   │   ├── projects/      # プロジェクト管理
│   │   └── videos/        # 動画生成
│   ├── projects/          # プロジェクト詳細ページ
│   ├── globals.css        # グローバルスタイル
│   ├── layout.tsx         # レイアウト
│   └── page.tsx           # ホームページ
├── lib/                   # ユーティリティ
│   ├── cost-calculator.ts # コスト計算
│   ├── file-storage.ts    # ファイル保存
│   ├── openai.ts          # OpenAI API
│   ├── project-store.ts   # プロジェクト管理
│   └── video-service.ts   # 動画生成サービス
├── types/                 # TypeScript 型定義
│   └── project.ts         # プロジェクト型
├── docs/                  # ドキュメント
│   ├── project-idea-GPT.md
│   └── project-idea-GEMINI.md
└── data/                  # データ保存先（自動生成）
```

## API仕様

### OpenAI Sora

- **モデル**: `sora-2`, `sora-2-pro`
- **動画長**: 4秒、8秒、12秒
- **解像度**: 720x1280, 1280x720, 1024x1792, 1792x1024
- **参照**: https://platform.openai.com/docs/api-reference/videos

### Google Veo

- **モデル**: Veo2, Veo3
- **動画長**: Veo2 (5-8秒), Veo3 (4/6/8秒)
- **アスペクト比**: 16:9, 9:16
- **解像度**: 720p, 1080p, 4K（一部）

## 開発コマンド

```bash
# 開発サーバー起動
npm run dev

# 本番ビルド
npm run build

# 本番サーバー起動
npm run start

# リント実行
npm run lint

# 型チェック
npm run type-check
```

## 制限事項

### 現在の実装範囲

- プロジェクト作成と管理
- 設計図の自動生成
- 動画生成ジョブの投入と監視
- ローカルファイルストレージ

### 今後の実装予定

- 実際の動画生成（Sora/Veo API連携）
- イメージボード機能の完全実装
- 台本編集機能
- コスト見積もり機能
- ジョブキュー管理

### Non-goals（実装しない機能）

- クリップ同士の自動結合
- テロップ・BGMの自動挿入
- ユーザー認証・課金機能
- 公開リンク・共有機能

## ライセンス

Private

## 作者

[@yngswkj](https://github.com/yngswkj)

## 参考リソース

- [OpenAI Video API Documentation](https://platform.openai.com/docs/api-reference/videos)
- [Google Vertex AI Veo Documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos)
- [Next.js Documentation](https://nextjs.org/docs)

---

**Note**: このツールは個人利用を想定しており、最短で動作することを優先しています。外部の動画編集ソフトとの連携を前提とした設計になっています。
