/** 外部の公式メニューを読むための、接続先・応答形式・サイズを制限したHTML取得処理。 */
import "server-only";
import { lookup } from "node:dns";
import { get } from "node:https";
import { isIP } from "node:net";

export function publicWebsiteUrl(input: string, base?: URL): URL | null {
  try {
    const url = new URL(input, base);
    if (url.protocol !== "https:" || url.port || url.username || url.password ||
      isIP(url.hostname) || !/^[\w.-]+\.[a-z\d-]+$/i.test(url.hostname) ||
      url.hostname.endsWith(".localhost")) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export function isPublicIPv4(ip: string): boolean {
  if (isIP(ip) !== 4) return false;
  const [a, b, c] = ip.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

/** 名前解決と接続で同じ検証済みIPを使い、内部アドレスへの接続を防ぐ。 */
export function readPublicMenuPage(url: URL, signal: AbortSignal): Promise<string | null> {
  if (!publicWebsiteUrl(url.href)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = get(url, {
      signal,
      agent: false,
      family: 4,
      headers: { Accept: "text/html" },
      lookup(host, _options, callback) {
        lookup(host, { family: 4, all: true }, (error, records) => {
          if (error || !records.length || records.some(({ address }) => !isPublicIPv4(address))) {
            callback(error ?? new Error("No public IPv4 address"), "", 4);
            return;
          }
          callback(null, records[0].address, 4);
        });
      },
    }, (response) => {
      response.on("error", () => resolve(null));
      if (response.statusCode !== 200 ||
        !/^text\/html(?:\s*;|$)/i.test(response.headers["content-type"] ?? "") ||
        (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity")) {
        resolve(null);
        response.destroy();
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size <= 512 * 1024) chunks.push(chunk);
        else {
          resolve(null);
          response.destroy();
        }
      });
      response.on("end", () => {
        try {
          resolve(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
        } catch {
          resolve(null);
        }
      });
    });
    request.on("error", () => resolve(null));
  });
}
