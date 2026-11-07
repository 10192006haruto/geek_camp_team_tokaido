# 検索API契約

> 2026-11-07更新（Yuuto）：検索APIをクチコミ料理抽出の経路へ切り替えました。取得元は`RESTAURANT_DATA_SOURCE`で`places`（Nearby Search＋Gemini）と`mock`（架空データ）を選びます（[README](../README.md#店舗データの取得元モック実api)）。ご当地判定は現在の検索経路では使いません。仕様の背景は[MVP仕様](review-dishes-mvp-spec.md)、受け渡しの型は[型と受け渡しの案](review-menu-inference-proposal.md)を参照してください。実店舗での`places`の動作は未確認です。

## HTTPとリクエスト

`POST /api/restaurants/search`、リクエスト・レスポンスは`application/json`。距離はm。全キー必須です。気分の指定なしは空文字、営業条件の指定なしはfalseです。旧条件・未知のトップレベルキーは400で拒否します。

```json
{
  "location": { "latitude": 35.6812, "longitude": 139.7671 },
  "radiusMeters": 1000,
  "mood": "",
  "openNow": false
}
```

| 項目 | 型 | サーバー側の検証 |
| --- | --- | --- |
| location | object | 必須、null不可 |
| location.latitude | number | 有限数、-90〜90 |
| location.longitude | number | 有限数、-180〜180 |
| radiusMeters | `500 / 1000 / 3000` | 必須、許可値のみ |
| mood | string | JS文字列長で0〜150（UTF-16コード単位）。null不可。長さを検証後、前後空白を除く |
| openNow | boolean | trueなら営業中と確認できる店のみ。falseなら営業状態では除外しない |

ジャンル・予算の検索条件は廃止しました。`cuisineLabel`・`priceLevel`は店舗の表示情報として残します。

### 検索順序

1. 候補を取得・正規化。`places`ではNearby Searchで半径内を距離順に最大20店舗、各最大5件のクチコミを取得。`mock`では架空店舗。
2. クチコミから料理名と根拠の引用を抽出（`places`はGeminiに5店舗ずつ並行して送り抽出、`mock`は固定値）。
3. 引用が該当クチコミ本文の部分文字列で、料理名を含むかを照合。満たさない根拠・料理は捨て、料理が残らない店舗は返さない。
4. 店舗座標不明・半径外を除外。openNow=trueならisOpenNow=trueだけを残す。null・falseは除外。
5. 直線距離順を基本に、抽出した料理名・ジャンルで気分に一致する店を優先。同順位は距離順、同距離はID順。
6. 最後に最大5件へ制限。returnedCountは返却件数で、全候補数ではない。

気分は除外条件ではありません。麺・和食・カフェ・郷土料理・焼肉の定型判定を使い、未対応の表現（例：がっつり）・否定表現・空欄は距離順です。生成された推薦文を並べ替えの根拠にしません。料理を抽出できない店舗で件数を埋めません。「料理を提供していない」とも判断しません。

`places`では取得・抽出・照合の全体に10秒の期限があります。呼び出しごとに期限を延長しません。Geminiが500・503（混雑）を返したバッチだけ、500ms待って期限内で1回再送します。

### 途中結果（一部未確認）

Geminiは5店舗ずつのバッチで呼びます。一部のバッチが失敗・期限切れになっても、成功したバッチの店舗から選んだ結果を200で返し、確認できなかった店舗数を`uncheckedCount`に入れます。

- `uncheckedCount`は、失敗したバッチに含まれ、クチコミ本文があり、半径内で営業条件も満たす（確認できていれば表示され得た）候補の数。全件確認済みなら0。
- クチコミのある候補を1件も確認できなかった場合は途中結果にせず、期限切れ→504、混雑・設定不足→503、その他→502を返す。
- 利用者の操作による中断では結果を返さない。
- 画面は`uncheckedCount > 0`のとき「一部のお店のクチコミを確認できませんでした」と示し、確認できなかった店を「料理がない」とは扱わない。`mock`は常に0。

## 共有TypeScript型

配置：`src/types/restaurants.ts`。サーバー専用コードをimportしません。基本項目は全キー必須です。レビューの補足メタデータのみ任意です。

```ts
export type Location = { latitude: number; longitude: number };
export type SearchRequest = {
  location: Location;
  radiusMeters: 500 | 1000 | 3000;
  mood: string;
  openNow: boolean;
};
export type Attribution = {
  text: string;
  url: string | null;
};
export type PriceLevel =
  | "free" | "inexpensive" | "moderate" | "expensive" | "very_expensive";
export type ReviewEvidence = {
  quote: string;
  author: Attribution;
  reviewUrl: string | null;
  publishTime: string | null;
  authorPhotoUrl?: string | null;
  originalText?: string | null;
  translated?: boolean;
};
export type InferredMenuItem = { name: string; evidence: ReviewEvidence[] };
export type Restaurant = {
  id: string;
  name: string;
  location: Location | null;
  address: string | null;
  distanceMeters: number | null;
  rating: number | null;
  reviewCount: number | null;
  photoUrl: string | null;
  priceLevel: PriceLevel | null;
  isOpenNow: boolean | null;
  cuisineLabel: string | null;
  inferredMenu: InferredMenuItem[];
  labels: string[];
  recommendationReason: string | null;
  googleMapsUrl: string | null;
  attributions: Attribution[];
  photoAttributions: Attribution[];
};
export type SearchResponse = {
  restaurants: Restaurant[];
  returnedCount: number;
  uncheckedCount: number;
};
export type SearchErrorCode =
  | "INVALID_REQUEST" | "UNSUPPORTED_MEDIA_TYPE" | "METHOD_NOT_ALLOWED"
  | "SEARCH_FAILED" | "UPSTREAM_TIMEOUT" | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";
export type SearchError = {
  error: { code: SearchErrorCode; message: string };
};
```

`PriceLevel`は内部の価格帯表現案で、外部サービスの列挙値との対応は接続時に確認します。金額そのものではありません。

## レスポンス項目

| 項目 | 意味・制約 |
| --- | --- |
| restaurants | 最大5件。該当なしは空配列 |
| returnedCount | 0〜5の整数、restaurants.lengthと一致 |
| uncheckedCount | 0以上の整数。料理を確認できなかった候補の数（途中結果）。0なら全件確認済み |
| id / name | 空でない識別子／店名。必須情報を欠く候補は返さない |
| location | 店舗座標。不明ならオブジェクト全体をnull |
| address | 住所、不明はnull |
| distanceMeters | 検索座標からの直線距離。非負の有限数、不明はnull |
| rating | 0〜5の有限数、不明はnull。異なる評価尺度は接続時に明示的に対応 |
| reviewCount | 非負の整数、不明はnull。0件は0 |
| photoUrl | 写真のURL、なし・利用不可はnull。UIで代替表示 |
| priceLevel | 価格帯、不明はnull。「moderate」などを円の金額として表示しない |
| isOpenNow | true＝営業中、false＝営業していない、null＝不明。閉業とは区別 |
| cuisineLabel | 表示用ジャンル、不明はnull |
| inferredMenu | クチコミで言及された料理。返却する店舗では常に1品以上（最大10品）、各料理に照合済みの引用1〜5件。投稿者・リンク・日時はモデルではなく取得データから付与 |
| labels | 根拠のあるラベルの配列。現在の経路では地域性ラベルを付けず[] |
| recommendationReason | 照合済み情報に基づく定型文（例：「クチコミに○○の言及あり」）。根拠不足はnull |
| googleMapsUrl | 検証したGoogle Mapsリンク、取得できない場合はnull |
| attributions / photoAttributions | 店舗情報／写真の出典・帰属。各要素に表示文字列textとリンクurl（リンクなしはnull）。現在は店舗単位の帰属・写真を取得しておらず`places`・`mock`とも[]。クチコミの投稿者はinferredMenuの各引用のauthorで返す |

不明値を0・空文字に置き換えません。根拠のないラベルや推薦文を生成して件数を埋めません。実APIで要求される帰属は表示まで引き継ぎます。この帰属形式だけで規約を満たすかは未確認で、接続時に拡張が必要となる可能性があります。URLは利用可能なスキーム・送信先を検証し、外部HTMLをそのまま描画しません。

### 架空店舗の成功例

以下は`mock`の出力から1件を抜き出したものです（座標・距離は桁を省略）。店舗・クチコミ・投稿者はすべて架空で、実在店舗への推薦ではありません。

```json
{
  "restaurants": [
    {
      "id": "mock-place-5",
      "name": "【架空】定食 とうかいどう",
      "location": { "latitude": 35.68389, "longitude": 139.7671 },
      "address": "架空の住所（開発用データ）",
      "distanceMeters": 299.66,
      "rating": 3.9,
      "reviewCount": 41,
      "photoUrl": null,
      "priceLevel": null,
      "isOpenNow": true,
      "cuisineLabel": "定食屋",
      "googleMapsUrl": null,
      "attributions": [],
      "photoAttributions": [],
      "inferredMenu": [
        {
          "name": "生姜焼き定食",
          "evidence": [
            {
              "quote": "生姜焼き定食を食べました。",
              "author": { "text": "架空投稿者5-3", "url": null },
              "reviewUrl": null,
              "publishTime": "2026-11-01T03:00:00Z",
              "authorPhotoUrl": null,
              "originalText": null,
              "translated": false
            }
          ]
        }
      ],
      "labels": [],
      "recommendationReason": "クチコミに生姜焼き定食の言及あり"
    }
  ],
  "returnedCount": 1,
  "uncheckedCount": 0
}
```

モックでも検索座標から距離を計算し、半径条件を適用します。0件はHTTP 200で返します。

```json
{ "restaurants": [], "returnedCount": 0, "uncheckedCount": 0 }
```

## エラー

```json
{
  "error": {
    "code": "SEARCH_FAILED",
    "message": "店舗を取得できませんでした。時間をおいて再度お試しください。"
  }
}
```

| HTTP | code | 意味 |
| --- | --- | --- |
| 400 | INVALID_REQUEST | JSON破損、必須項目欠落、型・範囲・許可値の不正 |
| 405 | METHOD_NOT_ALLOWED | POST以外。Allow: POSTを付与 |
| 415 | UNSUPPORTED_MEDIA_TYPE | application/json以外 |
| 502 | SEARCH_FAILED | Places・Geminiの失敗、不正なレスポンス・モデル応答 |
| 503 | SERVICE_UNAVAILABLE | キー・モデル・取得元の設定不足、権限不足（401/403）、利用上限（429）、Geminiの混雑（再送後も503） |
| 504 | UPSTREAM_TIMEOUT | 検索全体の10秒期限を超過し、確認できた候補がない |
| 500 | INTERNAL_ERROR | 想定外の内部障害 |

抽出結果が0件（料理の言及なし）は200の空配列で、上記の失敗とは区別します。一部のバッチだけが失敗した場合は上記のエラーにせず、途中結果（`uncheckedCount > 0`）として200で返します。`places`の失敗時にモックへ切り替えません。全レスポンスに`Cache-Control: no-store`を付けます。アプリが返すエラーは上記JSON形状に統一する設計です。405もRoute Handlerで明示的に扱います。フレームワークやプロキシから非JSON応答が返る場合にもクライアントは汎用エラーを表示します。内部例外、外部APIの生レスポンス、キー、スタックトレースを利用者に返しません。

位置情報の拒否・タイムアウト・取得不能はブラウザ側の状態であり、この検索APIのエラーコードとは分けます。失敗時も検索条件を維持して再試行できます。
