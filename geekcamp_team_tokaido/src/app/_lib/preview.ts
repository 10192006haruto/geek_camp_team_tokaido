import type { Location, PreviewScenario, Restaurant, SearchRequest, SearchResponse } from "./restaurant-types";
import { SearchFailure } from "./search";

export const DEMO_LOCATION: Location = { latitude: 35.6812, longitude: 139.7671 };
export const DEFAULT_FILTERS = { radiusMeters: 1000 as const, cuisine: null, budgetMaxYen: null };
const base: Restaurant = {
  id: "mock-001", name: "【架空】路地裏�?�ご�?��? こ�?��?",
  location: { latitude: 35.683, longitude: 139.769 },
  address: "架空の住所?��こむぎ町1丁目?��開発用?�?", distanceMeters: null,
  rating: 4.3, reviewCount: 24, photoUrl: null, priceLevel: "moderate", isOpenNow: true,
  cuisineLabel: "和�?", labels: ["郷土料�?の記載あ�?"],
  recommendationReason: "架空のメニュー�?報に、地域�?�食材を使った�?�土料�?の定食が記載されて�?ます�?",
  googleMapsUrl: null, attributions: [], photoAttributions: [],
};
const fixtures: { restaurant: Restaurant; budgetYen: number }[] = [
  { restaurant: base, budgetYen: 1200 },
  { restaurant: { ...base, id: "mock-002", name: "【架空】手打ちそ�?� 風�?ち", location: { latitude: 35.686, longitude: 139.765 }, cuisineLabel: "そ�?�・�?ど�?", rating: 4.1, reviewCount: 38, isOpenNow: false, priceLevel: "inexpensive", labels: ["手打ちそ�?�"], recommendationReason: "架空の店�?�紹介に、店�??で手打ちするそ�?�を提供すると記載されて�?ます�?", address: "架空の住所?��風�?ち町2丁目?��開発用?�?" }, budgetYen: 900 },
  { restaurant: { ...base, id: "mock-003", name: "【架空】喫茶 日�?", location: { latitude: 35.677, longitude: 139.771 }, cuisineLabel: "カフェ", rating: null, reviewCount: 0, isOpenNow: null, priceLevel: null, labels: [], recommendationReason: "架空のメニュー�?報に、�?�家製プリンとコーヒ�?�が記載されて�?ます�?", address: null }, budgetYen: 700 },
];

export function distanceMeters(a: Location, b: Location): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h))));
}

export function previewResults(request: SearchRequest, scenario: PreviewScenario): SearchResponse {
  if (scenario === "error") throw new SearchFailure("検索エラーの�?モです。条件を残したまま再試行できます。確認用の状態を「通常」に戻してください�?");
  if (scenario === "empty") return { restaurants: [], returnedCount: 0 };
  const restaurants = fixtures.filter(({ restaurant, budgetYen }) =>
    (!request.cuisine || request.cuisine === restaurant.cuisineLabel)
    && (request.budgetMaxYen === null || budgetYen <= request.budgetMaxYen))
    .map(({ restaurant }) => ({ ...restaurant, distanceMeters: distanceMeters(request.location, restaurant.location!) }))
    .filter((place) => place.distanceMeters <= request.radiusMeters)
    .map((place) => scenario === "missing" ? { ...place, rating: null, reviewCount: null, priceLevel: null, address: null, isOpenNow: null, cuisineLabel: null, distanceMeters: null, recommendationReason: null, labels: [] } : place);
  return { restaurants, returnedCount: restaurants.length };
}

// UI preview only, not an HTTP mock or a claim that the backend is implemented.
export async function searchPreview(request: SearchRequest, scenario: PreviewScenario, signal: AbortSignal): Promise<SearchResponse> {
  await new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, scenario === "slow" ? 4000 : 650);
    signal.addEventListener("abort", abort, { once: true });
  });
  signal.throwIfAborted();
  return previewResults(request, scenario);
}
