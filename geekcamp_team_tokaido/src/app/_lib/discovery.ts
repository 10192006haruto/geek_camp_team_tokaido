import type { Location, PreviewScenario, Restaurant } from "./restaurant-types";
import { searchRestaurants } from "./search";
import { searchCandidatePreview } from "./preview";

// UI-only contract. The legacy server payload stays unchanged.
export const MOOD_LIMIT = 150;
export type Conditions = { radiusMeters: 500 | 1000 | 3000; mood: string; openNow: boolean };
export const INITIAL_CONDITIONS: Conditions = { radiusMeters: 1000, mood: "", openNow: false };
export type Mode = "live" | "demo";
export type CandidateBatch = { candidates: Restaurant[]; scope: "returned" | "demo-pool" };
export type DiscoveryResult = {
  batch: CandidateBatch; displayed: Restaurant[]; eligibleCount: number;
  applied: Conditions; location: Location; mode: Mode; scenario: PreviewScenario; notice: string | null;
};
export type DiscoveryRequest = { conditions: Conditions; location: Location; mode: Mode; scenario: PreviewScenario };
export type Acquire = (request: DiscoveryRequest, signal: AbortSignal) => Promise<CandidateBatch>;
export type Rank = (candidates: Restaurant[], mood: string, signal: AbortSignal) => Promise<Restaurant[]>;

export const acquireCandidates: Acquire = async (request, signal) => {
  // Mood is deliberately never a retrieval keyword. Do not switch to Text Search.
  const payload = { location: request.location, radiusMeters: request.conditions.radiusMeters, cuisine: null, budgetMaxYen: null };
  if (request.mode === "demo") return { candidates: await searchCandidatePreview(payload, request.scenario, signal), scope: "demo-pool" };
  const response = await searchRestaurants(payload, signal);
  // This endpoint currently returns only its recommended subset, not the complete pool.
  return { candidates: response.restaurants, scope: "returned" };
};

// Conservative, local ordering based only on supplied cuisine, never generated prose.
// Unrecognized intent and missing cuisine keep their original relative order.
export const rankByMood: Rank = async (candidates, mood, signal) => {
  signal.throwIfAborted();
  if (!mood.trim() || /以外|苦手|嫌い|食べたくない|避け|なしで/.test(mood)) return [...candidates];
  const groups = [
    { intent: /麺|そば|うどん|ラーメン/, cuisine: /そば|うどん|ラーメン|麺/ },
    { intent: /和食/, cuisine: /和食/ },
    { intent: /カフェ|コーヒー|喫茶/, cuisine: /カフェ|喫茶/ },
    { intent: /郷土料理/, cuisine: /郷土料理/ },
    { intent: /焼肉/, cuisine: /焼肉/ },
  ].filter((group) => group.intent.test(mood));
  const score = (r: Restaurant) => Number(r.cuisineLabel !== null && groups.some((group) => group.cuisine.test(r.cuisineLabel!)));
  return candidates.map((restaurant, index) => ({ restaurant, index, score: score(restaurant) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).map(({ restaurant }) => restaurant);
};

export function candidateKey(request: DiscoveryRequest) {
  return [request.mode, request.location.latitude, request.location.longitude, request.conditions.radiusMeters,
    request.mode === "demo" ? request.scenario : "live"].join(":");
}

/** Owns a single in-memory candidate set. No coordinates or mood are persisted. */
export class DiscoverySession {
  private cached: { key: string; batch: CandidateBatch } | null = null;
  private controller: AbortController | null = null;
  private revision = 0;
  constructor(private acquire: Acquire = acquireCandidates, private rank: Rank = rankByMood) {}
  cancel() { this.revision++; this.controller?.abort(); }
  needsAcquisition(request: DiscoveryRequest) { return this.cached?.key !== candidateKey(request); }
  async run(request: DiscoveryRequest, refresh = false): Promise<DiscoveryResult> {
    this.cancel();
    const revision = this.revision;
    const controller = new AbortController();
    this.controller = controller;
    const signal = controller.signal;
    const key = candidateKey(request);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ensureCurrent = () => {
      signal.throwIfAborted();
      if (revision !== this.revision) throw new DOMException("Superseded", "AbortError");
    };
    try {
      timer = setTimeout(() => controller.abort(new Error("検索に時間がかかっています。もう一度お試しください。")), 15000);
      const batch = !refresh && this.cached?.key === key ? this.cached.batch : await this.acquire(request, signal);
      ensureCurrent();
      this.cached = { key, batch };
      const eligible = batch.candidates.filter((r) => !request.conditions.openNow || r.isOpenNow === true);
      let ranked = eligible;
      let notice: string | null = null;
      try {
        if (request.mode === "demo" && request.scenario === "rank-error") throw new Error("Demo ranking failure");
        ranked = await this.rank([...eligible], request.conditions.mood.trim().slice(0, MOOD_LIMIT), signal);
        // A ranker must reorder, never add or omit candidates or invent restaurant facts.
        if (ranked.length !== eligible.length || new Set(ranked.map((r) => r.id)).size !== eligible.length
          || ranked.some((r) => !eligible.some((original) => original.id === r.id))) throw new Error("Invalid ranking");
        const byId = new Map(eligible.map((r) => [r.id, r]));
        ranked = ranked.map((r) => byId.get(r.id)!);
      } catch {
        ensureCurrent();
        notice = "気分での並べ替えができなかったため、通常のおすすめ順で表示しています。";
        ranked = eligible;
      }
      ensureCurrent();
      return { batch, displayed: ranked.slice(0, 5), eligibleCount: eligible.length,
        applied: { ...request.conditions, mood: request.conditions.mood.trim().slice(0, MOOD_LIMIT) },
        location: request.location, mode: request.mode, scenario: request.scenario, notice };
    } finally { clearTimeout(timer); }
  }
}

export type Screen = "home" | "results" | "detail";
export type ScrollIntent = { kind: "top" } | { kind: "restore"; y: number; cardId: string } | { kind: "keep" };
export function scrollIntent(event: "search" | "home" | "detail" | "back" | "cancel", saved?: { y: number; cardId: string }): ScrollIntent {
  if (event === "cancel") return { kind: "keep" };
  if (event === "back" && saved) return { kind: "restore", ...saved };
  return { kind: "top" };
}

export type HistoryView = { screen: Screen; panel: boolean; selectedId: string | null; y: number; cardId: string; version: number };
export const HOME_VIEW: HistoryView = { screen: "home", panel: false, selectedId: null, y: 0, cardId: "", version: 0 };
export function restoreHistory(previous: HistoryView, incoming: HistoryView | undefined, version: number, result: DiscoveryResult | null) {
  const view = incoming && (incoming.screen === "home" || result) ? { ...incoming } : { ...HOME_VIEW, version };
  const selected = result?.displayed.find((r) => r.id === view.selectedId) ?? null;
  if (view.screen === "detail" && !selected) view.screen = result ? "results" : "home";
  // Closing a panel leaves focus restoration to the dialog and never moves the page.
  const intent = previous.panel && !view.panel && previous.screen === view.screen && view.version === version
    ? scrollIntent("cancel") : view.screen === "results" && view.version === version
      ? scrollIntent("back", { y: view.y, cardId: view.cardId }) : scrollIntent("home");
  return { view, selected, intent };
}
