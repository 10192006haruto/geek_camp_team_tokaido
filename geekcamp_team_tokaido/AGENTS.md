<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## ここメシ：チーム共通ルール

旅行先・外出先で、現在地周辺のご当地料理・穴場・地元で親しまれる飲食店を発見する、スマートフォン中心のWebアプリです。

- フロントエンド：ふら。バックエンド・API連携：Yuuto。穴場判定・ラベリング：後藤。
- 同じNext.jsプロジェクト内で責務を分離します。別サーバーやGoは導入しません。TypeScriptを基本とし、既存構成・依存関係を尊重します。
- 現在は初期テンプレートです。今回の成果物はMarkdownのみで、下記の配置・API・画面は実装予定です。

### 配置と契約

- `src/app/`：ページ・レイアウト、`src/app/api/`：HTTP境界。
- `src/components/`：UI、`src/lib/client/`：同一オリジンの検索APIクライアント。
- `src/types/`：共有API型。サーバー専用モジュールを混ぜません。
- `src/server/restaurants/`：店舗取得・モック・検索処理、`src/server/discovery/`：判定・ラベリング・設定。
- `docs/`：製品仕様、API契約、担当境界。詳細は[設計](docs/architecture.md)を参照してください。
- API契約を変更したら、共有型・モック・[API仕様書](docs/api-contract.md)を同時に更新します。実装前の段階では型案も仕様書で管理します。
- 未知は`null`、実測のゼロは`0`です。営業不明と営業していない状態も区別します。
- レビュー数の少なさだけで「地元で愛される」「ご当地料理がある」と断定しません。理由には取得情報の裏付けが必要です。

### 変更・安全・確認

- 作業前に`git status`と差分を確認し、既存のユーザー変更を上書きしません。依頼のないコミット・push・デプロイ・有料API呼び出しは行いません。
- 秘密情報をコミットせず、位置情報やAPIキーを不要にログ出力しません。サーバーキーに`NEXT_PUBLIC_`を付けません。
- リポジトリルートとアプリルートの両方の`.gitignore`を確認します。現状は両方が`.env*`を除外しています。将来`.env.example`を作る場合は、そのファイルだけを例外にし、秘密値を入れず、`git check-ignore -v`で最終状態を確認します。
- UIから外部店舗API・Geminiを直接呼び出しません。実APIの利用可否・料金・取得項目・帰属要件は確認後に記録します。
- 未確定のプロダクト判断を確定事項にしません。仕様変更は[製品仕様](docs/product-spec.md)の未確定事項と整合させます。
- Markdown変更はリンク・仕様整合・`git diff --check`を確認します。実装変更は`npm run lint`、`npx tsc --noEmit`、必要に応じ`npm run build`をアプリルートで実行します。ルート型生成が必要なら先に`npx next typegen`を実行します。
- ロジック変更では入力境界・null・0件・エラー・リクエスト競合を優先して検証します。UI変更ではキーボード・フォーカス・位置情報拒否・戻る操作・動きを減らす設定を確認します。未実施や環境制約は報告します。
- コードを書く前に、このファイル冒頭の指示に従い、インストール済みNext.jsの関連ガイドを読みます。
