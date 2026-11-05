export type Location = { latitude: number; longitude: number };
export type SearchRequest = {
  location: Location;
  radiusMeters: 500 | 1000 | 3000;
  cuisine: string | null;
  budgetMaxYen: number | null;
};
export type Attribution = {
  text: string;
  url: string | null;
};
export type PriceLevel =
  | "free" | "inexpensive" | "moderate" | "expensive" | "very_expensive";
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