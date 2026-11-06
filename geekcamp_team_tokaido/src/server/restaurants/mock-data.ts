import type { SearchRequest } from "../../types/restaurants";
import type { CandidateRestaurant } from "../discovery/types";

/** All facts and evidence below are fictional, around Tokyo Station. No external requests. */
export async function fetchMockCandidates(_req: SearchRequest, signal: AbortSignal): Promise<CandidateRestaurant[]> {
  signal.throwIfAborted();
  return Array.from({ length: 9 }, (_, index) => {
    const id = `mock-place-${index + 1}`;
    const dish = index === 7 ? "深大寺そば" : "深川めし";
    return {
      id, name: `【架空】${dish}の店 ${index + 1}`,
      location: { latitude: 35.6812 + (index + 1) * 0.0005, longitude: 139.7671 },
      address: "架空の住所（開発用データ）", distanceMeters: null,
      rating: index === 0 ? null : 4, reviewCount: index === 0 ? 0 : 24,
      photoUrl: null, priceLevel: null, isOpenNow: index === 0 ? false : index === 1 ? null : true,
      cuisineLabel: index === 7 ? "そば" : "和食", googleMapsUrl: null,
      attributions: [], photoAttributions: [], isChain: null,
      // The last candidate has no serving evidence and must never be recommended.
      localDishes: index === 8 ? [] : [{ dish, region: "東京", servingSource: `mock:${id}:menu`,
        regionalSource: `mock:${id}:regional-dish`, observedAt: "2026-11-06T00:00:00Z" }],
    };
  });
}
