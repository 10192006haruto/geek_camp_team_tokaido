import { strict as assert } from "node:assert";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RestaurantCard, RestaurantDetail, RestaurantPhoto, directionsUrl, photosFor } from "./restaurant-card";
import { DEFAULT_FILTERS, DEMO_LOCATION, previewResults } from "../_lib/preview";
const restaurant = previewResults({ ...DEFAULT_FILTERS, location: DEMO_LOCATION }, "success").restaurants[0];

test("no photo uses a placeholder, never the home stock image", () => {
  const markup = renderToStaticMarkup(<RestaurantPhoto restaurant={restaurant} gallery />);
  assert.match(markup, /写真はまだ届いていません/);
  assert.doesNotMatch(markup, /<img|home-meal|photo-count/);
});
test("single photo has no pager; gallery keeps card photo first and displays attribution", () => {
  const primary = { ...restaurant, photoUrl: "https://example.com/primary.jpg", photoAttributions: [{ text: "Photo author", url: "https://example.com/author" }] };
  assert.doesNotMatch(renderToStaticMarkup(<RestaurantPhoto restaurant={primary} gallery />), /photo-count/);
  const multiple = { ...primary, photos: [{ url: "https://example.com/second.jpg", label: "店先", attributions: [] }] };
  assert.deepEqual(photosFor(multiple).map((photo) => photo.url), [primary.photoUrl, multiple.photos[0].url]);
  const markup = renderToStaticMarkup(<RestaurantDetail restaurant={multiple} demo={false} onBack={() => {}} onHome={() => {}} />);
  assert.match(markup, /photo-count/);
  assert.match(markup, /Photo author/);
  assert.match(markup, /店先/);
});
test("card has one full-surface button; attribution links are separate", () => {
  const markup = renderToStaticMarkup(<RestaurantCard restaurant={{ ...restaurant, attributions: [{ text: "Source", url: "https://example.com" }] }} index={0} onSelect={() => {}} />);
  assert.equal((markup.match(/<button/g) ?? []).length, 1);
  assert.match(markup, /class="whole-card"/);
  assert.doesNotMatch(markup, /<button[^>]*>[\s\S]*<a[\s\S]*<\/button>/);
  assert.match(markup, /直線/);
});
test("fictional restaurants cannot expose routes, and unsafe/unknown destinations remain unavailable", () => {
  assert.equal(directionsUrl(restaurant, true), undefined);
  const live = directionsUrl(restaurant, false)!;
  assert.match(live, /^https:\/\/www.google.com\/maps\/dir\//);
  assert.equal(new URL(live).searchParams.get("destination"), `${restaurant.location!.latitude},${restaurant.location!.longitude}`);
  assert.equal(directionsUrl({ ...restaurant, location: null, googleMapsUrl: "javascript:alert(1)" }, false), undefined);
  assert.equal(directionsUrl({ ...restaurant, location: null }, false), undefined);
});
test("null and zero are different in detail output; demo route button is disabled", () => {
  const markup = renderToStaticMarkup(<RestaurantDetail restaurant={{ ...restaurant, rating: null, reviewCount: 0, isOpenNow: null }} demo onBack={() => {}} onHome={() => {}} />);
  assert.match(markup, /評価不明/);
  assert.match(markup, /レビュー 0件/);
  assert.match(markup, /営業状況不明/);
  assert.match(markup, /disabled=""/);
  assert.doesNotMatch(markup, /href="https:\/\/www.google.com\/maps/);
});

test("review dishes render quote and attribution safely without current-offering claims", () => {
  const quote = 'そばを食べました。<script>alert(1)</script>';
  const place = { ...restaurant, inferredMenu: [{ name: "そば", evidence: [{ quote,
    author: { text: "投稿者", url: "https://www.google.com/maps/contrib/123" },
    reviewUrl: "https://www.google.com/maps/reviews/test", publishTime: "2026-11-07T00:00:00Z",
    translated: true, originalText: "I ate soba." }] }] };
  const markup = renderToStaticMarkup(<RestaurantDetail restaurant={place} demo={false} onBack={() => {}} onHome={() => {}} />);
  assert.match(markup, /クチコミで言及された料理/);
  assert.match(markup, /投稿者/); assert.match(markup, /2026-11-07/);
  assert.match(markup, /元のクチコミを見る/); assert.match(markup, /翻訳された/);
  assert.doesNotMatch(markup, /<script>|ご当地料理と判定済み/);
  const bad = { ...place, inferredMenu: [{ name: "そば", evidence: [{ ...place.inferredMenu[0].evidence[0],
    author: { text: "投稿者", url: "javascript:alert(1)" }, reviewUrl: "https://evil.example/review" }] }] };
  const safe = renderToStaticMarkup(<RestaurantDetail restaurant={bad} demo onBack={() => {}} onHome={() => {}} />);
  assert.doesNotMatch(safe, /href="javascript:|href="https:\/\/evil/);
});

test("detail separates regular hours from current status and handles unknown hours", () => {
  const detail = (openingHours: string[] | null) => renderToStaticMarkup(<RestaurantDetail restaurant={{ ...restaurant, isOpenNow: false, openingHours }} demo={false} onBack={() => {}} onHome={() => {}} />);
  const html = detail(['月曜日: 定休日', '火曜日: 11:00～14:00、17:00～22:00']);
  assert.match(html, /取得時点では営業時間外/);
  assert.match(html, /通常の営業時間/);
  assert.match(html, /火曜日: 11:00～14:00、17:00～22:00/);
  assert.match(html, /祝日・臨時休業/);
  assert.match(detail(null), /営業時間不明/);
});
