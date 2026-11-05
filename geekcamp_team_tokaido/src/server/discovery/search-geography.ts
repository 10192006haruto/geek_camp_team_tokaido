/** 現在地の都道府県と、店舗までの直線距離をサーバー内で判定する。 */
import "server-only";
import boundaries from "./prefecture-boundaries.json" with { type: "json" };
import type { Location } from "../../types/restaurants";

function validLocation(location: Location | null | undefined): location is Location {
  return !!location && Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90 &&
    Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180;
}

function containsPoint(ring: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j];
    const [bx, by] = ring[i];
    // 県境上は両側の候補を拾い、一意に決まらなければ県を推定しない。
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) < 1e-10 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) &&
      y >= Math.min(ay, by) && y <= Math.max(ay, by)) return true;
    if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) inside = !inside;
  }
  return inside;
}

/** 料理リストと同じ表記で県名を返す。県が一意に分からない座標は null。 */
export function prefectureForLocation(location?: Location): string | null {
  if (!validLocation(location)) return null;
  const { longitude: x, latitude: y } = location;
  let region: string | null = null;
  for (const { name, polygons } of boundaries.prefectures) {
    const matches = polygons.some(({ bounds: [west, south, east, north], rings: [outer, ...holes] }) =>
      x >= west && x <= east && y >= south && y <= north &&
      containsPoint(outer, x, y) && !holes.some((ring) => containsPoint(ring, x, y)));
    if (!matches) continue;
    if (region) return null;
    region = normalizePrefecture(name);
  }
  return region;
}

export function normalizePrefecture(region: string): string {
  return region.trim().replace(/[都府県]$/, "");
}

/** 店舗取得側が距離を持たない場合に、双方の座標からメートルで計算する。 */
export function straightLineMeters(from?: Location, to?: Location | null): number | null {
  if (!validLocation(from) || !validLocation(to)) return null;
  const radians = Math.PI / 180;
  const lat1 = from.latitude * radians, lat2 = to.latitude * radians;
  const deltaLon = (to.longitude - from.longitude) * radians;
  const a = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return Math.round(12742000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a)))));
}
