# レビューからのメニュー推測：型と受け渡しの案

作成：Yuuto（2026-11-07）。**この文書は提案です。** 型・API契約・コードはまだ変更していません。合意できたら、共有型・[API契約](api-contract.md)・モックを同じPRで更新します。

## 決まっている方針

- 店舗の取得には Places API (New) の **Nearby Search だけ**を使います（下の「方式A」）。Place Details は使いません。
- 各APIは、1回で取れる最大数を取得します。店舗は最大20件、レビューは1店舗あたり最大5件です。
- レビューからのメニュー推測には Gemini API を使います。プロンプトはふらさんの担当です。
- フロントには、**メニューを推測できた店舗を全件**返します（最大20件）。今の「最大5件」の制限はなくします。
- 担当の変更：判定・推測の処理（`src/server/discovery/`）は、後藤さんからふらさんが引き継ぎました。後藤さんは設計担当になります。

## 方式Aを選んだ理由（料金）

1回のリクエストの料金は、指定したフィールドの中で一番高い区分で決まります。`reviews` は Enterprise + Atmosphere の区分です。Nearby Search でもこの区分の `places.reviews` を指定できます。

| 方式 | 1回の検索での呼び出し | 1回の検索あたりの料金 | 毎月の無料枠で可能な検索回数 |
| --- | --- | --- | --- |
| **A：Nearby Search だけ** | Nearby Search（Enterprise + Atmosphere）×1 | 約 $0.040 | 約1,000回 |
| B：Nearby Search ＋ Place Details | Nearby Search（Enterprise）×1 ＋ Place Details（Enterprise + Atmosphere）×20 | 約 $0.535 | 約50回 |

単価は2026-11-07時点の[価格表](https://developers.google.com/maps/billing-and-pricing/pricing#places-pricing)の値です。Nearby Search Enterprise + Atmosphere は1,000リクエストあたり $40、無料枠は月1,000件です。フィールドと区分の対応は[SKUの詳細](https://developers.google.com/maps/billing-and-pricing/sku-details/places)を参照しました。Gemini の料金は含めていません。

## 処理の流れと担当

```text
POST /api/restaurants/search（Yuuto：入力検証）
 → Nearby Search で候補とレビューを取得し、内部型に変換（Yuuto）
 → inferMenus：Gemini でレビューからメニューを推測（ふら）
 → 引用の検証。引用がレビュー本文に含まれない推測は捨てる（Yuuto）
 → 推測できた店舗だけ残す → 営業中のみの条件 → 気分で並べ替え（Yuuto）
 → 全件をレスポンスとして返す（最大20件）
```

## Nearby Search へのリクエスト案

```http
POST https://places.googleapis.com/v1/places:searchNearby
X-Goog-Api-Key: （サーバーの環境変数 GOOGLE_PLACES_API_KEY）
X-Goog-FieldMask: places.id,places.displayName,places.location,places.formattedAddress,places.primaryType,places.primaryTypeDisplayName,places.googleMapsUri,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours.openNow,places.reviews
```

```json
{
  "includedTypes": ["restaurant"],
  "maxResultCount": 20,
  "rankPreference": "DISTANCE",
  "languageCode": "ja",
  "regionCode": "JP",
  "locationRestriction": {
    "circle": {
      "center": { "latitude": 35.6812, "longitude": 139.7671 },
      "radius": 1000
    }
  }
}
```

- `photos` は取得しません。写真を表示するには、別の料金区分（Place Photos）の呼び出しが追加で必要なためです。当面 `photoUrl` は `null` にします。
- `includedTypes` を飲食店（`restaurant`）だけにするか、カフェなども含めるかは相談したいです。

## 型の案

### 1. 取得側から推測側に渡すもの（サーバー内部、Yuuto → ふら）

```ts
/** Places の Review を、推測に必要な項目だけに整えたもの。 */
export type PlaceReview = {
  /** 店舗内での番号（0〜4）。推測結果の引用元を指すのに使う。 */
  index: number;
  /** 本文。languageCode="ja" で取得した text.text。本文のないレビューは渡さない */
  text: string;
  /** 本文の言語。翻訳されていれば元の言語と異なる */
  languageCode: string | null;
  rating: number | null;
  /** RFC 3339 形式 */
  publishTime: string | null;
  /** 投稿者の帰属。表示する場合に必要 */
  author: { displayName: string; uri: string | null };
  /** Google マップ上のこのレビューへのリンク */
  googleMapsUri: string | null;
};

/** 推測に渡す店舗の候補。公開用の Restaurant に、レビューを加えたもの。 */
export type ReviewCandidate = Omit<Restaurant, "labels" | "recommendationReason" | "inferredMenu"> & {
  reviews: PlaceReview[];
};
```

### 2. 推測側から返すもの（ふら → Yuuto）

```ts
/** 推測した料理1品と、根拠となるレビューの引用。 */
export type InferredMenuItemDraft = {
  name: string;
  evidence: {
    /** PlaceReview.index */
    reviewIndex: number;
    /** レビュー本文からの抜き出し。言い換えではなく、本文と完全一致する部分文字列 */
    quote: string;
  }[];
};

export type MenuInference = {
  /** ReviewCandidate.id */
  placeId: string;
  /** 推測できなければ空配列 */
  items: InferredMenuItemDraft[];
};

/** 推測処理の入口（ふら担当）。 */
export function inferMenus(
  candidates: ReviewCandidate[],
  signal: AbortSignal,
): Promise<MenuInference[]>;
```

- **引用の検証**：取得側で `quote` がそのレビュー本文に実際に含まれているかを確認し、含まれない根拠は捨てます。根拠が1つも残らない料理も捨てます。生成AIが根拠のない内容を出しても、画面に出ないようにするためです。
- 店舗ごとに呼ぶか、20店舗をまとめて1回で呼ぶかは、`inferMenus` の内部の話なので、型はどちらでも同じです。

### 3. フロントに返す型（共有型 `src/types/restaurants.ts` への追加）

```ts
export type ReviewEvidence = {
  /** レビュー本文からの引用 */
  quote: string;
  /** 投稿者の帰属。表示必須（規約の確認後に確定） */
  author: Attribution;
  /** Google マップ上のレビューへのリンク */
  reviewUrl: string | null;
  publishTime: string | null;
};

export type InferredMenuItem = {
  name: string;
  /** 1件以上。検証済みの引用だけ */
  evidence: ReviewEvidence[];
};

export type Restaurant = {
  // …既存の項目はそのまま…
  /** レビューから推測したメニュー。推測できた店舗だけを返すので、常に1件以上 */
  inferredMenu: InferredMenuItem[];
};

export type SearchResponse = {
  restaurants: Restaurant[];   // 最大20件（変更）
  returnedCount: number;       // 0〜20（変更）
};
```

画面では、推測したメニューを「レビューからの推測」と分かる表示にしてください。確定したメニューのように見せないためです。

### Places のフィールドと Restaurant の対応

| Restaurant | Places（`places[]`） | 補足 |
| --- | --- | --- |
| id | id | |
| name | displayName.text | |
| location | location | |
| address | formattedAddress | |
| distanceMeters | （計算） | 検索座標からの直線距離 |
| rating | rating | |
| reviewCount | userRatingCount | |
| priceLevel | priceLevel | `PRICE_LEVEL_UNSPECIFIED` は null |
| isOpenNow | currentOpeningHours.openNow | 項目がなければ null |
| cuisineLabel | primaryTypeDisplayName.text | |
| googleMapsUrl | googleMapsUri | |
| photoUrl | なし | 当面 null |

## エラーと0件

| 状況 | 返し方 |
| --- | --- |
| 周辺に店舗がない／推測できた店舗が0件 | 200、`restaurants: []` |
| Places・Gemini の失敗、不正なレスポンス | 502 `SEARCH_FAILED` |
| APIキーが未設定、利用上限に到達 | 503 `SERVICE_UNAVAILABLE` |
| Places・Gemini のタイムアウト | 504 `UPSTREAM_TIMEOUT` |

APIキーがない環境では、架空のレビューと推測結果を持つモックで最後まで動くようにします。

## 相談したいこと

| # | 内容 | 相談先 |
| --- | --- | --- |
| 1 | 上の型で受け渡しができるか。項目の過不足 | ふら |
| 2 | Gemini の呼び出しコード（キー・タイムアウト・失敗処理）を誰が書くか。Yuuto の `src/server/restaurants/` 側か、ふらさんの `src/server/discovery/` 側か | ふら |
| 3 | Gemini を店舗ごとに呼ぶか、まとめて1回で呼ぶか。料金と応答速度に関わる | ふら |
| 4 | 画面が最大20件の表示と、推測メニュー・引用・投稿者名の表示に対応できるか | ふら |
| 5 | 既存の `labels`・`recommendationReason`、ご当地料理の判定を残すか | ふら・後藤 |
| 6 | 気分（`mood`）による並べ替えを、推測したメニュー名で行ってよいか | ふら・後藤 |
| 7 | `includedTypes` の範囲（飲食店だけか、カフェなども含めるか） | 全員 |

## 未確認事項

- **規約**：レビューを表示する際の帰属表示の義務、取得データの保存・キャッシュの制限、レビュー本文を Gemini に渡してよいか。確認したら、この文書と `ReviewEvidence` を更新します。
- **課金の単位**：料金ページは「成功したリクエストごと」と読める書き方ですが、件数単位でないことは明記されていません。
- **フィールドマスク**：料金ページでは推奨扱いの書き方でした。必要なフィールドだけを必ず指定します。
- 実際のAPI呼び出しはまだ行っていません。`places.reviews` を指定した Nearby Search の実際のレスポンスは、確認でき次第ここに追記します。
