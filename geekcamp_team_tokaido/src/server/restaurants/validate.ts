import { MOOD_LIMIT, type SearchRequest } from "../../types/restaurants";

export type ParseResult =
  | { ok: true; value: SearchRequest }
  | { ok: false; message: string };

const RADIUS_VALUES = [500, 1000, 3000] as const;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const fail = (message: string): ParseResult => ({ ok: false, message });

export function parseSearchRequest(body: unknown): ParseResult {
  if (!isObject(body)) return fail("リクエストはオブジェクトで送信してください。");

  // 「省略」と「null」を区別：キー自体が無いのは不正
  for (const key of ["location", "radiusMeters", "mood", "openNow"]) {
    if (!(key in body)) return fail(`${key} は必須です。`);
  }

  if (Object.keys(body).some((key) => !["location", "radiusMeters", "mood", "openNow"].includes(key)))
    return fail("未対応の検索条件です。");
  const { location, radiusMeters, mood, openNow } = body;

  if (!isObject(location)) return fail("location が不正です。");
  const { latitude, longitude } = location;
  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90)
    return fail("latitude が不正です。");
  if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180)
    return fail("longitude が不正です。");

  if (!RADIUS_VALUES.includes(radiusMeters as never))   // "1000"（文字列）はここで弾かれる
    return fail("radiusMeters は 500 / 1000 / 3000 のいずれかです。");

  if (typeof mood !== "string" || mood.length > MOOD_LIMIT)
    return fail(`mood は${MOOD_LIMIT}文字以内の文字列です。`);
  if (typeof openNow !== "boolean") return fail("openNow は真偽値です。");

  return {
    ok: true,
    // 余計なキーを持ち込まないよう、組み立て直して返す
    value: {
      location: { latitude, longitude },
      radiusMeters: radiusMeters as SearchRequest["radiusMeters"],
      mood: mood.trim(),
      openNow,
    },
  };
}
