// 農林水産省「うちの郷土料理」の一覧から、料理名・地域・出典URLだけを生成する。
// 実行: node scripts/import-regional-dishes.mjs
import { writeFile } from "node:fs/promises";

const root = new URL("https://www.maff.go.jp/j/keikaku/syokubunka/k_ryouri/search_menu/");
const index = new URL("area/index.html", root);
const output = new URL("../src/server/discovery/regional-dishes.generated.json", import.meta.url);
const prefectureCount = 47;
const minimumDishCount = 1365;

function text(html) {
  return html.replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, name) => ({
      amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    })[name.toLowerCase()])
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
      const point = /^x/i.test(code) ? Number.parseInt(code.slice(1), 16) : Number(code);
      return point <= 0x10ffff ? String.fromCodePoint(point) : "";
    })
    .replace(/\s+/g, " ").trim();
}

function links(html, page, directory) {
  const path = new URL(directory + "/", root).pathname;
  const content = html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  return [...content.matchAll(/<a\b[^>]*\shref\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a\s*>/gi)]
    .flatMap(([, double, single, body]) => {
      const url = new URL(double ?? single, page);
      if (url.origin !== root.origin || !url.pathname.startsWith(path) ||
        !/^[\w-]+\.html$/i.test(url.pathname.slice(path.length)) || url.search || url.hash) return [];
      return [{ url, body }];
    });
}

async function readPage(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: "error" });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("text/html")) {
    throw new Error(`一覧を取得できません: ${url.href} (HTTP ${response.status})`);
  }
  return response.text();
}

// PC・スマートフォン用に重複掲載されるリンクをURLでまとめる。
const areas = new Map();
for (const { url, body } of links(await readPage(index), index, "area")) {
  const label = text(body);
  if (!/^(?:北海道|東京都|大阪府|京都府|\p{Script=Han}{2,3}県)$/u.test(label)) continue;
  const region = label === "北海道" ? label : label.slice(0, -1);
  areas.set(url.href, region);
}
if (areas.size !== prefectureCount || new Set(areas.values()).size !== prefectureCount) {
  throw new Error(`都道府県の一覧がそろっていません: ${areas.size}件`);
}

const dishes = new Map();
// 地域一覧のカードにある見出しを使う。解説・画像・レシピは取り込まない。
for (const [area, region] of areas) {
  let count = 0;
  for (const { url, body } of links(await readPage(area), area, "menu")) {
    const heading = /<p\s+class=["']tit["'][^>]*>([\s\S]*?)<\/p>/i.exec(body);
    const dish = heading && text(heading[1]);
    if (!dish) continue;
    const key = `${region}\t${url.href}`;
    const existing = dishes.get(key);
    if (existing && existing.dish !== dish) throw new Error(`同じ出典に異なる料理名: ${url.href}`);
    dishes.set(key, { dish, region, source: url.href });
    count++;
  }
  if (!count) throw new Error(`郷土料理が見つかりません: ${area}`);
}
if (dishes.size < minimumDishCount) {
  throw new Error(`取得件数が農林水産省の掲載数を下回りました: ${dishes.size}件`);
}

// 全ページを検証してから書き出す。1行1品目にして更新差分を確認しやすくする。
const rows = [...dishes.values()].sort((a, b) => a.source.localeCompare(b.source, "en") ||
  a.region.localeCompare(b.region, "ja"));
await writeFile(output, `[\n${rows.map((row) => "  " + JSON.stringify(row)).join(",\n")}\n]\n`);
console.log(`農林水産省「うちの郷土料理」: ${areas.size}都道府県、${rows.length}品目`);
