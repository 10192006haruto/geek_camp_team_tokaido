import type { Location, PriceLevel, SearchRequest } from "@/types/restaurants";

/**
 * 取得側の内部データ（画面には直接出さない）。
 * 判定に必要な項目は後藤さんと合意後に追加する。
 */
export type CandidateRestaurant = {
  id: string;
  name: string;
  location: Location | null;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: PriceLevel | null;
  isOpenNow: boolean | null;
  cuisineLabel: string | null;
  /** モック専用の明示的な予算（円）。不明は null */
  budgetYen: number | null;
};

// すべて架空の店舗・値です（東京駅周辺の座標を使用）
const MOCK_CANDIDATES: CandidateRestaurant[] = [
  {
    id: "mock-place-001",
    name: "【架空】ここメシ食堂",
    location: { latitude: 35.683, longitude: 139.769 },
    address: "架空の住所（開発用データ）",
    rating: 4.3,
    reviewCount: 24,
    priceLevel: null,
    isOpenNow: null,
    cuisineLabel: "和食",
    budgetYen: 1200,
  },
  {
    id: "mock-place-002",
    name: "【架空】路地裏らーめん",
    location: { latitude: 35.6795, longitude: 139.7655 },
    address: "架空の住所（開発用データ）",
    rating: 3.9,
    reviewCount: 0,
    priceLevel: "inexpensive",
    isOpenNow: true,
    cuisineLabel: "ラーメン",
    budgetYen: 900,
  },
  {
    id: "mock-place-003",
    name: "【架空】郷土料理 とうかいどう",
    location: { latitude: 35.6895, longitude: 139.7725 },
    address: null,
    rating: null,
    reviewCount: null,
    priceLevel: "moderate",
    isOpenNow: false,
    cuisineLabel: "郷土料理",
    budgetYen: null,
  },
  {
    id: "mock-place-004",
    name: "【架空】遠くの定食屋",
    location: { latitude: 35.7, longitude: 139.78 },
    address: "架空の住所（開発用データ）",
    rating: 4.0,
    reviewCount: 120,
    priceLevel: "inexpensive",
    isOpenNow: true,
    cuisineLabel: "和食",
    budgetYen: 800,
  },
  {
    id: "mock-place-005",
    name: "【架空】座標不明の喫茶",
    location: null,
    address: null,
    rating: null,
    reviewCount: null,
    priceLevel: null,
    isOpenNow: null,
    cuisineLabel: null,
    budgetYen: null,
  },
];

/** モック版の候補取得。実API版も同じシグネチャで差し替える。 */
export async function fetchMockCandidates(
  _req: SearchRequest,
  signal: AbortSignal,
): Promise<CandidateRestaurant[]> {
  signal.throwIfAborted();
  return MOCK_CANDIDATES.map((c) => ({ ...c }));
}
