import type { SearchError, SearchErrorCode, SearchResponse } from "@/types/restaurants";
import { parseSearchRequest } from "@/server/restaurants/validate";   // 3. 入力検証
import { searchRestaurants } from "@/server/restaurants/search";      // 4. 検索処理
import { PlacesSearchError, type UpstreamErrorCode } from "@/server/restaurants/errors";
import { MenuInferenceError } from "@/server/discovery/infer-menus";

// 位置情報に基づく結果なので、ブラウザや中継サーバーにキャッシュさせない。
const NO_STORE = { "Cache-Control": "no-store" };

const UPSTREAM_STATUS: Record<UpstreamErrorCode, number> = {
  SEARCH_FAILED: 502,
  SERVICE_UNAVAILABLE: 503,
  UPSTREAM_TIMEOUT: 504,
};

function errorResponse(status: number, code: SearchErrorCode, message: string, headers?: HeadersInit) {
  const body: SearchError = { error: { code, message } };
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export async function POST(request: Request) {
  // 1. Content-Type
  const contentType = request.headers.get("content-type") ?? "";
  if (!(contentType.split(";")[0].trim().toLowerCase() === "application/json")) {
    return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "application/json で送信してください。");
  }

  // 2. JSON
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "リクエストの形式が正しくありません。");
  }

  // 3. 入力検証
  const parsed = parseSearchRequest(body);
  if (!parsed.ok) {
    return errorResponse(400, "INVALID_REQUEST", parsed.message);
  }

  // 4〜6. 検索とエラー変換
  try {
    const result: SearchResponse = await searchRestaurants(parsed.value, request.signal);
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    // Places・Gemini の失敗は 502 / 503 / 504。利用者向けの文言だけを返し、生のエラーは出さない。
    if (error instanceof PlacesSearchError || error instanceof MenuInferenceError) {
      return errorResponse(UPSTREAM_STATUS[error.code], error.code, error.message);
    }
    // 利用者の中断（AbortError）を含め、それ以外は 500。中断時の応答はブラウザに届かない。
    return errorResponse(500, "INTERNAL_ERROR", "検索中にエラーが発生しました。");
  }
}

// 7. POST 以外も契約どおり JSON で 405
const methodNotAllowed = () =>
  errorResponse(405, "METHOD_NOT_ALLOWED", "POST で送信してください。", { Allow: "POST" });
export { methodNotAllowed as GET, methodNotAllowed as PUT, methodNotAllowed as PATCH, methodNotAllowed as DELETE, methodNotAllowed as HEAD, methodNotAllowed as OPTIONS };
