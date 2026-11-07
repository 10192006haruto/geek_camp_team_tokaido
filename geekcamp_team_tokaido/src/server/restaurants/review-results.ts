import "server-only";
import { MAX_SEARCH_RESULTS, type Restaurant, type SearchRequest, type SearchResponse } from "../../types/restaurants";
import { orderByMood } from "../../lib/restaurants/mood";
import { inferMenus, MenuInferenceError } from "../discovery/infer-menus";
import type { MenuInference, ReviewCandidate } from "../discovery/review-types";
import { distanceMeters } from "./distance";

/** Recheck citations and attach authors from Places, never from model-generated metadata. */
/** uncheckedCount：料理を確認できなかったクチコミ付き候補の数（呼び出し元が数える。全件確認済みなら0）。 */
export function selectReviewRestaurants(candidates: ReviewCandidate[], inference: MenuInference[], req: SearchRequest, uncheckedCount = 0): SearchResponse {
  const byId = new Map(inference.map((result) => [result.placeId, result.items]));
  const eligible: Restaurant[] = candidates.flatMap((candidate) => {
    const distance = candidate.location ? distanceMeters(req.location, candidate.location) : null;
    if (distance === null || distance > req.radiusMeters || (req.openNow && candidate.isOpenNow !== true)) return [];
    const inferredMenu = (byId.get(candidate.id) ?? []).flatMap((item) => {
      const evidence = item.evidence.flatMap((entry) => {
        const review = candidate.reviews.find((r) => r.index === entry.reviewIndex);
        if (!item.name.trim() || !entry.quote.trim() || !review?.text.includes(entry.quote)
          || !entry.quote.includes(item.name) || !review.author.displayName.trim()) return [];
        return [{ quote: entry.quote, author: { text: review.author.displayName, url: review.author.uri },
          reviewUrl: review.googleMapsUri, publishTime: review.publishTime,
          authorPhotoUrl: review.authorPhotoUrl ?? null, originalText: review.translated ? review.originalText ?? null : null,
          translated: review.translated ?? false }];
      });
      return evidence.length ? [{ name: item.name, evidence }] : [];
    });
    if (!inferredMenu.length) return [];
    const { reviews, ...restaurant } = candidate;
    void reviews;
    return [{ ...restaurant, distanceMeters: distance, inferredMenu, labels: [],
      recommendationReason: `クチコミに${inferredMenu.map((item) => item.name).join("・")}の言及あり` }];
  }).sort((a, b) => a.distanceMeters! - b.distanceMeters! || a.id.localeCompare(b.id));
  const restaurants = orderByMood(eligible, req.mood,
    (r) => `${r.inferredMenu.map((item) => item.name).join(" ")} ${r.cuisineLabel ?? ""}`).slice(0, MAX_SEARCH_RESULTS);
  return { restaurants, returnedCount: restaurants.length, uncheckedCount };
}

/** Yuuto passes normalized candidates and the remaining whole-search deadline. */
export async function prepareReviewResults(candidates: ReviewCandidate[], req: SearchRequest, signal: AbortSignal): Promise<SearchResponse> {
  const inference = await inferMenus(candidates, signal);
  if (signal.aborted) {
    if (signal.reason?.name === "TimeoutError") throw new MenuInferenceError("UPSTREAM_TIMEOUT");
    signal.throwIfAborted();
  }
  return selectReviewRestaurants(candidates, inference, req);
}
