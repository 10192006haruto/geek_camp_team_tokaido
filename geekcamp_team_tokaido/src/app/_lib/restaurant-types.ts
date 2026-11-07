import type { Restaurant as SharedRestaurant, Attribution } from "../../types/restaurants";
export type { Location, SearchRequest, Attribution, PriceLevel } from "../../types/restaurants";
export type { SearchConditions as Filters } from "../../types/restaurants";
export type RestaurantPhotoData = { url: string; label: string | null; attributions: Attribution[] };
// Presentation-only extension; the HTTP contract uses SharedRestaurant.
export type Restaurant = SharedRestaurant & { photos?: RestaurantPhotoData[] };
// uncheckedCount: 料理を確認できなかった候補の数（0 = 全件確認済み）。共有型 SearchResponse と同じ意味。
export type SearchResponse = { restaurants: Restaurant[]; returnedCount: number; uncheckedCount: number };
export type PreviewScenario = "success" | "empty" | "error" | "missing" | "slow" | "rank-error";
