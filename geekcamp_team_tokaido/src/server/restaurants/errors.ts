import type { SearchErrorCode } from "../../types/restaurants";

/** 外部サービス（Places・Gemini）由来の失敗を表すコード。HTTPステータスへの変換は route.ts で行う。 */
export type UpstreamErrorCode = Extract<SearchErrorCode, "SEARCH_FAILED" | "SERVICE_UNAVAILABLE" | "UPSTREAM_TIMEOUT">;

/** Places API の失敗。利用者向けの文言だけを持ち、生のレスポンスやキーは含めない。 */
export class PlacesSearchError extends Error {
  constructor(public readonly code: UpstreamErrorCode) {
    super(code === "UPSTREAM_TIMEOUT" ? "店舗の検索に時間がかかっています。再試行してください。"
      : code === "SERVICE_UNAVAILABLE" ? "店舗の検索を現在利用できません。"
        : "店舗を取得できませんでした。時間をおいて再度お試しください。");
    this.name = "PlacesSearchError";
  }
}
