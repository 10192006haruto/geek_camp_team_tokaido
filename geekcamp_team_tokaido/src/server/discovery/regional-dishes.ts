/** 農林水産省「うちの郷土料理」から生成した全国リスト。 */
import "server-only";
import importedDishes from "./regional-dishes.generated.json" with { type: "json" };
import type { RegionalDish } from "./types";

const maffMenu = "https://www.maff.go.jp/j/keikaku/syokubunka/k_ryouri/search_menu/menu/";

// 一覧の見出しと店舗での料理名が異なる場合は、出典の本文で確認した名前だけを足す。
export const regionalDishCatalog: readonly RegionalDish[] = [
  ...importedDishes,
  { dish: "かぼちゃほうとう", region: "山梨", source: maffMenu + "houtou_yama_nashi.html" },
  { dish: "割子そば", region: "島根", source: maffMenu + "izumosoba_shimane.html" },
];
