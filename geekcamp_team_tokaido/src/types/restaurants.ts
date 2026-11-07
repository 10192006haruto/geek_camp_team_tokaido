/** 検索APIでフロントエンドとサーバーが共有するリクエスト・レスポンスの型。 */
export type Location = { latitude: number; longitude: number };
export const MOOD_LIMIT = 150;
export const MAX_SEARCH_RESULTS = 5;
export type SearchConditions = {
  radiusMeters: 500 | 1000 | 3000;
  mood: string;
  openNow: boolean;
};
export type SearchRequest = SearchConditions & { location: Location };
export type Attribution = {
  text: string;
  url: string | null;
};
export type PriceLevel =
  | "free" | "inexpensive" | "moderate" | "expensive" | "very_expensive";
export type ReviewEvidence = {
  quote: string;
  author: Attribution;
  reviewUrl: string | null;
  publishTime: string | null;
  // Optional transport metadata until the retrieval-side contract is finalized.
  authorPhotoUrl?: string | null;
  originalText?: string | null;
  translated?: boolean;
};
export type InferredMenuItem = { name: string; evidence: ReviewEvidence[] };
export type Restaurant = {
  id: string;
  name: string;
  location: Location | null;
  address: string | null;
  distanceMeters: number | null;
  rating: number | null;
  reviewCount: number | null;
  photoUrl: string | null;
  priceLevel: PriceLevel | null;
  isOpenNow: boolean | null;
  cuisineLabel: string | null;
  inferredMenu: InferredMenuItem[];
  labels: string[];
  recommendationReason: string | null;
  googleMapsUrl: string | null;
  attributions: Attribution[];
  photoAttributions: Attribution[];
};
export type SearchResponse = {
  restaurants: Restaurant[];
  returnedCount: number;
};
export type SearchErrorCode =
  | "INVALID_REQUEST" | "UNSUPPORTED_MEDIA_TYPE" | "METHOD_NOT_ALLOWED"
  | "SEARCH_FAILED" | "UPSTREAM_TIMEOUT" | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";
export type SearchError = {
  error: { code: SearchErrorCode; message: string };
};
