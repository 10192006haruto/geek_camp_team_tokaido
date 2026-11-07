# 店舗写真の連携と取得期限の修正

2026-11-07の作業記録。現時点では実API・ブラウザでの写真表示は未確認です。

## 背景

検索結果・店舗詳細には写真を表示する既存UIがありましたが、Nearby Searchでは写真情報を要求せず、検索APIの`photoUrl`も常に`null`でした。今回、取得側から既存UIへ写真と帰属を渡す処理を追加しました。

## 実装内容

1. Nearby SearchのFieldMaskに`places.photos`を追加し、写真参照名・投稿者の帰属・提供されたGoogle Maps写真リンクを取得します。
2. 店舗IDと一致する写真参照を正規化し、内部型`ReviewCandidate.photoResource`に保持します。投稿者情報が不正な写真は採用しません。
3. 料理の引用照合・半径・営業条件・気分による選定後、最終候補の最大5店舗に各1枚の写真URLを並行取得します。
4. Place Photos (New)を`maxWidthPx=1000`・`skipHttpRedirect=true`で呼び、HTTPSの`googleusercontent.com`またはそのサブドメインの一時URLだけを採用します。
5. 既存の公開項目`photoUrl`・`photoAttributions`へ設定し、検索結果カード・店舗詳細の既存UIへ渡します。公開レスポンスの型変更はありません。

APIキーはサーバー側のヘッダーに設定します。写真参照名は選定時に除外して公開レスポンスへ混入させません。写真参照・写真URLを永続保存せず、外部通信には`cache: "no-store"`を指定します。

写真なし・HTTPエラー・不正なURL・タイムアウトの場合は、写真なしのまま検索結果を返します。既存UIは代替表示を使用します。モック・フロントのデモには今回写真を追加しておらず、写真取得の外部通信もしません。

## 写真が取得されない問題への修正

当初は料理抽出後の写真取得にも、候補取得・料理抽出と同じ10秒期限のsignalを渡していました。抽出が期限切れになって途中結果を返す場合、写真取得開始時点でsignalが中断済みとなり、写真取得が丸ごとスキップされる経路がありました。

修正後は、写真取得に利用者のリクエストsignalを渡し、写真用の独立した最大3秒期限と組み合わせます。これにより抽出が期限切れでも、確認できた店舗の写真を取得できます。利用者のキャンセルは写真取得にも伝わります。

候補取得・料理抽出は従来どおり最大10秒、写真はその後に最大3秒なので、検索全体は最大約13秒になります。

この不具合は架空レスポンスによる自動テストで再現・修正を確認しました。ただし、利用者が見た写真未表示の原因がこの期限問題だけだったかは、実レスポンスを確認していないため断定していません。

## 主な変更ファイル

| ファイル | 内容 |
| --- | --- |
| [nearby-search.ts](../src/server/restaurants/nearby-search.ts) | 写真情報の要求・正規化 |
| [review-types.ts](../src/server/discovery/review-types.ts) | サーバー内部の写真参照型 |
| [photos.ts](../src/server/restaurants/photos.ts) | 写真URLの取得・検証・帰属設定・3秒期限 |
| [review-results.ts](../src/server/restaurants/review-results.ts) | 公開レスポンスから内部写真参照を除外 |
| [search.ts](../src/server/restaurants/search.ts) | 最終候補への写真付与と期限の分離 |
| [photos.test.mjs](../src/server/restaurants/photos.test.mjs) | 写真参照・帰属・通信失敗・URL・中断のテスト |
| [nearby-search.test.mjs](../src/server/restaurants/nearby-search.test.mjs) | FieldMaskの期待値を更新 |
| [search.test.mjs](../src/server/restaurants/search.test.mjs) | 抽出期限切れ後も写真付きHTTPレスポンスを返す回帰テスト |

契約と期限の変更は[API仕様書](api-contract.md)・[設計](architecture.md)にも反映しています。画面の写真表示には[既存コンポーネント](../src/app/_components/restaurant-card.tsx)を使用し、今回UIコードは変更していません。

## 検証結果

以下は今回の実装変更時に実行した結果です。外部APIは架空レスポンスに差し替えています。

```sh
node --test src/server/restaurants/search.test.mjs src/server/restaurants/photos.test.mjs src/server/restaurants/nearby-search.test.mjs src/server/restaurants/review-results.test.mjs
npx tsc --noEmit
npx eslint src/server/restaurants/photos.ts src/server/restaurants/nearby-search.ts src/server/restaurants/review-results.ts src/server/restaurants/search.ts src/server/discovery/review-types.ts
git diff --check
```

- 関連テスト39件成功。最終候補5件だけの写真取得、写真URL・帰属のHTTP返却、内部参照の非公開、失敗時の検索継続を含みます。
- 型チェック・変更したTypeScriptファイルのLint・差分の空白チェックは成功しました。
- `npm run lint`は既存の`src/app/_lib/discovery.ts:45`で停止しました。`@typescript-eslint/no-unsafe-declaration-merging`が`TypeError: context.getScope is not a function`を出しています。
- 本番ビルド・実APIでの取得・ブラウザでの表示確認は未実施です。キーボード・フォーカス・位置情報拒否・戻る操作・動きを減らす設定の実機確認も今回実施していません。

## 残る確認

実環境で再検索し、検索APIの`photoUrl`が返ること、画像の読み込みと投稿者・出典の表示を確認する必要があります。表示できない場合は、`photoUrl`が`null`なのか、URLは返るが画像読み込みが失敗しているのかを切り分けます。現状、写真取得の失敗は検索を成功させるために吸収しており、失敗理由をAPI利用者へは返しません。

Place Photosの呼び出しは課金対象です。今回の実装・検証では有料APIを呼び出していません。取得方法・帰属の扱いは[Google公式のPlace Photosドキュメント](https://developers.google.com/maps/documentation/places/web-service/place-photos)を参照しています。実環境での権限・料金・利用条件の最終確認は別途必要です。

コミット・push・デプロイは行っていません。
