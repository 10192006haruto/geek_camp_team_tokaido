/** Internal contract shared by Places retrieval and review inference. */
import type { Restaurant } from "../../types/restaurants";

export type PlaceReview = {
  index: number;
  text: string;
  languageCode: string | null;
  rating: number | null;
  publishTime: string | null;
  author: { displayName: string; uri: string | null };
  googleMapsUri: string | null;
};
export type ReviewCandidate = Omit<Restaurant, "labels" | "recommendationReason" | "inferredMenu"> & {
  reviews: PlaceReview[];
};
export type InferredMenuItemDraft = {
  name: string;
  evidence: { reviewIndex: number; quote: string }[];
};
export type MenuInference = { placeId: string; items: InferredMenuItemDraft[] };
