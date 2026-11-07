# ふら担当：取得済み20候補から5店舗への選定

2026-11-07更新。ユーザーの担当分離の指示に従い、Nearby取得実装は今回の変更から外しました。

## 今回コミットする範囲

- `src/server/restaurants/review-results.ts`：取得済みのReviewCandidate[]を受け取り、Geminiで料理名・引用を抽出、原文と再照合、投稿者情報を付与し、最大5件のSearchResponseを返す。
- `src/server/restaurants/review-results.test.mjs`：20番目の候補の採用、営業条件、引用不一致、半径、0件、キャンセル、Geminiからフロントの型検証までのテスト。
- 共有型・フロント：公開レスポンス上限5件、投稿者画像・翻訳・原文の内部型、デモの最大5件表示、帰属表示。
- docs：担当境界・5件選定仕様・接続手順。

選定順序は「料理の根拠あり → 営業条件 → 気分優先 → 同順位は直線距離順 → 最大5件」です。同距離はID順。5件未満なら水増ししません。気分は既存のキーワード判定であり、ご当地判定はしません。

## 今回含めない範囲（Yuuto担当）

- Nearby Searchの通信・FieldMask・取得情報の正規化。
- 検索全体の10秒期限の開始と、取得・抽出への同じAbortSignalの受け渡し。
- 検索APIから新処理への切り替え、エラーのHTTP 502/503/504への変換。

前の作業で追加した `nearby-search.ts` と `scripts/check-live-search.mjs` は削除しました。`src/server/restaurants/search.ts`、同テスト、`src/app/api/restaurants/search/route.ts` は今回の作業前の状態へ戻しています。したがって通常の検索APIは旧モック・最大5件・inferredMenu=[]のままです。

## 接続例（Yuuto向け・未接続）

```ts
import { prepareReviewResults } from "@/server/restaurants/review-results";

// Nearby取得を始める前に期限を作る。
const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
// Yuuto側の取得関数で、レビューの番号・本文・帰属を保持して正規化する。
const candidates = await yourNearbySearch(searchRequest, signal);
return await prepareReviewResults(candidates, searchRequest, signal);
```

`yourNearbySearch` は説明用の名前です。入力は `src/server/discovery/review-types.ts` のReviewCandidate[]（最大20店舗・各最大5レビュー）。レビュー番号は0〜4で店舗内一意、本文欠損を除外しても振り直さないでください。投稿者画像・原文・翻訳状態は任意項目です。

戻り値はSearchResponseなのでそのままHTTP応答に使えます。`MenuInferenceError.code` のSEARCH_FAILEDは502、SERVICE_UNAVAILABLEは503、UPSTREAM_TIMEOUTは504へ変換してください。通常の操作キャンセルはAbortErrorとして伝播します。外部通信・HTTP応答のno-store、レビュー利用条件と帰属の確認は接続時に行ってください。

## 検証と制約

テストでは正規化済みの架空20候補を使い、Gemini通信を置き換えて、料理抽出から最終5件・フロントのレスポンス検証までを確認します。Nearby APIは呼びません。空のレビューではGeminiも呼びません。

前段の接続作業では実PlacesがHTTP 403（PERMISSION_DENIED / ACCESS_DENIED）を返し、実店舗での成功は確認できませんでした。その接続コードは今回除外済みです。過去に成功した架空レビューのGemini単体検証とは区別してください。今回の担当分離後には実APIを再実行していません。

担当分離後の自動テストは64件成功（フロント33・サーバー31）、型チェック成功。lintは既存のcontext.getScope互換性エラーで停止。本番ビルドは分離前には成功しており、分離後は再実行していません。

GUIデモは架空データの料理・引用・投稿者と最大5件を確認できます。GUIの実店舗表示はYuuto側の接続後に確認します。ブラウザ実操作は未確認です。

コミット・push・デプロイは行っていません。
