# ここメシ

現在地周辺のご当地料理・穴場・地元で親しまれる飲食店を発見する、スマートフォン中心のWebアプリです。

画面・検索API・ご当地判定を接続済みです。検索条件は範囲・気分・営業中のみ。店舗取得は東京駅周辺の架空店舗を使うモックで、実店舗APIは未接続です。

「デモで試す」→通常モードで、固定座標からHTTP API・判定・画面まで確認できます。詳しくは[API契約](docs/api-contract.md)と[フロント説明](src/app/FRONTEND.md)を参照してください。

## チームと設計資料

- フロントエンド：ふら
- バックエンド・API連携：Yuuto
- 穴場判定・ラベリング：後藤

[共通ルール](AGENTS.md) / [製品仕様](docs/product-spec.md) / [API契約案](docs/api-contract.md) / [アーキテクチャ](docs/architecture.md)

## チームと担当範囲

同じNext.jsプロジェクト内で、以下の範囲を担当します。
ディレクトリは実装予定のものを含みます。

| 担当 | 主な編集範囲 | 実装する内容 |
|---|---|---|
| ふら：フロントエンド | src/app/（api/を除く）、src/components/、src/lib/client/、public/ | 導入アニメーション、ホーム、位置情報取得、絞り込み、結果一覧、店舗詳細、検索APIの呼び出し |
| Yuuto：バックエンド・API連携 | src/app/api/、src/server/restaurants/ | 検索API、入力検証、モック、店舗取得、外部API接続、レスポンス整形 |
| 後藤：穴場判定・ラベリング | src/server/discovery/ | 候補店舗の判定、ラベル、おすすめ理由、判定基準・閾値の設定 |

### 共同で管理するファイル

| 対象 | 変更時の確認先 |
|---|---|
| src/types/：フロントとバックの共有API型 | ふら・Yuuto |
| 候補店舗・判定結果の受け渡し仕様 | Yuuto・後藤 |
| package.json、package-lock.json、各種設定 | チーム全員 |
| AGENTS.md、README.md、docs/ | 変更内容に関係する担当者 |

### 担当間の受け渡し

1. ふらが画面から検索APIを呼び出します。
2. Yuutoが入力を検証し、候補店舗を取得します。
3. 後藤の判定処理が、候補店舗の判定結果・ラベル・理由を返します。
4. Yuutoが検索レスポンスを整え、ふらが画面に表示します。

原則として自分の担当範囲を編集します。他担当の範囲を変更する場合は、
PRで変更理由を説明し、その担当者に確認を依頼します。
API契約を変更する場合は、共有型・モック・API仕様書を一緒に更新します。

## セットアップと確認

package.jsonのあるアプリルートでnpm ci、npm run devを実行し、http://localhost:3000 を開きます。モック検索はキー不要です。通常の現在地検索もモックのため、東京駅から離れた位置では0件です。

```sh
npm run lint
npx tsc --noEmit
npm run build
node scripts/test.mjs
node --test src/server/restaurants/search.test.mjs src/server/discovery/discovery.test.mjs
```

現在の環境ではlintがESLintとTypeScriptプラグインの互換性エラーで停止します。依存整合は別途対応が必要です。

サーバーキーにNEXT_PUBLIC_を付けません。両階層の.gitignoreは.env*を除外しています。実API接続前に費用・取得フィールド・帰属・保存条件を確認します。
