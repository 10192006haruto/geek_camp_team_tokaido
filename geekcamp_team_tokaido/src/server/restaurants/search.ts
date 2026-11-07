import type { SearchRequest, SearchResponse } from "../../types/restaurants";
import { fetchMockCandidates } from "./mock-data";
import { distanceMeters } from "./distance";
import { cleanseCandidates, classifyCandidates } from "../discovery";
import { orderByMood } from "../../lib/restaurants/mood";
import { PlacesSearchError } from "./errors";
import { fetchNearbyCandidates } from "./nearby-search";
import { prepareReviewResults } from "./review-results";

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

/** Final limit belongs here, after regional evidence, opening status and mood. */
export async function selectRestaurants(input: unknown, req: SearchRequest, signal: AbortSignal): Promise<SearchResponse> {
  signal.throwIfAborted();
  const candidates = cleanseCandidates(input)
    .map((c) => ({ ...c, distanceMeters: c.location ? distanceMeters(req.location, c.location) : null }))
    .filter((c) => c.distanceMeters !== null && c.distanceMeters <= req.radiusMeters);
  const decisions = new Map((await classifyCandidates(candidates, { searchLocation: req.location })).map((d) => [d.id, d]));
  signal.throwIfAborted();
  const eligible = candidates.flatMap((candidate) => {
    const decision = decisions.get(candidate.id);
    if (!decision?.selected || (req.openNow && candidate.isOpenNow !== true)) return [];
    const { localDishes, menuItems, isChain, ...restaurant } = candidate;
    void localDishes; void menuItems; void isChain;
    return [{ restaurant: { ...restaurant, inferredMenu: [], labels: decision.labels, recommendationReason: decision.recommendationReason },
      dishes: decision.evidence.map((e) => e.dish).join(" ") }];
  }).sort((a, b) => a.restaurant.distanceMeters! - b.restaurant.distanceMeters!);
  const restaurants = orderByMood(eligible, req.mood, (item) => `${item.dishes} ${item.restaurant.cuisineLabel ?? ""}`)
    .slice(0, 5).map(({ restaurant }) => restaurant);
  return { restaurants, returnedCount: restaurants.length };
}

/** 実APIの経路：Nearby Search → Gemini による料理抽出 → 引用照合・条件適用 → 最大5件。 */
export async function searchPlaces(req: SearchRequest, signal: AbortSignal): Promise<SearchResponse> {
  // 取得と抽出で同じ期限を共有する。呼び出しごとに新しい10秒を与えない。
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(SEARCH_DEADLINE_MS)]);
  const candidates = await fetchNearbyCandidates(req, deadline);
  return prepareReviewResults(candidates, req, deadline);
}

export async function searchRestaurants(req: SearchRequest, signal: AbortSignal): Promise<SearchResponse> {
  if (resolveDataSource() === "places") return searchPlaces(req, signal);
  return selectRestaurants(await fetchMockCandidates(req, signal), req, signal);
}
