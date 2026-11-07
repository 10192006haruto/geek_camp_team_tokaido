# 検索API契約

> 最新の担当分離：Nearby取得・検索APIへの接続はYuuto担当として今回の変更から外しました。ふら側は取得済み最大20候補を受け取るprepareReviewResultsと、最終5件の選定・表示までです。通常検索は旧モックのままです。[現在の担当境界と検証記録](review-search-integration-2026-11-07.md)を優先してください。

> 2026-11-07：ふら担当の料理抽出・画面側を実装し、公開型にinferredMenuを追加、フロント受理上限を5件に更新しました。Yuuto担当の検索APIは旧モック・最大5件のままで、inferredMenu=[]を返す互換状態です。以下の検索順序は既存経路です。新経路への接続事項は[実装・検証記録](review-dishes-implementation-2026-11-07.md)を参照してください。

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

1. 半径内の候補を取得・正規化。店舗座標不明は半径を確認できないため除外。
2. 検索位置の都道府県に合う料理と、その店での提供根拠を判定。
3. openNow=trueならisOpenNow=trueだけを残す。null・falseは除外。
4. 直線距離順を基本に、料理名・ジャンルで気分に一致する店を優先。同順位は距離順、同距離は入力順。
5. 最後に最大5件へ制限。returnedCountは返却件数で、全候補数ではない。

気分は除外条件ではありません。麺・和食・カフェ・郷土料理・焼肉の定型判定を使い、未対応の表現（例：がっつり）・否定表現・空欄は距離順です。生成された推薦文を並べ替えの根拠にしません。ご当地判定を満たさない店舗で件数を埋めません。

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
| restaurants | 公開型・フロント受理上限5件。既存検索APIは最大5件。該当なしは空配列 |
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
| inferredMenu | 必須配列。料理は最大10品、各料理に1〜5件の引用。旧モック・判定経路では[]。新しいレビュー経路は1品以上の店を返す予定 |
| labels | 根拠のあるラベルの配列。付与なしは[] |
| recommendationReason | 取得情報に裏付けられた理由。根拠不足はnull |
| googleMapsUrl | 検証したGoogle Mapsリンク、取得できない場合はnull |
| attributions / photoAttributions | 店舗情報／写真の出典・帰属。各要素に表示文字列textとリンクurl（リンクなしはnull）。モックでは[] |

不明値を0・空文字に置き換えません。根拠のないラベルや推薦文を生成して件数を埋めません。実APIで要求される帰属は表示まで引き継ぎます。この帰属形式だけで規約を満たすかは未確認で、接続時に拡張が必要となる可能性があります。URLは利用可能なスキーム・送信先を検証し、外部HTMLをそのまま描画しません。

### 架空店舗の成功例

以下の店舗は架空です。座標・評価等もモック値で、実在店舗への推薦ではありません。料理の提供・地域性の根拠も架空のテストデータです。

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
      "inferredMenu": [],
      "labels": ["ご当地料理"],
      "recommendationReason": "東京名物の深川めしを提供",
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
