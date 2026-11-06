/** 候補データの値を検証し、欠損・不正値を後続処理で扱える形にそろえる。 */
import "server-only";
import type { Attribution, Location, PriceLevel } from "../../types/restaurants";
import type { CandidateRestaurant, DishEvidence, MenuItem } from "./types";

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").trim() || null;
}

function number(value: unknown, max = Number.MAX_VALUE): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max
    ? value : null;
}

function url(value: unknown, maps = false): string | null {
  const input = text(value);
  if (!input) return null;
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    if (maps && !((parsed.hostname === "www.google.com" || parsed.hostname === "maps.google.com") &&
      (parsed.pathname === "/maps" || parsed.pathname.startsWith("/maps/")))) return null;
    return parsed.href;
  } catch { return null; }
}

function location(value: unknown): Location | null {
  const { latitude, longitude } = record(value);
  return typeof latitude === "number" && Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    typeof longitude === "number" && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    ? { latitude, longitude } : null;
}

function attributions(value: unknown): Attribution[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    const label = text(row.text);
    return label ? [{ text: label, url: url(row.url) }] : [];
  });
}

function timestamp(value: unknown): string | null {
  const input = text(value);
  return input && /^\d{4}-\d{2}-\d{2}T/.test(input) && Number.isFinite(Date.parse(input))
    ? input : null;
}

function dishes(value: unknown): DishEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    const dish = text(row.dish), region = text(row.region);
    const servingSource = text(row.servingSource), regionalSource = text(row.regionalSource);
    const observedAt = timestamp(row.observedAt);
    // 出典と確認日時がそろった根拠だけを採用する。
    if (!dish || !region || !servingSource || !regionalSource || !observedAt) return [];
    const menuExcerpt = text(row.menuExcerpt);
    return [{ dish, region, servingSource, regionalSource, observedAt, ...(menuExcerpt ? { menuExcerpt } : {}) }];
  });
}

function menuItems(value: unknown): MenuItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): MenuItem[] => {
    const row = record(item);
    const name = text(row.name);
    const source = text(row.source);
    const observedAt = timestamp(row.observedAt);
    const status = row.status === "offered" || row.status === "not_offered" ? row.status : "unknown";
    if (!name) return [];
    // 出典や日時が欠けた料理は提供不明として、推薦の根拠に使わない。
    const menuExcerpt = text(row.menuExcerpt);
    return [{ name, status: source && observedAt ? status : "unknown", source, observedAt, ...(menuExcerpt ? { menuExcerpt } : {}) }];
  });
}

/** 取得担当が共通形式に変換した候補を受け取る。配列以外は呼び出し側のエラーとする。 */
export function cleanseCandidates(input: unknown): CandidateRestaurant[] {
  if (!Array.isArray(input)) throw new TypeError("Candidates must be an array");
  const prices: PriceLevel[] = ["free", "inexpensive", "moderate", "expensive", "very_expensive"];
  const seen = new Set<string>();
  return input.flatMap((item) => {
    const row = record(item);
    const id = text(row.id), name = text(row.name);
    if (!id || !name || seen.has(id)) return [];
    seen.add(id); // 同じIDの情報は混ぜず、最初の有効な候補を使う。
    const reviews = number(row.reviewCount, Number.MAX_SAFE_INTEGER);
    return [{
      id, name, location: location(row.location), address: text(row.address),
      distanceMeters: number(row.distanceMeters), rating: number(row.rating, 5),
      reviewCount: reviews !== null && Number.isInteger(reviews) ? reviews : null,
      photoUrl: url(row.photoUrl),
      priceLevel: prices.includes(row.priceLevel as PriceLevel) ? row.priceLevel as PriceLevel : null,
      isOpenNow: typeof row.isOpenNow === "boolean" ? row.isOpenNow : null,
      cuisineLabel: text(row.cuisineLabel), googleMapsUrl: url(row.googleMapsUrl, true),
      attributions: attributions(row.attributions), photoAttributions: attributions(row.photoAttributions),
      isChain: typeof row.isChain === "boolean" ? row.isChain : null,
      localDishes: dishes(row.localDishes),
      ...(row.menuItems === undefined ? {} : { menuItems: menuItems(row.menuItems) }),
    }];
  });
}
