/** 公式メニューの読み取りを補助する、Geminiへのサーバー側JSONリクエスト。 */
import "server-only";

export async function requestGeminiJson(
  modelId: string,
  instruction: string,
  input: unknown,
  schema: object,
  signal?: AbortSignal,
): Promise<unknown> {
  signal?.throwIfAborted();
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = modelId.trim();
  if (!apiKey || !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(model)) return null;
  const timeout = AbortSignal.timeout(4000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      cache: "no-store",
      redirect: "error",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [{ parts: [{ text: JSON.stringify(input) }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema },
      }),
    });
    signal?.throwIfAborted();
    if (!response.ok) return null;
    const payload = await response.json();
    signal?.throwIfAborted();
    const result = payload?.candidates?.[0];
    // 途中で打ち切られた返答は使わず、各呼び出し側の失敗時処理に委ねる。
    if (result?.finishReason !== "STOP" || !Array.isArray(result.content?.parts)) return null;
    const text = result.content.parts
      .filter((part: { thought?: boolean; text?: unknown }) => !part.thought && typeof part.text === "string")
      .map((part: { text: string }) => part.text)
      .join("");
    return JSON.parse(text);
  } catch {
    signal?.throwIfAborted();
    return null;
  }
}
