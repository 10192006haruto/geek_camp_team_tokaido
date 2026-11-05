# ここメシ

現在地周辺のご当地料理・穴場・地元で親しまれる飲食店を発見する、スマートフォン中心のWebアプリです。

**現在はNext.jsの初期テンプレートです。今回の変更はドキュメントのみで、検索UI・検索API・モック・共有型の実装はまだありません。**

## チームと設計資料

- フロントエンド：ふら
- バックエンド・API連携：Yuuto
- 穴場判定・ラベリング：後藤

[共通ルール](AGENTS.md) / [製品仕様](docs/product-spec.md) / [API契約案](docs/api-contract.md) / [アーキテクチャ](docs/architecture.md)

## clone後のセットアップ

リポジトリをcloneした後、`package.json`があるアプリディレクトリで実行します。

```bash
cd geek_camp_team_tokaido/geekcamp_team_tokaido
npm ci
npm run dev
```

上記のcdはclone先の親ディレクトリからの例です。既にリポジトリルートにいる場合は`cd geekcamp_team_tokaido`、既にアプリルートならcd不要です。起動後は http://localhost:3000 を開きます。現時点では初期画面が表示されます。編集対象は`src/app/page.tsx`です。

npmと既存の`package-lock.json`を使用します。Node.jsのチーム推奨バージョンは未決定で、導入時にインストール対象Next.jsの要件を確認してください。環境変数・外部APIキーは現在の初期画面には不要です。

調査時点の`package.json`はNext.js 16.4.4、React 19.3.0です。`package.json`とロックファイルには既存の未コミット変更があり、`eslint-config-next`は`^15.5.29`となっています。Next.jsとの組み合わせは未検証で、この文書作成では変更していません。今回`npm ci`も実行していないため、インストール成功を保証する記録ではありません。

## モックの利用予定

キー不要の架空店舗を、`POST /api/restaurants/search`経由で取得する計画です。**現時点では起動用スイッチやモック検索機能はありません。** 実装時に利用手順をここへ追記します。固定座標を利用する開発操作では、その旨を画面に表示します。実API利用可能という意味ではありません。

環境変数ファイルはリポジトリ・アプリ両方の`.gitignore`で除外されています。今回は`.env.example`も作りません。将来追加する際はダミー値のみとし、そのファイルだけ追跡可能にしてください。キーの境界は[設計](docs/architecture.md)を参照してください。

## 検証コマンド

アプリルートで実行します。

```bash
npm run lint
npx next typegen
npx tsc --noEmit
npm run build
```

`next typegen`はルート型生成用です。既存スクリプトは`dev`、`build`、`start`、`lint`で、`test`・`typecheck`スクリプトはありません。テストランナーも未導入です。ビルド後の起動は`npm run start`です。既存の`next/font/google`によるフォント取得等が環境のネットワーク制限の影響を受ける可能性があります。

Markdownのみの変更ではリンク・記載内容と`git diff --check`を確認します。上記の実装検証は今回未実施です。将来の受け入れ確認項目は[設計の検証計画](docs/architecture.md#実装後の検証計画)を参照してください。

## 既存テンプレートの案内

以下は従来のREADMEを保存したものです。ここメシのセットアップには上記のnpm手順と`src/app/page.tsx`のパスを使用してください。下記のデプロイ案内はテンプレート由来で、今回デプロイは行いません。

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
