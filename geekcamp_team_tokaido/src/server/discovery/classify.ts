/** 確認済みの料理根拠と設定された条件に基づき、店舗の一次選定と理由の作成を行う。 */
import "server-only";
import { cleanseCandidates } from "./cleanse";
import { matchMenuDishes } from "./match-menu";
import { regionalDishCatalog } from "./regional-dishes";
import { normalizePrefecture, prefectureForLocation } from "./search-geography";
import type { CandidateRestaurant, DiscoveryConfig, DiscoveryDecision, DishEvidence } from "./types";

function validateConfig(config: DiscoveryConfig) {
  if (config.regionalDishes !== undefined && !Array.isArray(config.regionalDishes))
    throw new TypeError("Invalid regionalDishes");
  if (config.minRating !== undefined && (!Number.isFinite(config.minRating) || config.minRating < 0 || config.minRating > 5))
    throw new RangeError("Invalid minRating");
  if (config.maxReviewCount !== undefined && (!Number.isSafeInteger(config.maxReviewCount) || config.maxReviewCount < 0))
    throw new RangeError("Invalid maxReviewCount");
  if (config.excludeChains !== undefined && typeof config.excludeChains !== "boolean")
    throw new TypeError("Invalid excludeChains");
}

/** 地域名と料理名から、画面に表示する一言を作る。長い料理名は途中で切らない。 */
export function formatRecommendationReason(evidence: DishEvidence): string {
  const full = `${evidence.region}名物の${evidence.dish}を提供`;
  if (Array.from(full).length <= 20) return full;
  const dishOnly = `郷土料理の${evidence.dish}を提供`;
  return Array.from(dishOnly).length <= 20 ? dishOnly : "地域ならではの郷土料理を提供";
}

/** 判定だけを呼ぶ場合の入口。受け取った候補の値を整えてから一次選定する。 */
export async function classifyCandidates(input: unknown, config: DiscoveryConfig = {}): Promise<DiscoveryDecision[]> {
  return classifyCleanCandidates(cleanseCandidates(input), config);
}

/** 県を先に特定し、その県の料理だけを公式メニューの抽出と照合に使う。 */
export function regionalScope(config: DiscoveryConfig) {
  validateConfig(config);
  const region = prefectureForLocation(config.searchLocation);
  const catalog = config.regionalDishes ?? regionalDishCatalog;
  return {
    region,
    catalog: region ? catalog.filter((dish) =>
      typeof dish?.region === "string" && normalizePrefecture(dish.region) === region) : catalog,
  };
}

/** 整形済みの候補と同じ順で、店舗ごとの採否と根拠を返す。 */
export function classifyCleanCandidates(
  candidates: CandidateRestaurant[],
  config: DiscoveryConfig,
  scope = regionalScope(config),
): DiscoveryDecision[] {
  return candidates.map((candidate) => {
    // メニューを確認した結果が空なら、過去に渡された根拠へ戻らない。
    const dishes = candidate.menuItems === undefined
      ? candidate.localDishes.filter((dish) => !scope.region || normalizePrefecture(dish.region) === scope.region)
      : matchMenuDishes(candidate.menuItems, scope.catalog);
    let exclusion: DiscoveryDecision["exclusion"] = null;
    if (config.excludeChains && candidate.isChain !== false) exclusion = "chain";
    else if (config.minRating !== undefined && (candidate.rating === null || candidate.rating < config.minRating)) exclusion = "rating";
    else if (config.maxReviewCount !== undefined && (candidate.reviewCount === null || candidate.reviewCount > config.maxReviewCount)) exclusion = "review_count";
    else if (dishes.length === 0) exclusion = "insufficient_evidence";
    const evidence = exclusion === null ? dishes : [];
    return {
      id: candidate.id, selected: exclusion === null, exclusion,
      labels: exclusion === null ? ["ご当地料理"] : [],
      recommendationReason: evidence.length ? formatRecommendationReason(evidence[0]) : null,
      evidence,
    };
  });
}
