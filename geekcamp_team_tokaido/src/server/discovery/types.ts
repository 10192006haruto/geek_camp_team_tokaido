/** 店舗取得側と判定側の間で使う内部型。公開レスポンスの型は src/types に置く。 */
import type { Location, Restaurant } from "../../types/restaurants";

/** 店舗での掲載と、料理の地域性を示す二つの出典を保持する。 */
export type DishEvidence = {
  dish: string;
  region: string;
  servingSource: string;
  regionalSource: string;
  observedAt: string;
  menuExcerpt?: string;
};

/** 選ばれた店舗と料理根拠。根拠IDはその検索内だけで使う。 */
export type DiscoveryRecommendation = {
  restaurant: Restaurant;
  evidenceId: string;
  evidence: DishEvidence;
};

export type MenuItem = {
  name: string;
  status: "offered" | "not_offered" | "unknown";
  source: string | null;
  observedAt: string | null;
  menuExcerpt?: string;
};

export type RegionalDish = {
  dish: string;
  region: string;
  source: string;
};

/** 判定前の店舗情報。確認済みメニューがある場合は、その内容を優先する。 */
export type CandidateRestaurant = Omit<Restaurant, "labels" | "recommendationReason"> & {
  localDishes: DishEvidence[];
  menuItems?: MenuItem[];
  isChain: boolean | null;
};

export type DiscoveryConfig = {
  /** 既存の検索リクエストの現在地。公開APIに新しい項目は追加しない。 */
  searchLocation?: Location;
  /** 定型ルールで読めない公式メニューの読み取り補助にだけ使う。 */
  gemini?: { model: string };
  /** 店舗IDにGoogleのPlace IDが入っている取得経路だけで指定する。 */
  officialMenuSource?: "google-places";
  regionalDishes?: readonly RegionalDish[];
  minRating?: number;
  maxReviewCount?: number;
  excludeChains?: boolean;
};

export type DiscoveryDecision = {
  id: string;
  selected: boolean;
  labels: string[];
  recommendationReason: string | null;
  evidence: DishEvidence[];
  exclusion: "insufficient_evidence" | "rating" | "review_count" | "chain" | null;
};
