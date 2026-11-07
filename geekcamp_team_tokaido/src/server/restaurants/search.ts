import type { SearchRequest, SearchResponse } from "../../types/restaurants";
import { fetchMockCandidates } from "./mock-data";
import { distanceMeters } from "./distance";
import { cleanseCandidates, classifyCandidates } from "../discovery";
import { orderByMood } from "../../lib/restaurants/mood";

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

export async function searchRestaurants(req: SearchRequest, signal: AbortSignal): Promise<SearchResponse> {
  return selectRestaurants(await fetchMockCandidates(req, signal), req, signal);
}
