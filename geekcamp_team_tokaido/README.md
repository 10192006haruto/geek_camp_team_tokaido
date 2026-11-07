# ここメシ

現在地周辺のご当地料理・穴場・地元で親しまれる飲食店を発見する、スマートフォン中心のWebアプリです。

検索条件は範囲・気分・営業中のみ。検索APIは、周辺店舗のクチコミから料理名と根拠の引用を抽出し、最大5件を返します（[MVP仕様](docs/review-dishes-mvp-spec.md)）。

## 検索の流れ

- 実API（`places`）：
  1. Google Places の Nearby Search で、現在地から近い順に最大20店舗・各最大5件のクチコミと営業時間を取得
  2. 全国展開している飲食チェーンを店名リストで除外
  3. Gemini で、クチコミから料理名と根拠の引用を抽出（5店舗ずつ並行）
  4. 引用がクチコミの原文にあるかを照合し、料理を確認できた店舗だけを残す
  5. 営業条件・気分で選び、最大5件に絞る
  6. 最終候補の写真を Place Photos で取得
- モック（`mock`）：東京駅周辺の架空店舗と固定の抽出結果。外部通信なし・キー不要。

実データ（東京駅・半径1km）で、検索・写真の表示まで動作を確認済みです（2026-11-07）。

ご当地判定（`src/server/discovery/` の郷土料理照合）は現在の検索経路では使っていません。詳しくは[API契約](docs/api-contract.md)・[アーキテクチャ](docs/architecture.md)・[フロント説明](src/app/FRONTEND.md)を参照してください。

### 途中結果（一部未確認）

Gemini の混雑や期限切れで一部の店舗のクチコミを確認できなかった場合も、確認できた店舗から選んだ結果を返し、確認できなかった店舗数を `uncheckedCount` に入れます。画面には「混雑などのため、一部のお店（N件）のクチコミを確認できませんでした」と「もう一度確認する」を表示します。1件も確認できなかった場合はエラー（503・504など）になります。

### 全国チェーンの除外

全国展開している飲食チェーン（例：ケンタッキー、マクドナルド、スターバックス）は、[`src/server/restaurants/national-chains.ts`](src/server/restaurants/national-chains.ts) の店名リストで除外します。地域チェーン（例：崎陽軒、矢場とん）は「ご当地の店」として残します。

- 店名の先頭で照合します。3文字以下の名前は、直後が区切り（空白・括弧など）のときだけ一致とします。
- リストはたたき台です。追加・削除は設計担当（後藤）に確認してから行ってください。
- Places API にはチェーンを示す項目がありません。将来は、同じ店名で検索した店舗数から自動で判定する方法を検討します。

## チームと設計資料

- フロントエンド、クチコミからの料理抽出（Gemini・プロンプト）：ふら
- バックエンド・API連携：Yuuto
- 設計（判定・抽出方針の確認）：後藤

[共通ルール](AGENTS.md) / [製品仕様](docs/product-spec.md) / [API契約](docs/api-contract.md) / [アーキテクチャ](docs/architecture.md)

## チームと担当範囲

同じNext.jsプロジェクト内で、以下の範囲を担当します。

| 担当 | 主な編集範囲 | 実装する内容 |
|---|---|---|
| ふら：フロントエンド | src/app/（api/を除く。_components/・_lib/など）、public/ | 導入アニメーション、ホーム、位置情報取得、絞り込み、結果一覧、店舗詳細、検索APIの呼び出し、デモ |
| Yuuto：バックエンド・API連携 | src/app/api/、src/server/restaurants/ | 検索API、入力検証、モック、店舗・クチコミ・写真の取得、チェーン除外、外部API接続、レスポンス整形 |
| ふら：料理抽出・判定（後藤から引き継ぎ） | src/server/discovery/ | Geminiによるクチコミからの料理抽出・プロンプト・構造検証、既存のご当地判定 |
| 後藤：設計 | （コードは編集しない） | 判定・抽出方針の設計確認、チェーン除外リストの確認 |

### 共同で管理するファイル

| 対象 | 変更時の確認先 |
|---|---|
| src/types/：フロントとバックの共有API型 | ふら・Yuuto |
| src/lib/restaurants/：フロントとバックで共有する処理（気分による並べ替え） | ふら・Yuuto |
| 候補店舗・抽出結果の受け渡し仕様（src/server/discovery/review-types.ts） | Yuuto・ふら（方針は後藤） |
| package.json、package-lock.json、各種設定 | チーム全員 |
| AGENTS.md、README.md、docs/ | 変更内容に関係する担当者 |

### 担当間の受け渡し

1. ふらが画面から検索APIを呼び出します。
2. Yuutoが入力を検証し、候補店舗とクチコミを取得して、全国チェーンを除外します。
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
| `places` | Nearby Search・Place Photos・Gemini を実際に呼ぶ（**有料APIの利用が発生**。下の「料金の目安」） | `GOOGLE_PLACES_API_KEY`、`GEMINI_API_KEY` |
| 未設定 | 開発中は`mock`。本番（`NODE_ENV=production`）では503 | — |

| その他の環境変数 | 内容 |
|---|---|
| `GEMINI_MODEL` | 料理抽出に使うモデル。省略時は `gemini-3.5-flash-lite` |

- モックは東京駅周辺の店舗だけを返すため、離れた現在地では0件です。
- `places`でキーが未設定・権限不足（403）・利用上限（429）のときは503を返し、モックへは切り替えません。
- 候補取得・料理抽出・照合の期限は10秒で、確認できた店舗が1件もなければ504です。その後、最終候補の写真取得に最大3秒を使うため、検索全体は最大約13秒です（フロントの待機上限は15秒）。
- Google Cloud で Places API (New) を有効にし、1日の割り当て上限と予算アラートを設定してから使ってください。
- **Gemini のキーは、有料プラン（課金アカウントを紐付けた Cloud プロジェクトのキー）を使ってください。** 理由は下の「利用規約で確認したこと」を参照。AI Studio の API キー画面で、キーのプランが Paid になっているか確認できます。
- サーバーキーに`NEXT_PUBLIC_`を付けません。`.env.local`は両階層の`.gitignore`で除外され、`.env.example`だけを追跡します。`.env.example`にはダミー値以外を書きません。

### デモ（位置情報・外部API なし）

ホームの「位置情報を使わず、デモで試す」で、東京駅の固定座標とフロント専用の架空データを使って画面を確認できます。検索APIや有料APIは呼びません。

条件パネルの「デモの表示状態」で、次の状態を切り替えられます：通常・料理と引用の表示／0件／情報の一部欠損／検索失敗／並べ替え失敗／一部未確認（混雑時）／遅い検索（4秒）。

### 実APIの接続確認

画面で検索がうまくいかないときは、アプリルートで次を実行すると、Places・Gemini のどこで失敗しているかを確認できます。**有料APIを呼びます。** キーとクチコミ本文は表示しません。

```sh
node --env-file=.env.local scripts/check-live-search.mjs --live          # Places だけ（失敗時は Google のエラー理由を表示）
node --env-file=.env.local scripts/check-live-search.mjs --live --full   # Places → Gemini → 照合まで
```

Gemini の料理抽出だけを架空のクチコミで確認する場合は `node --env-file=.env.local scripts/check-review-inference.mjs --live` を使います。

### 料金の目安（`places`、1回の検索あたり）

2026-11-07時点の[Google Maps Platform 価格表](https://developers.google.com/maps/billing-and-pricing/pricing#places-pricing)と[Gemini API 料金](https://aistudio.google.com/docs/pricing)によります（米ドル）。価格は変わることがあるため、利用前に公式ページを確認してください。

| API（料金区分） | 1回の検索で呼ぶ回数 | 毎月の無料枠 | 無料枠を超えた単価 | 1回の検索あたり |
|---|---|---|---|---|
| Nearby Search（Enterprise + Atmosphere。`places.reviews`を含むため） | 1回 | 1,000回 | $40 / 1,000回 | 約$0.040 |
| Place Photos（Place Details Photos） | 最大5回（表示する店舗ごとに1枚） | 1,000回 | $7 / 1,000回 | 最大約$0.035 |
| Gemini 3.5 Flash-Lite | 5店舗ずつ最大4回（500・503は1回だけ再送） | 無料プランは無料 | 入力$0.30・出力$2.50 / 100万トークン | 有料プランで約$0.017 |

- 無料枠で月に検索できる回数の目安は、**Place Photos で約200回**（1,000回 ÷ 5枚）、Nearby Search で約1,000回です。先に写真の無料枠が尽きます。
- 無料枠を超えた場合、Places の費用は1回の検索あたり最大約$0.075です。
- Gemini の見積もりは、東京駅・半径1km（20店舗・クチコミ90件）の実測で、1バッチあたり入力約5,700トークン・出力約1,000トークンだったことをもとにした概算です。
- 営業時間（`regularOpeningHours`）は Enterprise 区分の項目で、クチコミを取得している時点で Enterprise + Atmosphere 区分のため、追加の費用はかかりません。
- 全国チェーンは Gemini に送る前に除外するため、そのぶん Gemini の呼び出し量は減ります。写真は料理を確認できた最終候補（最大5件）だけ取得します。
- 料金の比較（Place Details を使わず Nearby Search だけでクチコミを取る理由）は[型と受け渡しの案](docs/review-menu-inference-proposal.md)を参照してください。

### 利用規約で確認したこと（2026-11-07）

法的な判断ではなく、規約の文面を読んで整理したものです。

| 規約 | 内容 | 現在の対応 |
|---|---|---|
| [Places API ポリシー](https://developers.google.com/maps/documentation/places/web-service/policies) | Google Maps 由来の情報であることを示す（ロゴまたは「Google Maps」の文字） | 店舗に「Google Maps」の表記を表示 |
| 同上 | クチコミ・写真の投稿者を帰属表示し、元のクチコミ・写真へのリンクを用意する | 投稿者名・アバター・リンク、「元のクチコミを見る」を表示 |
| 同上 | 翻訳されたクチコミであることを示す。並び順・絞り込みの説明を表示する | 「翻訳されたクチコミです」「原文を見る」、抽出方法の説明を表示 |
| [Google Maps Platform 利用規約](https://cloud.google.com/maps-platform/terms) 3.2.3(a)(b) | Google Maps のコンテンツ（クチコミ等）を保存・キャッシュしない | 保存していない。外部通信は `no-store` |
| 同 3.2.3(c)(vii) と [Gemini API 追加規約](https://ai.google.dev/gemini-api/terms) | Google Maps のコンテンツを AI モデルの改善に使わない。Gemini の無料プランでは送信内容が製品・機械学習の改善に使われる | **Gemini は有料プランのキーを使う**（上の「店舗データの取得元」） |
| 同 3.2.3(c) | Google Maps のコンテンツを元にコンテンツを作らない | **未解決**：クチコミから料理名を抽出して表示することが該当するかは解釈が分かれる。現在の方式のまま。対応が必要になった場合は Gemini の「Grounding with Google Maps」などを検討する |

### 既知の制限

- **範囲を変えても結果がほぼ変わらないことがある**：Nearby Search は現在地から近い順に20店舗だけを取得するため、店が密集した場所では500m・1km・3kmのどれでも同じ20店舗になりがちです。
- **カフェはほぼ対象外**：Nearby Search の `includedTypes` を `restaurant` にしているため、Google の分類でカフェの店はほとんど候補に入りません。百貨店やスイーツ店は入ることがあります。
- **気分を変えると有料APIをすべて呼び直す**：並べ替えだけでも、Places・Gemini・写真の取得をやり直します。
- **抽出した料理名の質**：「プレーン、アールグレイ、キャラメル。」のように、料理名として不自然なものが混ざることがあります（プロンプトで調整予定）。

### 確認コマンド

```sh
npm run lint
npx tsc --noEmit
npm run build
node scripts/test.mjs
node --test src/server/restaurants/*.test.mjs src/server/discovery/*.test.mjs
```

自動テストは外部APIを呼びません。現在の環境ではlintがESLintとTypeScriptプラグインの互換性エラー（`context.getScope is not a function`）で停止します。依存整合は別途対応が必要です。
