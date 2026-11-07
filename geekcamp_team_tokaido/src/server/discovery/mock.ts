import type { CandidateRestaurant } from "./types";

/** 判定テスト用の架空店舗。店名・ID・メニューの出典は実店舗を表さない。 */
export function mockCandidates(): CandidateRestaurant[] {
  return [
    { id: "mock-osaka", name: "【架空】大阪食堂", dish: "かすうどん", region: "大阪" },
    { id: "mock-yamanashi", name: "【架空】山梨食堂", dish: "ほうとう", region: "山梨" },
  ].map(({ id, name, dish, region }) => ({
    id, name, location: null, address: null, distanceMeters: null, rating: null,
    openingHours: null,
    reviewCount: 0, photoUrl: null, priceLevel: null, isOpenNow: null,
    cuisineLabel: null, googleMapsUrl: null, attributions: [], photoAttributions: [],
    isChain: null,
    localDishes: [{ dish, region, servingSource: `mock:${id}:menu`,
      regionalSource: `mock:${id}:regional-dish`, observedAt: "2026-11-06T00:00:00Z" }],
  }));
}
