# ここメシ

現在地周辺のご当地料理・穴場・地元で親しまれる飲食店を発見する、スマートフォン中心のWebアプリです。

検索条件は範囲・気分・営業中のみ。検索APIは、周辺店舗のクチコミから料理名と根拠の引用を抽出し、最大5件を返します（[MVP仕様](docs/review-dishes-mvp-spec.md)）。

- 実API（`places`）：Google Places の Nearby Search で最大20店舗・各最大5件のクチコミを取得 → Gemini で料理を抽出 → 引用を原文と照合 → 営業条件・気分 → 最大5件。実店舗での動作は未確認です。
- モック（`mock`）：東京駅周辺の架空店舗と固定の抽出結果。外部通信なし・キー不要。

ご当地判定（`src/server/discovery/` の郷土料理照合）は現在の検索経路では使っていません。詳しくは[API契約](docs/api-contract.md)と[フロント説明](src/app/FRONTEND.md)を参照してください。

## チームと設計資料

- フロントエンド、クチコミからの料理抽出（Gemini・プロンプト）：ふら
- バックエンド・API連携：Yuuto
- 設計（判定・抽出方針の確認）：後藤

[共通ルール](AGENTS.md) / [製品仕様](docs/product-spec.md) / [API契約案](docs/api-contract.md) / [アーキテクチャ](docs/architecture.md)

## チームと担当範囲

同じNext.jsプロジェクト内で、以下の範囲を担当します。
ディレクトリは実装予定のものを含みます。

| 担当 | 主な編集範囲 | 実装する内容 |
|---|---|---|
| ふら：フロントエンド | src/app/（api/を除く）、src/components/、src/lib/client/、public/ | 導入アニメーション、ホーム、位置情報取得、絞り込み、結果一覧、店舗詳細、検索APIの呼び出し |
| Yuuto：バックエンド・API連携 | src/app/api/、src/server/restaurants/ | 検索API、入力検証、モック、店舗取得、外部API接続、レスポンス整形 |
| ふら：料理抽出・判定（後藤から引き継ぎ） | src/server/discovery/ | Geminiによるクチコミからの料理抽出・プロンプト・構造検証、既存のご当地判定 |
| 後藤：設計 | （コードは編集しない） | 判定・抽出方針の設計確認 |

### 共同で管理するファイル

| 対象 | 変更時の確認先 |
|---|---|
| src/types/：フロントとバックの共有API型 | ふら・Yuuto |
| 候補店舗・抽出結果の受け渡し仕様（src/server/discovery/review-types.ts） | Yuuto・ふら（方針は後藤） |
| package.json、package-lock.json、各種設定 | チーム全員 |
| AGENTS.md、README.md、docs/ | 変更内容に関係する担当者 |

### 担当間の受け渡し

1. ふらが画面から検索APIを呼び出します。
2. Yuutoが入力を検証し、候補店舗とクチコミを取得します。
3. ふらの抽出処理（inferMenus）が、クチコミから料理名と引用を返します。
4. 引用を照合して検索レスポンスを整え（Yuuto・ふら）、ふらが画面に表示します。

原則として自分の担当範囲を編集します。他担当の範囲を変更する場合は、
PRで変更理由を説明し、その担当者に確認を依頼します。
API契約を変更する場合は、共有型・モック・API仕様書を一緒に更新します。

## セットアップと確認

package.jsonのあるアプリルートでnpm ci、npm run devを実行し、http://localhost:3000 を開きます。

### 店舗データの取得元（モック／実API）

アプリルートの`.env.example`をコピーして`.env.local`を作り、`RESTAURANT_DATA_SOURCE`で取得元を選びます。変更後は`npm run dev`を再起動してください。

| RESTAURANT_DATA_SOURCE | 動作 | 必要なキー |
|---|---|---|
| `mock` | 架空店舗と固定の抽出結果。外部通信なし | なし |
| `places` | Nearby Search と Gemini を実際に呼ぶ（**有料APIの利用が発生**） | `GOOGLE_PLACES_API_KEY`、`GEMINI_API_KEY` |
| 未設定 | 開発中は`mock`。本番（`NODE_ENV=production`）では503 | — |

- モックは東京駅周辺の店舗だけを返すため、離れた現在地では0件です。
- `places`でキーが未設定・権限不足（403）・利用上限（429）のときは503を返し、モックへは切り替えません。
- 検索全体（Places＋Gemini＋照合）の期限は10秒で、超えると504です。
- Places は`places.reviews`を含むため Nearby Search Enterprise + Atmosphere の料金区分です。Google Cloud で Places API (New) を有効にし、1日の割り当て上限を設定してから使ってください（料金の根拠は[型と受け渡しの案](docs/review-menu-inference-proposal.md)）。
- サーバーキーに`NEXT_PUBLIC_`を付けません。`.env.local`は両階層の`.gitignore`で除外され、`.env.example`だけを追跡します。`.env.example`にはダミー値以外を書きません。

### 確認コマンド

```sh
npm run lint
npx tsc --noEmit
npm run build
node scripts/test.mjs
node --test src/server/restaurants/*.test.mjs src/server/discovery/*.test.mjs
```

自動テストは外部APIを呼びません。現在の環境ではlintがESLintとTypeScriptプラグインの互換性エラーで停止します。依存整合は別途対応が必要です。

実API利用前に、クチコミの表示・帰属・保存条件、Gemini への送信可否を確認します。
