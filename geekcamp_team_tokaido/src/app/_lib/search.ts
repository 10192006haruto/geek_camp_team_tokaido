import type { Attribution, Restaurant, SearchRequest, SearchResponse } from "./restaurant-types";

export class SearchFailure extends Error {}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const nullableText = (value: unknown) => value === null || typeof value === "string";
const nullableNumber = (value: unknown, max = Infinity, integer = false) =>
  value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max && (!integer || Number.isSafeInteger(value)));
const attribution = (value: unknown): value is Attribution =>
  record(value) && typeof value.text === "string" && nullableText(value.url);

export function isRestaurant(value: unknown): value is Restaurant {
  if (!record(value)) return false;
  const location = value.location;
  const validLocation = location === null || (record(location)
    && typeof location.latitude === "number" && Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90
    && typeof location.longitude === "number" && Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180);
  return typeof value.id === "string" && value.id.trim().length > 0
    && typeof value.name === "string" && value.name.trim().length > 0
    && validLocation && nullableText(value.address) && nullableNumber(value.distanceMeters)
    && nullableNumber(value.rating, 5) && nullableNumber(value.reviewCount, Infinity, true)
    && nullableText(value.photoUrl) && nullableText(value.cuisineLabel)
    && nullableText(value.recommendationReason) && nullableText(value.googleMapsUrl)
    && (value.isOpenNow === null || typeof value.isOpenNow === "boolean")
    && (value.priceLevel === null || ["free", "inexpensive", "moderate", "expensive", "very_expensive"].includes(value.priceLevel as string))
    && Array.isArray(value.labels) && value.labels.every((label) => typeof label === "string")
    && Array.isArray(value.attributions) && value.attributions.every(attribution)
    && Array.isArray(value.photoAttributions) && value.photoAttributions.every(attribution);
}

export function parseSearchResponse(value: unknown): SearchResponse {
  if (!record(value) || !Array.isArray(value.restaurants) || value.restaurants.length > 5
    || value.returnedCount !== value.restaurants.length || !value.restaurants.every(isRestaurant)
    || new Set(value.restaurants.map((place) => place.id)).size !== value.restaurants.length) {
    throw new SearchFailure("店舗情報の形式を確認できませんでした。時間をおいてお試しください。");
  }
  return { restaurants: value.restaurants, returnedCount: value.returnedCount as number };
}

export async function searchRestaurants(request: SearchRequest, signal: AbortSignal): Promise<SearchResponse> {
  const response = await fetch("/api/restaurants/search", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request), signal, cache: "no-store",
  });
  if (!response.ok) {
    // Never render raw upstream messages, HTML or credentials.
    throw new SearchFailure(response.status === 404
      ? "検索APIはまだ接続されていません。「デモで試す」から画面を確認できます。"
      : response.status === 400 ? "検索条件を確認して、もう一度お試しください。"
        : "店舗を取得できませんでした。時間をおいて再度お試しください。");
  }
  try { return parseSearchResponse(await response.json()); }
  catch (error) {
    if (signal.aborted) throw error;
    throw new SearchFailure("店舗情報を読み込めませんでした。時間をおいてお試しください。");
  }
}

export function safeExternalUrl(value: string | null, mapsOnly = false): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    if (mapsOnly && !["www.google.com", "maps.google.com", "www.google.co.jp", "maps.google.co.jp", "maps.app.goo.gl"].includes(url.hostname)) return undefined;
    return url.href;
  } catch { return undefined; }
}

export function locationErrorMessage(code: number): string {
  if (code === 1) return "位置情報の利用が許可されていません。ブラウザのサイト設定で位置情報を許可してから、再試行してください。許可の画面が再表示されない場合も、設定から変更できます。";
  if (code === 3) return "現在地の取得に時間がかかっています。通信環境を確認し、見晴らしのよい場所でもう一度お試しください。";
  return "現在地を取得できませんでした。端末の位置情報設定や通信環境を確認して、再試行してください。";
}
