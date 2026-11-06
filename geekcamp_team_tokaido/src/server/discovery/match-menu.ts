/** メニューの掲載と郷土料理資料を照合し、店舗ごとの推薦根拠を作る。 */
import "server-only";
import type { DishEvidence, MenuItem, RegionalDish } from "./types";

function dishKey(name: string): string {
  return name.normalize("NFKC").trim();
}

export function matchMenuDishes(menu: MenuItem[], catalog: readonly RegionalDish[]): DishEvidence[] {
  // 提供終了や提供不明の記録が混在する料理は、提供中と断定しない。
  const blocked = new Set(menu.filter((item) => item.status !== "offered").map((item) => dishKey(item.name)));
  return menu.flatMap((item) => {
    const key = dishKey(item.name);
    if (item.status !== "offered" || blocked.has(key) || !item.source || !item.observedAt) return [];

    const references = catalog.filter((entry) =>
      typeof entry?.dish === "string" && dishKey(entry.dish) === key &&
      typeof entry.region === "string" && entry.region.trim() &&
      typeof entry.source === "string" && entry.source.trim());
    const reference = references[0];
    // 同じ料理名に複数地域の資料がある場合は、地域を一意に決められない。
    if (!reference || references.some((entry) => entry.region.trim() !== reference.region.trim())) return [];
    return [{
      dish: reference.dish.trim(),
      region: reference.region.trim(),
      servingSource: item.source,
      regionalSource: reference.source.trim(),
      observedAt: item.observedAt,
      ...(item.menuExcerpt ? { menuExcerpt: item.menuExcerpt } : {}),
    }];
  });
}
