import type { SearchRequest, SearchResponse } from "../../types/restaurants";
import { fetchMockReviewCandidates, mockMenuInference } from "./mock-data";
import { PlacesSearchError } from "./errors";
import { fetchNearbyCandidates } from "./nearby-search";
import { selectReviewRestaurants } from "./review-results";
import { inferMenus, MenuInferenceError } from "../discovery/infer-menus";
import type { MenuInference, ReviewCandidate } from "../discovery/review-types";

/** 検索全体（Places＋Gemini＋検証）の期限。位置情報の取得は含まない。 */
export const SEARCH_DEADLINE_MS = 10_000;

/**
 * Gemini に1回で送る店舗数。20店舗をまとめて送ると10秒を超えたため（2026-11-07 実測）、
 * 分割して並行に呼ぶ。送るトークンの合計は変わらない。
 */
export const INFERENCE_BATCH_SIZE = 5;

/** 店舗を分割して inferMenus を並行に呼ぶ。1つでも失敗したら残りを止め、途中結果は返さない。 */
export async function inferMenusInBatches(candidates: ReviewCandidate[], signal: AbortSignal): Promise<MenuInference[]> {
  const batches: ReviewCandidate[][] = [];
  for (let i = 0; i < candidates.length; i += INFERENCE_BATCH_SIZE) batches.push(candidates.slice(i, i + INFERENCE_BATCH_SIZE));
  const siblings = new AbortController();
  const batchSignal = AbortSignal.any([signal, siblings.signal]);
  try {
    return (await Promise.all(batches.map((batch) => inferMenus(batch, batchSignal)))).flat();
  } catch (error) {
    siblings.abort();
    // 期限切れ・利用者の中断は、兄弟の中断よりも親 signal の理由を優先して伝える。
    if (signal.aborted) {
      if (signal.reason?.name === "TimeoutError") throw new MenuInferenceError("UPSTREAM_TIMEOUT");
      signal.throwIfAborted();
    }
    throw error;
  }
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
  const inference = await inferMenusInBatches(candidates, deadline);
  if (deadline.aborted) {
    if (deadline.reason?.name === "TimeoutError") throw new MenuInferenceError("UPSTREAM_TIMEOUT");
    deadline.throwIfAborted();
  }
  return selectReviewRestaurants(candidates, inference, req);
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
