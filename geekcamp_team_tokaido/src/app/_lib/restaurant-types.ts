// Frontend-local contract until src/types/restaurants.ts is introduced by the team.
// Existing legacy wire contract; see ../FRONTEND.md for the frontend adapter boundary.
export type Location = { latitude: number; longitude: number };
export type Filters = { radiusMeters: 500 | 1000 | 3000; cuisine: string | null; budgetMaxYen: number | null };
export type SearchRequest = Filters & { location: Location };
export type Attribution = { text: string; url: string | null };
export type RestaurantPhotoData = { url: string; label: string | null; attributions: Attribution[] };
export type PriceLevel = "free" | "inexpensive" | "moderate" | "expensive" | "very_expensive";
export type Restaurant = {
  id: string; name: string; location: Location | null; address: string | null;
  distanceMeters: number | null; rating: number | null; reviewCount: number | null;
  photos?: RestaurantPhotoData[]; // Optional future adapter capability; legacy photoUrl remains supported.
  photoUrl: string | null; priceLevel: PriceLevel | null; isOpenNow: boolean | null;
  cuisineLabel: string | null; labels: string[]; recommendationReason: string | null;
  googleMapsUrl: string | null; attributions: Attribution[]; photoAttributions: Attribution[];
};
export type SearchResponse = { restaurants: Restaurant[]; returnedCount: number };
export type PreviewScenario = "success" | "empty" | "error" | "missing" | "slow" | "rank-error";
