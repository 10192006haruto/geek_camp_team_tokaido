# ふら担当：レビュー料理抽出・画面表示の実装と実通信検証

実施日：2026-11-07。対象仕様：[レビュー料理抽出MVP](review-dishes-mvp-spec.md)。

## 完了した範囲

- `src/server/discovery/infer-menus.ts`：レビューから料理名・引用を抽出するinferMenusを実装。
- `src/server/discovery/review-types.ts`：Yuutoから受け取るReviewCandidate、PlaceReviewと、返すMenuInferenceを定義。
- `src/types/restaurants.ts`：必須のinferredMenu、ReviewEvidence、InferredMenuItem、20件の受理上限を追加。
- フロントのレスポンス検証を最大20件へ変更。欠落・空引用・不正な日時等を検出。
- カードに料理名、詳細に引用・投稿者・元レビューへのリンクを表示。任意で投稿者画像、翻訳表示、原文、投稿日時にも対応。
- 通常デモはフロント内の架空レビュー付きデータに変更。実API呼び出しとは分離。
- 地域カタログをレビュー抽出には使用せず、「ご当地と確認済み」「現在提供中」と表示しない。

既存の店舗検索処理の変更は、共有型への対応としてinferredMenu=[]を返す1箇所のみです。Nearby Search取得・最終的な帰属付与・検索全体の10秒制限・API経路の切り替えはYuuto担当の接続作業として残しています。

## Geminiの方式

- 既定モデル：`gemini-3.5-flash-lite`。`GEMINI_MODEL`でサーバー側のみ上書き可能。
- `GEMINI_API_KEY`をサーバー側で使用。環境変数ファイルは変更していません。
- 最大20店舗・各5レビューを1回のgenerateContentにまとめて送ります。送るのは店舗ID、レビュー番号、本文のみ。
- 地域性・店名からの推測は禁止。否定・別店舗・本文中の命令を除外する指示を含めます。
- JSONモード（responseMimeType=application/json）を使用し、JSON Schemaを指示に含め、返答をコードで厳密に検証します。API側のスキーマ強制に依存しません。
- 当初のスキーマ指定付き送信はHTTP 400となり、公開API定義も確認して切り分けました。最終採用したJSONモードで実通信成功を確認しています。
- 自動再試行はありません。親AbortSignalと関数内10秒上限を組み合わせ、親の期限が先なら即座に中断します。
- 全対象店舗の応答を検証して返します。時間切れはUPSTREAM_TIMEOUTで、途中結果・空配列に変換しません。
- 入力本文合計20万UTF-16コード単位超は明示的に拒否。黙って切り詰めません。出力は1店舗最大10料理・各最大5引用を検証します。
- 未知・重複した店舗ID、欠落結果、未知のレビュー番号、不正JSON、生成中断はSEARCH_FAILED。キー・モデル設定不足、401/403/404/429はSERVICE_UNAVAILABLE。
- 引用不一致・空引用・引用に料理名がない根拠は破棄し、残る根拠がない料理も破棄します。文脈の意味まで機械的に保証するものではありません。

## Yuuto向け接続

```ts
import { inferMenus, MenuInferenceError } from "@/server/discovery/infer-menus";
import type { ReviewCandidate } from "@/server/discovery/review-types";

// Nearby Search前に作成して、取得と推測で同じ期限を共有する。
const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
// candidates: ReviewCandidate[] は取得担当が準備する。
const inference = await inferMenus(candidates, signal);
```

推測結果はplaceIdで対応付けます。Yuuto側でも引用を照合し、reviewIndexを元のレビューへ戻して投稿者・URL・日時を付け、Restaurant.inferredMenuへ格納してください。料理なしの店舗を除外し、営業条件・気分を適用して最大20件を返します。

MenuInferenceError.codeを既存の502/503/504へ変換してください。呼び出し元のAbortErrorは操作中断です。既存のgemini-json.tsは公式メニュー補助用としてそのまま残しており、新経路はinfer-menus.tsを呼びます。

帰属の補足情報authorPhotoUrl/originalText/translatedは任意です。レビュー送信・保存・表示の利用条件と必要項目の最終確認は実店舗接続前に必要です。今回の実通信は自作の架空本文だけを使用しています。

## 実API検証結果

ユーザーの実API使用指示に基づき、設定済みキーで実施しました。キー・実店舗レビューは出力していません。

1. モデル情報取得：HTTP 200、指定モデルを確認。
2. スキーマ指定付き生成：HTTP 400。最小の「OK」要求は10秒でタイムアウト。この結果を成功とは扱っていません。
3. JSONモードで架空3店舗をまとめて抽出：HTTP 200。
4. 成功した方式を本関数に反映し、同じCLIで最終確認：HTTP 200、**2,890ms**。

最終検証の入力は、料理を食べたレビュー、料理がなかった・別店舗で食べたレビュー、命令文を含むレビューの3件です。

| 項目 | 結果 |
| --- | --- |
| 抽出料理 | 天ぷらそば |
| 否定・別店舗の例 | items=[] |
| 命令文の例 | items=[] |
| 引用 | 入力原文との一致を確認 |
| 入力トークン | 481 |
| 出力トークン | 141 |
| 合計トークン | 622 |
| フロント用検証 | 公開JSONへの変換・parseSearchResponse成功 |
| 詳細画面 | 実返答から料理名・引用・架空投稿者をHTML描画できることを確認 |

件数・本文が少ない1ケースの結果であり、20店舗の実データを10秒以内で処理できる保証ではありません。料金は計算していません。

再実行は以下です。明示的な--liveが必要で、実際のAPI利用が発生します。

```sh
node --env-file=.env.local scripts/check-review-inference.mjs --live
```

検証CLI内の最終レスポンス変換はテスト専用アダプターです。実APIから料理が返ったことと、フロントの型検証・描画は確認できましたが、**本番の/api/restaurants/search経由のレビュー抽出はまだ未接続**です。

## GUIでの確認手順

アプリのルートで起動します。すでに開発サーバーが起動している場合は、そのURLを利用してください。

```sh
npm run dev
```

1. ブラウザで開発サーバーのURL（通常は http://localhost:3000 ）を開きます。
2. 「位置情報を使わず、デモで試す」を選びます。
3. 「デモの表示状態」を開き、「通常・料理と引用の表示」で検索します。
4. 店舗カードの料理名を確認し、詳細を開いて「クチコミで言及された料理」、引用、架空の投稿者を確認します。
5. 戻る操作、気分・営業中などの検索条件の変更を確認します。
6. デモの表示状態を「0件」「情報の一部欠損」「検索失敗」「遅い検索（4秒）」へ切り替え、各表示と操作を確認します。

このGUIデモは架空データを使い、Google Places・Geminiには通信しません。実Geminiの応答確認は上記CLIで行っています。GUIから実店舗レビューを抽出して表示する一連の確認は、Yuuto担当のAPI接続後に実施します。

## ローカル確認・残作業

- フロント33件、新規抽出10件、既存判定12件、既存API5件の計60テスト成功。
- TypeScript型チェック・本番ビルド成功。
- lintは既存のcontext.getScope互換性エラーで停止。今回依存変更は行っていません。
- ブラウザ確認を試みましたが、接続ホストが利用不可でした。実機の位置許可・フォーカス・スクロール・reduced-motionは未確認です。
- Yuuto側が新経路へ切り替えるまでは、通常のHTTP検索は旧モック・最大5件・inferredMenu=[]です。
- 20件の実通信性能・実店舗レビューの抽出精度、利用条件と帰属、途中結果を返す拡張は未確認・未実装です。
- コミット・push・デプロイは行っていません。
