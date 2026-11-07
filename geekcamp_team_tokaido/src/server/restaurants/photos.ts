import "server-only";
import type { Restaurant } from "../../types/restaurants";
import type { ReviewCandidate } from "../discovery/review-types";

/** 最大5件の最終候補だけ取得。写真の失敗・期限切れは検索結果を失敗させない。 */
export const PHOTO_DEADLINE_MS = 3000;

export async function attachRestaurantPhotos(restaurants: Restaurant[], candidates: ReviewCandidate[], signal: AbortSignal) {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key || signal.aborted) return;
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(PHOTO_DEADLINE_MS)]);
  await Promise.all(restaurants.map(async (restaurant) => {
    const photo = candidates.find((candidate) => candidate.id === restaurant.id)?.photoResource;
    if (!photo) return;
    try {
      const url = new URL(`https://places.googleapis.com/v1/${photo.name}/media`);
      url.searchParams.set("maxWidthPx", "1000");
      url.searchParams.set("skipHttpRedirect", "true");
      const response = await fetch(url, {
        headers: { "X-Goog-Api-Key": key }, signal: deadline, cache: "no-store", redirect: "error",
      });
      if (!response.ok) return;
      const payload: unknown = await response.json();
      if (deadline.aborted || !payload || typeof payload !== "object" || !("photoUri" in payload)
        || typeof payload.photoUri !== "string") return;
      const image = new URL(payload.photoUri);
      if (image.protocol !== "https:" || image.username || image.password
        || !(image.hostname === "googleusercontent.com" || image.hostname.endsWith(".googleusercontent.com"))) return;
      restaurant.photoUrl = image.href;
      restaurant.photoAttributions = photo.attributions;
    } catch {
      // 写真がない場合と同じ代替表示へ。APIキーや外部レスポンスはログに残さない。
    }
  }));
}
