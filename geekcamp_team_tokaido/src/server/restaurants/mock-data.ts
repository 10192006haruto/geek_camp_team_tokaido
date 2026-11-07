import type { SearchRequest } from "../../types/restaurants";
import type { MenuInference, PlaceReview, ReviewCandidate } from "../discovery/review-types";

/*
 * 開発用モック（RESTAURANT_DATA_SOURCE=mock）。店舗・レビュー・投稿者はすべて架空で、東京駅周辺に配置。
 * Places・Gemini には通信しない。料理の抽出結果もここで固定し、本番と同じ引用照合を通す。
 */

const ORIGIN = { latitude: 35.6812, longitude: 139.7671 };

type MockReview = Partial<PlaceReview> & { text: string };
type MockShop = {
  name: string;
  /** 検索の基準点から北へのおおよその距離（m） */
  northMeters: number;
  cuisineLabel: string | null;
  isOpenNow: boolean | null;
  rating: number | null;
  reviewCount: number | null;
  /** 本文のないレビューを null で表す（番号は振り直さない確認用） */
  reviews: (MockReview | null)[];
  /** 固定の抽出結果。quote は本文と完全一致させる */
  dishes: { name: string; reviewIndex: number; quote: string }[];
};

const SHOPS: MockShop[] = [
  { name: "【架空】天ぷらそば 東京駅前", northMeters: 60, cuisineLabel: "そば店", isOpenNow: false, rating: 4.1, reviewCount: 18,
    reviews: [{ text: "昼に天ぷらそばを食べました。つゆが濃いめでおいしかったです。" }],
    dishes: [{ name: "天ぷらそば", reviewIndex: 0, quote: "昼に天ぷらそばを食べました。" }] },
  { name: "【架空】深川めし処", northMeters: 120, cuisineLabel: "和食店", isOpenNow: null, rating: 4.0, reviewCount: 9,
    reviews: [{ text: "深川めしを注文しました。あさりがたっぷりでした。" }, { text: "店員さんが親切でした。" }],
    dishes: [{ name: "深川めし", reviewIndex: 0, quote: "深川めしを注文しました。" }] },
  { name: "【架空】もんじゃ焼き 路地裏", northMeters: 180, cuisineLabel: null, isOpenNow: true, rating: null, reviewCount: 0,
    reviews: [{ text: "明太もちもんじゃを焼いてもらいました。" }],
    dishes: [{ name: "明太もちもんじゃ", reviewIndex: 0, quote: "明太もちもんじゃを焼いてもらいました。" }] },
  { name: "【架空】喫茶 ここメシ", northMeters: 240, cuisineLabel: "喫茶店", isOpenNow: true, rating: 3.8, reviewCount: 30,
    reviews: [{ text: "静かで作業しやすい雰囲気でした。" }],
    dishes: [] },
  { name: "【架空】定食 とうかいどう", northMeters: 300, cuisineLabel: "定食屋", isOpenNow: true, rating: 3.9, reviewCount: 41,
    reviews: [{ text: "混んでいました。" }, null, { text: "生姜焼き定食を食べました。ご飯のおかわりが無料です。" }],
    dishes: [{ name: "生姜焼き定食", reviewIndex: 2, quote: "生姜焼き定食を食べました。" }] },
  { name: "【架空】カレー スパイス東京", northMeters: 360, cuisineLabel: "カレー店", isOpenNow: true, rating: 4.4, reviewCount: 120,
    reviews: [{ text: "バターチキンカレーを食べました。辛さを選べます。", languageCode: "ja", translated: true,
      originalText: "I had the butter chicken curry. You can choose the spice level." }],
    dishes: [{ name: "バターチキンカレー", reviewIndex: 0, quote: "バターチキンカレーを食べました。" }] },
  { name: "【架空】寿司 八重洲", northMeters: 420, cuisineLabel: "寿司店", isOpenNow: true, rating: 4.2, reviewCount: 55,
    reviews: [{ text: "穴子寿司は売り切れでした。代わりにまぐろ丼を食べました。" }],
    dishes: [{ name: "まぐろ丼", reviewIndex: 0, quote: "代わりにまぐろ丼を食べました。" }] },
  { name: "【架空】手打ちそば 丸の内", northMeters: 700, cuisineLabel: "そば店", isOpenNow: true, rating: 4.3, reviewCount: 22,
    reviews: [{ text: "ざるそばを注文しました。のど越しがよかったです。" }],
    dishes: [{ name: "ざるそば", reviewIndex: 0, quote: "ざるそばを注文しました。" }] },
  { name: "【架空】遠くのラーメン", northMeters: 2000, cuisineLabel: "ラーメン店", isOpenNow: true, rating: 4.0, reviewCount: 80,
    reviews: [{ text: "醤油ラーメンを食べました。" }],
    dishes: [{ name: "醤油ラーメン", reviewIndex: 0, quote: "醤油ラーメンを食べました。" }] },
];

const METERS_PER_DEGREE_LAT = 111_320;

function toCandidate(shop: MockShop, i: number): ReviewCandidate {
  const id = `mock-place-${i + 1}`;
  const reviews = shop.reviews.flatMap((review, index): PlaceReview[] => review ? [{
    index,
    languageCode: "ja",
    rating: null,
    publishTime: "2026-11-01T03:00:00Z",
    author: { displayName: `架空投稿者${i + 1}-${index + 1}`, uri: null },
    googleMapsUri: null,
    ...review,
  }] : []);
  return {
    id,
    name: shop.name,
    location: { latitude: ORIGIN.latitude + shop.northMeters / METERS_PER_DEGREE_LAT, longitude: ORIGIN.longitude },
    address: "架空の住所（開発用データ）",
    distanceMeters: null,
    rating: shop.rating,
    reviewCount: shop.reviewCount,
    photoUrl: null,
    priceLevel: null,
    isOpenNow: shop.isOpenNow,
    cuisineLabel: shop.cuisineLabel,
    googleMapsUrl: null,
    attributions: [],
    photoAttributions: [],
    reviews,
  };
}

/** モックの候補取得。実APIの fetchNearbyCandidates と同じ形を返す。 */
export async function fetchMockReviewCandidates(_req: SearchRequest, signal: AbortSignal): Promise<ReviewCandidate[]> {
  signal.throwIfAborted();
  return SHOPS.map(toCandidate);
}

/** モックの抽出結果。inferMenus の代わりに固定値を返す（Gemini は呼ばない）。 */
export function mockMenuInference(candidates: ReviewCandidate[]): MenuInference[] {
  return candidates.map((candidate) => {
    const shop = SHOPS[Number(candidate.id.replace("mock-place-", "")) - 1];
    return {
      placeId: candidate.id,
      items: (shop?.dishes ?? []).map((dish) => ({
        name: dish.name,
        evidence: [{ reviewIndex: dish.reviewIndex, quote: dish.quote }],
      })),
    };
  });
}
