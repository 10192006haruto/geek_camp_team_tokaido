import type { SearchRequest, SearchResponse, Restaurant } from "@/types/restaurants";
import { fetchMockCandidates, type CandidateRestaurant } from "./mock-data";
import { distanceMeters } from "./distance";

const MAX_RESULTS = 5;

export async function searchRestaurants(
  req: SearchRequest,
  signal: AbortSignal,
): Promise<SearchResponse> {
  // 1. 取得（ここを差し替えればモック → 実APIに切り替わる）
  const candidates = await fetchMockCandidates(req, signal);
  signal.throwIfAborted();

  // 2. 距離を計算して半径・条件で絞り込み
  const filtered = candidates
    .map((c) => ({
      c,
      distance: c.location ? distanceMeters(req.location, c.location) : null,
    }))
    .filter(({ distance }) => distance !== null && distance <= req.radiusMeters)
    .filter(({ c }) => req.cuisine === null || c.cuisineLabel === req.cuisine)
    .filter(({ c }) =>
      req.budgetMaxYen === null ||
      (c.budgetYen !== null && c.budgetYen <= req.budgetMaxYen));

  // 3. 判定（後藤さんの classifyCandidates と合意できるまでは仮：全部採用・ラベルなし）
  // const decisions = await classifyCandidates(filtered.map(f => f.c), config);

  // 4. 並べ替え → 5件 → 公開用の型に変換
  const restaurants: Restaurant[] = filtered
    .sort((a, b) => a.distance! - b.distance!)
    .slice(0, MAX_RESULTS)
    .map(({ c, distance }) => toRestaurant(c, distance));

  return { restaurants, returnedCount: restaurants.length };
}

function toRestaurant(c: CandidateRestaurant, distance: number | null): Restaurant {
  return {
    id: c.id,
    name: c.name,
    location: c.location,
    address: c.address,
    distanceMeters: distance === null ? null : Math.round(distance),
    rating: c.rating,
    reviewCount: c.reviewCount,
    photoUrl: null,
    priceLevel: c.priceLevel,
    isOpenNow: c.isOpenNow,
    cuisineLabel: c.cuisineLabel,
    labels: [],                      // 判定結果が来たらそこから
    recommendationReason: null,      // 根拠がなければ null（捏造しない）
    googleMapsUrl: null,
    attributions: [],
    photoAttributions: [],
  };
}
