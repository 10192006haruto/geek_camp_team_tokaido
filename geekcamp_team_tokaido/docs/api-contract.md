# 検索API契約（実装予定）

今回の成果物は文書のみです。エンドポイント・共有TypeScriptファイル・モックはまだ存在しません。以下は初期実装の契約案で、外部API対応済みを意味しません。

## HTTPとリクエスト

`POST /api/restaurants/search`、リクエスト・レスポンスは`application/json`。距離はm、予算は円。任意条件もキーは必須とし、指定なしを`null`に統一します。省略・空文字・文字列の数値は受理しません。

```json
{
  "location": { "latitude": 35.6812, "longitude": 139.7671 },
  "radiusMeters": 1000,
  "cuisine": null,
  "budgetMaxYen": null
}
```

| 項目 | 型 | サーバー側の検証 |
| --- | --- | --- |
| location | object | 必須、null不可 |
| location.latitude | number | 有限数、-90〜90 |
| location.longitude | number | 有限数、-180〜180 |
| radiusMeters | 500 | 1000 | 3000 | 必須、許可値のみ |
| cuisine | string | null | 指定なしはnull。指定時は対応ジャンルの許可リストに含まれる値 |
| budgetMaxYen | number | null | 指定なしはnull。指定時は正の安全な整数 |

ジャンルの許可リスト・予算UIの選択肢は未確定で、実装時に共有型・モック・本書を同期します。`priceLevel`から円建て予算への変換はしません。予算・ジャンルによる実API検索の対応可否は確認が必要です。

## 共有TypeScript型の案

実装時の配置予定：`src/types/restaurants.ts`。サーバー専用コードをimportしません。下記に`?`はなく、全キー必須です。

```ts
export type Location = { latitude: number; longitude: number };
export type SearchRequest = {
  location: Location;
  radiusMeters: 500 | 1000 | 3000;
  cuisine: string | null;
  budgetMaxYen: number | null;
};
export type Attribution = {
  text: string;
  url: string | null;
};
export type PriceLevel =
  | "free" | "inexpensive" | "moderate" | "expensive" | "very_expensive";
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
  labels: string[];
  recommendationReason: string | null;
  googleMapsUrl: string | null;
  attributions: Attribution[];
  photoAttributions: Attribution[];
};
export type SearchResponse = {
  restaurants: Restaurant[];
  returnedCount: number;
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
| restaurants | 配列。最大5件。該当なしは空配列 |
| returnedCount | 0〜5の整数、restaurants.lengthと一致 |
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
| labels | 根拠のあるラベルの配列。付与なしは[] |
| recommendationReason | 取得情報に裏付けられた理由。根拠不足はnull |
| googleMapsUrl | 検証したGoogle Mapsリンク、取得できない場合はnull |
| attributions / photoAttributions | 店舗情報／写真の出典・帰属。各要素に表示文字列textとリンクurl（リンクなしはnull）。モックでは[] |

不明値を0・空文字に置き換えません。根拠のないラベルや推薦文を生成して件数を埋めません。実APIで要求される帰属は表示まで引き継ぎます。この帰属形式だけで規約を満たすかは未確認で、接続時に拡張が必要となる可能性があります。URLは利用可能なスキーム・送信先を検証し、外部HTMLをそのまま描画しません。

### 架空店舗の成功例

以下の店舗は架空です。座標・評価等もモック値で、実在店舗への推薦ではありません。レビュー少なめの基準を決定する例ではありません。

```json
{
  "restaurants": [
    {
      "id": "mock-place-001",
      "name": "【架空】ここメシ食堂",
      "location": { "latitude": 35.683, "longitude": 139.769 },
      "address": "架空の住所（開発用データ）",
      "distanceMeters": 264,
      "rating": 4.3,
      "reviewCount": 24,
      "photoUrl": null,
      "priceLevel": null,
      "isOpenNow": null,
      "cuisineLabel": "和食",
      "labels": [],
      "recommendationReason": "モックデータ上の評価は4.3、レビュー数は24件です。",
      "googleMapsUrl": null,
      "attributions": [],
      "photoAttributions": []
    }
  ],
  "returnedCount": 1
}
```

距離は例示の概数です。モック実装でも検索座標から計算し、半径条件を適用します。0件はHTTP 200で返します。

```json
{ "restaurants": [], "returnedCount": 0 }
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
| 502 | SEARCH_FAILED | 外部店舗サービスの失敗・不正レスポンス |
| 503 | SERVICE_UNAVAILABLE | 利用制限、設定不足、一時的に検索を提供できない |
| 504 | UPSTREAM_TIMEOUT | 外部サービスのタイムアウト |
| 500 | INTERNAL_ERROR | 想定外の内部障害 |

アプリが返すエラーは上記JSON形状に統一する設計です。405もRoute Handlerで明示的に扱います。フレームワークやプロキシから非JSON応答が返る場合にもクライアントは汎用エラーを表示します。内部例外、外部APIの生レスポンス、キー、スタックトレースを利用者に返しません。

位置情報の拒否・タイムアウト・取得不能はブラウザ側の状態であり、この検索APIのエラーコードとは分けます。失敗時も検索条件を維持して再試行できます。
