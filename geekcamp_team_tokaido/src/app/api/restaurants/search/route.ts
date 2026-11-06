import type { SearchError, SearchErrorCode, SearchResponse } from "@/types/restaurants";
import { parseSearchRequest } from "@/server/restaurants/validate";   // 3. 入力検証
import { searchRestaurants } from "@/server/restaurants/search";      // 4. 検索処理

function errorResponse(status: number, code: SearchErrorCode, message: string, headers?: HeadersInit) {
  const body: SearchError = { error: { code, message } };
  return Response.json(body, { status, headers });
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
    return Response.json(result);
  } catch {
    // 例：独自のエラークラスで 502 / 503 / 504 を振り分け、それ以外は 500
    return errorResponse(500, "INTERNAL_ERROR", "検索中にエラーが発生しました。");
  }
}

// 7. POST 以外も契約どおり JSON で 405
const methodNotAllowed = () =>
  errorResponse(405, "METHOD_NOT_ALLOWED", "POST で送信してください。", { Allow: "POST" });
export { methodNotAllowed as GET, methodNotAllowed as PUT, methodNotAllowed as PATCH, methodNotAllowed as DELETE, methodNotAllowed as HEAD, methodNotAllowed as OPTIONS };
