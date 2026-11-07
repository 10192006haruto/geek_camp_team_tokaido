import "server-only";
import type { Location, PriceLevel, SearchRequest } from "../../types/restaurants";
import type { PlaceReview, ReviewCandidate } from "../discovery/review-types";
import { PlacesSearchError } from "./errors";

export const NEARBY_SEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby";
export const MAX_NEARBY_RESULTS = 20;
const MAX_REVIEWS = 5;

/**
 * 取得するフィールド。places.reviews を含むため Nearby Search Enterprise + Atmosphere の料金区分になる。
 * photos は参照情報のみ。画像URLの取得は最終候補に限定する。
 */
export const NEARBY_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.formattedAddress",
  "places.primaryTypeDisplayName",
  "places.googleMapsUri",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.currentOpeningHours.openNow",
  "places.regularOpeningHours.weekdayDescriptions",
  "places.reviews",
  "places.photos",
].join(",");

/** Nearby Search のリクエスト本文。includedTypes の範囲はチームで確認中。 */
export function buildNearbyRequest(req: SearchRequest) {
  return {
    includedTypes: ["restaurant"],
    maxResultCount: MAX_NEARBY_RESULTS,
    rankPreference: "DISTANCE",
    languageCode: "ja",
    regionCode: "JP",
    locationRestriction: {
      circle: {
        center: { latitude: req.location.latitude, longitude: req.location.longitude },
        radius: req.radiusMeters,
      },
    },
  };
}

/**
 * Places 周辺検索で候補とレビューを取得し、推測処理に渡せる形に整える。
 * 期限・中断は呼び出し元の signal に従う（検索全体の10秒期限は呼び出し元で作る）。
 */
export async function fetchNearbyCandidates(req: SearchRequest, signal: AbortSignal): Promise<ReviewCandidate[]> {
  signal.throwIfAborted();
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) throw new PlacesSearchError("SERVICE_UNAVAILABLE");
  try {
    const response = await fetch(NEARBY_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": NEARBY_FIELD_MASK,
      },
      body: JSON.stringify(buildNearbyRequest(req)),
      cache: "no-store",
      redirect: "error",
      signal,
    });
    // 401/403（キー・権限・API未有効）と429（利用上限）は設定や枠の問題として扱う。
    if (!response.ok) {
      throw new PlacesSearchError([401, 403, 429].includes(response.status) ? "SERVICE_UNAVAILABLE" : "SEARCH_FAILED");
    }
    const payload: unknown = await response.json();
    signal.throwIfAborted();
    return normalizeNearbyResponse(payload);
  } catch (error) {
    if (signal.aborted) {
      if (signal.reason?.name === "TimeoutError") throw new PlacesSearchError("UPSTREAM_TIMEOUT");
      signal.throwIfAborted();
    }
    if (error instanceof PlacesSearchError) throw error;
    throw new PlacesSearchError("SEARCH_FAILED");
  }
}

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const finiteIn = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
const localizedText = (v: unknown): string | null => (object(v) ? nonEmpty(v.text) : null);
const languageOf = (v: unknown): string | null => (object(v) ? nonEmpty(v.languageCode) : null);

/** https のURLだけを通す。googleOnly では Google のドメインに限る。 */
function safeUrl(v: unknown, googleOnly: boolean): string | null {
  const raw = nonEmpty(v);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (googleOnly && !/(^|\.)google\.com$/.test(url.hostname) && !/(^|\.)goo\.gl$/.test(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

const PRICE_LEVELS: Record<string, PriceLevel> = {
  PRICE_LEVEL_FREE: "free",
  PRICE_LEVEL_INEXPENSIVE: "inexpensive",
  PRICE_LEVEL_MODERATE: "moderate",
  PRICE_LEVEL_EXPENSIVE: "expensive",
  PRICE_LEVEL_VERY_EXPENSIVE: "very_expensive",
};

function toLocation(v: unknown): Location | null {
  if (!object(v)) return null;
  const latitude = finiteIn(v.latitude, -90, 90);
  const longitude = finiteIn(v.longitude, -180, 180);
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

function toPublishTime(v: unknown): string | null {
  const raw = nonEmpty(v);
  return raw && !Number.isNaN(Date.parse(raw)) ? raw : null;
}

/**
 * レビューは取得順に 0〜4 の番号を振る。本文や投稿者名のないレビューは除くが、番号は振り直さない
 * （推測結果の reviewIndex を元のレビューに戻すため）。
 */
function toReviews(v: unknown): PlaceReview[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, MAX_REVIEWS).flatMap((review, index): PlaceReview[] => {
    if (!object(review)) return [];
    const text = localizedText(review.text);
    const author = object(review.authorAttribution) ? review.authorAttribution : null;
    const displayName = author ? nonEmpty(author.displayName) : null;
    if (!text || !displayName) return [];
    const languageCode = languageOf(review.text);
    const originalLanguage = languageOf(review.originalText);
    const translated = languageCode !== null && originalLanguage !== null && languageCode !== originalLanguage;
    return [{
      index,
      text,
      languageCode,
      rating: finiteIn(review.rating, 1, 5),
      publishTime: toPublishTime(review.publishTime),
      author: { displayName, uri: safeUrl(author?.uri, false) },
      googleMapsUri: safeUrl(review.googleMapsUri, true),
      authorPhotoUrl: safeUrl(author?.photoUri, false),
      originalText: translated ? localizedText(review.originalText) : null,
      translated,
    }];
  });
}

/**
 * Nearby Search のレスポンスを ReviewCandidate[] に変換する。
 * 不明な値は null のままにし、0 や空文字で埋めない。ID・店名のない店舗と重複IDは除く。
 */
export function normalizeNearbyResponse(payload: unknown): ReviewCandidate[] {
  if (!object(payload)) throw new PlacesSearchError("SEARCH_FAILED");
  // 該当なしのとき places キー自体が返らないことがある。
  if (payload.places === undefined) return [];
  if (!Array.isArray(payload.places)) throw new PlacesSearchError("SEARCH_FAILED");
  const seen = new Set<string>();
  return payload.places.slice(0, MAX_NEARBY_RESULTS).flatMap((place): ReviewCandidate[] => {
    if (!object(place)) return [];
    const id = nonEmpty(place.id);
    const name = localizedText(place.displayName);
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    const reviewCount = place.userRatingCount;
    const openNow = object(place.currentOpeningHours) ? place.currentOpeningHours.openNow : undefined;
    return [{
      id,
      name,
      location: toLocation(place.location),
      address: nonEmpty(place.formattedAddress),
      distanceMeters: null,
      rating: finiteIn(place.rating, 0, 5),
      reviewCount: Number.isSafeInteger(reviewCount) && (reviewCount as number) >= 0 ? (reviewCount as number) : null,
      photoUrl: null,
      photoResource: normalizePhotoResource(place.photos, id),
      priceLevel: typeof place.priceLevel === "string" ? PRICE_LEVELS[place.priceLevel] ?? null : null,
      isOpenNow: typeof openNow === "boolean" ? openNow : null,
      openingHours: normalizeOpeningHours(place.regularOpeningHours),
      cuisineLabel: localizedText(place.primaryTypeDisplayName),
      googleMapsUrl: safeUrl(place.googleMapsUri, true),
      attributions: [],
      photoAttributions: [],
      reviews: toReviews(place.reviews),
    }];
  });
}

/** 写真参照は検索ごとに取得し、永続保存しない。 */
function normalizePhotoResource(value: unknown, id: string): ReviewCandidate["photoResource"] {
  if (!Array.isArray(value)) return null;
  for (const photo of value) {
    if (!object(photo) || typeof photo.name !== "string"
      || !/^places\/[^/]+\/photos\/[A-Za-z0-9_-]+$/.test(photo.name)
      || photo.name.split("/")[1] !== id) continue;
    const authors = Array.isArray(photo.authorAttributions) ? photo.authorAttributions : [];
    // 投稿者情報が壊れている写真は、帰属を省略して表示しない。
    if (authors.some((author) => !object(author) || !nonEmpty(author.displayName))) continue;
    const attributions = authors.map((author) => ({ text: author.displayName as string, url: safeUrl(author.uri, false) }));
    const source = safeUrl(photo.googleMapsUri, true);
    if (source) attributions.push({ text: "Google Mapsで写真を見る", url: source });
    return { name: photo.name, attributions };
  }
  return null;
}

/** 曜日の並び・24時間営業・中休みなどは取得元の表記をそのまま保持する。 */
function normalizeOpeningHours(value: unknown): string[] | null {
  const days = object(value) ? value.weekdayDescriptions : null;
  return Array.isArray(days) && days.length > 0 && days.length <= 7
    && days.every((day) => typeof day === "string" && day.trim().length > 0)
    ? days.map((day: string) => day.trim()) : null;
}
