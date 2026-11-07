/** 検索側から呼ぶ判定の入口。県で絞った料理と公式メニューを照合し、近い順に返す。 */
import "server-only";
import type { Restaurant } from "../../types/restaurants";
import { cleanseCandidates } from "./cleanse";
import { classifyCandidates, classifyCleanCandidates, formatRecommendationReason, regionalScope } from "./classify";
import { addPlacesMenus } from "./places-menu";
import { straightLineMeters } from "./search-geography";
import type { CandidateRestaurant, DiscoveryConfig, DiscoveryRecommendation } from "./types";

export { cleanseCandidates, classifyCandidates };
export type { CandidateRestaurant, DiscoveryConfig, DiscoveryDecision, DiscoveryRecommendation, DishEvidence, MenuItem, RegionalDish } from "./types";

/** 検索条件を適用した候補を受け取り、Placesを明示的に指定した場合だけ公式メニューを取得する。 */
export async function discoverRestaurantsWithOfficialMenus(
  input: unknown,
  config: DiscoveryConfig = {},
  signal?: AbortSignal,
): Promise<Restaurant[]> {
  signal?.throwIfAborted();
  const cleaned = cleanseCandidates(input);
  const scope = regionalScope(config);
  const candidates = config.officialMenuSource === "google-places"
    ? await addPlacesMenus(cleaned, scope.catalog, signal, undefined, config.gemini?.model)
    : cleaned;
  signal?.throwIfAborted();
  return selectRecommendations(candidates, config, scope).map(({ restaurant }) => restaurant);
}

/** 確認済みのメニューや根拠から推薦を作り、検索APIに返せる店舗情報だけを取り出す。 */
export async function discoverRestaurants(
  input: unknown,
  config: DiscoveryConfig = {},
  signal?: AbortSignal,
): Promise<Restaurant[]> {
  return (await discoverRecommendations(input, config, signal)).map(({ restaurant }) => restaurant);
}

/** 推薦に使った料理と出典も含めて、サーバー内で参照できるようにする。 */
export async function discoverRecommendations(
  input: unknown,
  config: DiscoveryConfig = {},
  signal?: AbortSignal,
): Promise<DiscoveryRecommendation[]> {
  signal?.throwIfAborted();
  return selectRecommendations(cleanseCandidates(input), config, regionalScope(config));
}

function selectRecommendations(
  candidates: CandidateRestaurant[],
  config: DiscoveryConfig,
  scope: ReturnType<typeof regionalScope>,
): DiscoveryRecommendation[] {
  const decisions = classifyCleanCandidates(candidates, config, scope);
  const selected = candidates.flatMap((candidate, candidateIndex) => {
    const decision = decisions[candidateIndex];
    if (!decision.selected) return [];
    const { localDishes, menuItems, isChain, ...restaurant } = candidate;
    void localDishes; void menuItems; void isChain;
    const evidence = decision.evidence[0];
    return [{
      evidenceId: `dish-${candidateIndex + 1}-1`,
      evidence,
      restaurant: {
        ...restaurant,
        inferredMenu: [],
        distanceMeters: restaurant.distanceMeters ?? straightLineMeters(config.searchLocation, restaurant.location),
        labels: decision.labels,
        recommendationReason: formatRecommendationReason(evidence),
      },
    }];
  });
  // 距離が不明な店舗は後ろに置く。同距離の候補は取得時の順序を維持する。
  return selected.sort((a, b) => {
    const left = a.restaurant.distanceMeters ?? Infinity;
    const right = b.restaurant.distanceMeters ?? Infinity;
    return left === right ? 0 : left - right;
  }).slice(0, 5);
}

export { inferMenus, MenuInferenceError } from "./infer-menus";
export type { ReviewCandidate, PlaceReview, MenuInference, InferredMenuItemDraft } from "./review-types";
