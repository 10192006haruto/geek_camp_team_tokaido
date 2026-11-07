# アーキテクチャと担当境界

> 2026-11-07更新（Yuuto）：検索APIをクチコミ料理抽出の経路へ切り替えました。仕様は[MVP仕様](review-dishes-mvp-spec.md)、公開契約は[API契約](api-contract.md)、受け渡しの型は[型と受け渡しの案](review-menu-inference-proposal.md)を参照してください。実店舗での`places`の動作は未確認です。

## 現在の接続

同一Next.jsアプリ内で処理します。別サーバーは導入しません。フロントからPlaces・Geminiを直接呼びません。

```text
UI（範囲・気分・営業中のみ）
 → POST /api/restaurants/search（route.ts：Content-Type・JSON・入力検証、エラー→HTTP変換）
 → searchRestaurants（search.ts）：RESTAURANT_DATA_SOURCEで取得元を選択
    places：10秒の期限付きsignalを作成
      → fetchNearbyCandidates（nearby-search.ts）：Nearby Searchで最大20店舗・各最大5クチコミ → ReviewCandidate[]
      → prepareReviewResults（review-results.ts）
          → inferMenus（discovery/infer-menus.ts）：Geminiで料理名・引用を抽出
          → 引用照合・帰属付与 → 半径・営業条件 → 距離順・気分の優先 → 最大5件
    mock：fetchMockReviewCandidates＋固定の抽出結果 → 同じ照合・選定（selectReviewRestaurants）
 → UIは返された結果をそのまま表示
```

`src/server/discovery/`のご当地判定（郷土料理カタログ照合・公式メニュー取得）は削除せず残していますが、現在の検索経路からは呼びません。

## 所有者と配置

| 配置 | 責務・担当 |
| --- | --- |
| src/app/_components/、src/app/_lib/ | UI・検索クライアント・履歴、ふら |
| src/app/api/restaurants/search/route.ts | HTTP境界、エラーのHTTP変換、Yuuto |
| src/server/restaurants/search.ts、nearby-search.ts、mock-data.ts、errors.ts | 取得元の選択、Nearby取得・正規化、モック、期限管理、Yuuto |
| src/server/restaurants/review-results.ts | 抽出結果の照合・最終5件の選定、ふら作成 |
| src/server/discovery/ | Geminiによる料理抽出・プロンプト（infer-menus.ts）、既存のご当地判定、ふら（後藤から引き継ぎ） |
| src/types/restaurants.ts | 公開API共有型、ふら・Yuuto |
| src/lib/restaurants/mood.ts | 根拠のある料理情報での安定した並べ替え |

後藤は設計担当で、判定・抽出方針の設計確認を行います。他担当の変更理由はレビューで明示します。公開契約変更は共有型・モック・[API仕様](api-contract.md)を同時に更新します。

## 取得と抽出の境界

内部型は`src/server/discovery/review-types.ts`の`ReviewCandidate`・`PlaceReview`・`MenuInference`です。

- 取得側は不明値をnullのまま渡し、クチコミ番号（0〜4）は本文・投稿者名のないものを除いても振り直しません。
- Geminiへ送るのは店舗ID・クチコミ番号・本文だけです。投稿者・URL・日時は照合後に取得データから付与し、モデルに生成させません。
- 取得と抽出は同じ10秒の期限を共有します。`PlacesSearchError`・`MenuInferenceError`の`code`をroute.tsで502/503/504へ変換します。利用者の中断はAbortErrorとして扱います。
- `places`でキー未設定・権限不足のときは503で、モックへは切り替えません。取得元が未設定の場合、開発中のみモックを使います。

Nearby Searchは`places.reviews`を含むためEnterprise + Atmosphereの料金区分です。クチコミの表示・保存・Geminiへの送信に関する利用条件は未確認です。

## 状態と競合

条件変更では位置を再取得せず、3条件と既存位置をAPIへ送ります。現在地更新では明示的に位置を再取得します。成功までは前回結果を保持。API結果のメモリキャッシュキーには位置・半径・気分・営業条件・モードを含めます。位置や気分を永続保存しません。

AbortControllerと世代番号で古い応答を破棄します。UIはAPI結果を再フィルター・再ランキングしません。詳細から戻る時の履歴・フォーカス・スクロール復元は既存実装を維持します。

## デモと検証

「デモで試す」は、料理名・引用・架空投稿者を持つフロント専用データで表示を確認します（検索APIは呼びません）。0件・欠損・失敗・遅延などの表示状態デモもフロント専用データです。検索APIの結合確認は、通常の検索で`mock`または`places`を使って行います。

サーバー側の自動テストは外部APIを呼ばず、入力境界・null/0/false・クチコミ番号の保持・引用不一致・料理なし・0件・半径外・営業条件・6件目以降の採用・キー未設定・401/403/429・不正応答・期限切れ・中断・HTTPエラー変換を確認します。スマホ実機の位置許可、戻る、フォーカス、動きを減らす設定は別途確認します。
