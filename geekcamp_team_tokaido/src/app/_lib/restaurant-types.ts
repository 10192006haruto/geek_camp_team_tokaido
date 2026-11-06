import type { Restaurant as SharedRestaurant, Attribution } from "../../types/restaurants";
export type { Location, SearchRequest, Attribution, PriceLevel } from "../../types/restaurants";
export type { SearchConditions as Filters } from "../../types/restaurants";
export type RestaurantPhotoData = { url: string; label: string | null; attributions: Attribution[] };
// Presentation-only extension; the HTTP contract uses SharedRestaurant.
export type Restaurant = SharedRestaurant & { photos?: RestaurantPhotoData[] };
export type SearchResponse = { restaurants: Restaurant[]; returnedCount: number };
export type PreviewScenario = "success" | "empty" | "error" | "missing" | "slow" | "rank-error";
