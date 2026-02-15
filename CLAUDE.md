# CLAUDE.md

このファイルは、Claude Code がこのリポジトリで作業する際のガイダンスを提供します。

## 会話ガイドライン

- 常に日本語で会話する

## Git コミットガイドライン

- 常に日本語でコミットメッセージを記載する

## プロジェクト概要

CutCraft は AI 動画生成ワークフローツールです。テーマを入力すると、AI が設計図（シーン構成）を生成し、参考画像、台本、動画を順番に生成できます。

## 開発コマンド

```bash
npm run dev        # 開発サーバー起動
npm run build      # プロダクションビルド
npm run start      # プロダクションサーバー起動
npm run lint       # ESLint チェック
npm run type-check # TypeScript 型チェック
```

## コード品質ルール

コードに変更を行った場合は、**必ず**以下のコマンドを実行してください：

```bash
npm run lint && npm run type-check
```

### 必須事項

- **型チェック**: TypeScript strict mode での型安全性確認
- **Lint 通過**: ESLint ルールに準拠したコード品質
- **エラー解決**: 上記チェックで発見されたエラーの完全解決

## 環境変数

| 変数名 | 説明 | 必須 |
|--------|------|------|
| `OPENAI_API_KEY` | OpenAI API キー（GPT-5.1, DALL-E 3, Sora） | Yes |
| `GOOGLE_AI_API_KEY` | Google AI API キー（Veo, Gemini） | No |

## 技術スタック

- **フレームワーク**: Next.js 14 (App Router)
- **言語**: TypeScript (strict mode)
- **スタイリング**: Tailwind CSS
- **AI API**: OpenAI (GPT-5.1, DALL-E 3, Sora), Google Gemini (Veo, nano-banana-pro)

## ディレクトリ構造

```
cutcraft/
├── app/                # Next.js App Router
│   ├── api/            # API Routes
│   └── projects/       # プロジェクト関連ページ
├── lib/                # ユーティリティ・サービス
├── types/              # TypeScript 型定義
├── data/               # ローカルデータ保存（gitignore）
└── docs/               # ドキュメント
```

## 関連ドキュメント

- `docs/requirements.md` - 要件定義書
- `docs/design.md` - 技術設計書
- `AGENTS.md` - AI エージェント向け詳細ガイド
