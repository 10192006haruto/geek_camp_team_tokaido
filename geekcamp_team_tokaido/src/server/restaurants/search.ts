import type { SearchRequest, SearchResponse } from "../../types/restaurants";
import { fetchMockReviewCandidates, mockMenuInference } from "./mock-data";
import { PlacesSearchError } from "./errors";
import { fetchNearbyCandidates } from "./nearby-search";
import { selectReviewRestaurants } from "./review-results";
import { distanceMeters } from "./distance";
import { inferMenus, MenuInferenceError } from "../discovery/infer-menus";
import type { MenuInference, ReviewCandidate } from "../discovery/review-types";

/** 検索全体（Places＋Gemini＋検証）の期限。位置情報の取得は含まない。 */
export const SEARCH_DEADLINE_MS = 10_000;

/**
 * Gemini に1回で送る店舗数。20店舗をまとめて送ると10秒を超えたため（2026-11-07 実測）、
 * 分割して並行に呼ぶ。送るトークンの合計は変わらない。
 */
export const INFERENCE_BATCH_SIZE = 5;

const hasReviewText = (c: ReviewCandidate) => c.reviews.some((r) => r.text.trim());
/** 期限切れ（TimeoutError）ではなく、利用者の操作で中断されたか。 */
const cancelledByUser = (signal: AbortSignal) => signal.aborted && signal.reason?.name !== "TimeoutError";

export type BatchInference = {
  /** 成功したバッチの抽出結果 */
  inference: MenuInference[];
  /** 失敗したバッチに含まれ、クチコミ本文があった（＝確認できなかった）候補 */
  unchecked: ReviewCandidate[];
};

/**
 * 店舗を分割して inferMenus を並行に呼ぶ。一部のバッチが失敗しても、成功したバッチの結果は使う（途中結果）。
 * クチコミのある候補を1件も確認できなかった場合だけエラーにする。利用者の中断時は何も返さない。
 */
export async function inferMenusInBatches(candidates: ReviewCandidate[], signal: AbortSignal): Promise<BatchInference> {
  const batches: ReviewCandidate[][] = [];
  for (let i = 0; i < candidates.length; i += INFERENCE_BATCH_SIZE) batches.push(candidates.slice(i, i + INFERENCE_BATCH_SIZE));
  const settled = await Promise.allSettled(batches.map((batch) => inferMenus(batch, signal)));
  if (cancelledByUser(signal)) signal.throwIfAborted();
  const inference: MenuInference[] = [];
  const unchecked: ReviewCandidate[] = [];
  const errors: unknown[] = [];
  let checked = 0;
  settled.forEach((result, i) => {
    const withReviews = batches[i].filter(hasReviewText);
    if (result.status === "fulfilled") { inference.push(...result.value); checked += withReviews.length; }
    else { unchecked.push(...withReviews); errors.push(result.reason); }
  });
  if (unchecked.length && !checked) throw mostSevere(errors, signal);
  return { inference, unchecked };
}

/** 全バッチ失敗時に返すエラー。期限切れ → 混雑・設定不足 → その他の順で優先する。想定外の例外はそのまま投げる。 */
function mostSevere(errors: unknown[], signal: AbortSignal): unknown {
  const unexpected = errors.find((e) => !(e instanceof MenuInferenceError));
  if (unexpected) return unexpected;
  const codes = new Set(errors.map((e) => (e as MenuInferenceError).code));
  if (signal.aborted || codes.has("UPSTREAM_TIMEOUT")) return new MenuInferenceError("UPSTREAM_TIMEOUT");
  if (codes.has("SERVICE_UNAVAILABLE")) return new MenuInferenceError("SERVICE_UNAVAILABLE");
  return new MenuInferenceError("SEARCH_FAILED");
}

export type DataSource = "places" | "mock";

/**
 * 店舗データの取得元。環境変数 RESTAURANT_DATA_SOURCE で明示する。
 * 未設定時は開発・テストではモック、本番では設定不足として扱う（黙って架空店舗を返さない）。
 */
export function resolveDataSource(env: Record<string, string | undefined> = process.env): DataSource {
  const value = env.RESTAURANT_DATA_SOURCE?.trim();
  if (value === "places" || value === "mock") return value;
  if (!value && env.NODE_ENV !== "production") return "mock";
  throw new PlacesSearchError("SERVICE_UNAVAILABLE");
}

/** 実APIの経路：Nearby Search → Gemini による料理抽出 → 引用照合・条件適用 → 最大5件。 */
export async function searchPlaces(req: SearchRequest, signal: AbortSignal): Promise<SearchResponse> {
  // 取得と抽出で同じ期限を共有する。呼び出しごとに新しい10秒を与えない。
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(SEARCH_DEADLINE_MS)]);
  const candidates = await fetchNearbyCandidates(req, deadline);
  const { inference, unchecked } = await inferMenusInBatches(candidates, deadline);
  // 期限切れで一部だけ確認できた場合は途中結果として返す。利用者の中断時だけ止める。
  if (cancelledByUser(signal)) signal.throwIfAborted();
  // 確認できていれば表示された可能性のある候補（半径内・営業条件を満たす）だけを数える。
  const uncheckedCount = unchecked.filter((c) => c.location
    && distanceMeters(req.location, c.location) <= req.radiusMeters
    && (!req.openNow || c.isOpenNow === true)).length;
  return selectReviewRestaurants(candidates, inference, req, uncheckedCount);
}

/** モックの経路：架空の候補と固定の抽出結果を、本番と同じ照合・選定に通す。外部通信なし。 */
export async function searchMock(req: SearchRequest, signal: AbortSignal): Promise<SearchResponse> {
  const candidates = await fetchMockReviewCandidates(req, signal);
  signal.throwIfAborted();
  return selectReviewRestaurants(candidates, mockMenuInference(candidates), req);
}

export async function searchRestaurants(req: SearchRequest, signal: AbortSignal): Promise<SearchResponse> {
  return resolveDataSource() === "places" ? searchPlaces(req, signal) : searchMock(req, signal);
}
