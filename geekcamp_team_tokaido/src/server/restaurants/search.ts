import type { SearchRequest, SearchResponse } from "../../types/restaurants";
import { fetchMockReviewCandidates, mockMenuInference } from "./mock-data";
import { PlacesSearchError } from "./errors";
import { fetchNearbyCandidates } from "./nearby-search";
import { prepareReviewResults, selectReviewRestaurants } from "./review-results";

/** 検索全体（Places＋Gemini＋検証）の期限。位置情報の取得は含まない。 */
export const SEARCH_DEADLINE_MS = 10_000;

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
  return prepareReviewResults(candidates, req, deadline);
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
