import type { Location, PreviewScenario, Restaurant } from "./restaurant-types";
import { searchRestaurants } from "./search";
import { searchCandidatePreview } from "./preview";

import { MOOD_LIMIT, type SearchConditions } from "../../types/restaurants";
import { orderByMood } from "../../lib/restaurants/mood";
export { MOOD_LIMIT };
export type Conditions = SearchConditions;
export const INITIAL_CONDITIONS: Conditions = { radiusMeters: 1000, mood: "", openNow: false };
export type Mode = "live" | "demo";
export type CandidateBatch = { candidates: Restaurant[]; scope: "server-results" | "demo-pool" };
export type DiscoveryResult = {
  batch: CandidateBatch; displayed: Restaurant[]; eligibleCount: number;
  applied: Conditions; location: Location; mode: Mode; scenario: PreviewScenario; notice: string | null;
};
export type DiscoveryRequest = { conditions: Conditions; location: Location; mode: Mode; scenario: PreviewScenario };
export type Acquire = (request: DiscoveryRequest, signal: AbortSignal) => Promise<CandidateBatch>;
export type Rank = (candidates: Restaurant[], mood: string, signal: AbortSignal) => Promise<Restaurant[]>;

export const acquireCandidates: Acquire = async (request, signal) => {
  const payload = { location: request.location, ...request.conditions };
  // Normal demo also traverses the real HTTP / classification pipeline at fixed coordinates.
  if (request.mode === "demo" && request.scenario !== "success")
    return { candidates: await searchCandidatePreview(payload, request.scenario, signal), scope: "demo-pool" };
  const response = await searchRestaurants(payload, signal);
  return { candidates: response.restaurants, scope: "server-results" };
};

// Conservative, local ordering based only on supplied cuisine, never generated prose.
// Unrecognized intent and missing cuisine keep their original relative order.
export const rankByMood: Rank = async (candidates, mood, signal) => {
  signal.throwIfAborted();
  return orderByMood(candidates, mood, (r) => r.cuisineLabel ?? "");
};

export function candidateKey(request: DiscoveryRequest) {
  return [request.mode, request.location.latitude, request.location.longitude, request.conditions.radiusMeters,
    request.mode === "demo" ? request.scenario : "live",
    ...(request.mode === "demo" && request.scenario !== "success" ? [] : [request.conditions.mood, request.conditions.openNow])].join(":");
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
      if (batch.scope === "server-results") {
        return { batch, displayed: batch.candidates, eligibleCount: batch.candidates.length,
          applied: { ...request.conditions, mood: request.conditions.mood.trim() },
          location: request.location, mode: request.mode, scenario: request.scenario, notice: null };
      }
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
