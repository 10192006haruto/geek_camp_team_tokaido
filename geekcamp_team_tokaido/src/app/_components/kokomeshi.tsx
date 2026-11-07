"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Location, PreviewScenario, Restaurant } from "../_lib/restaurant-types";
import { DEMO_LOCATION } from "../_lib/preview";
import { getLocation } from "../_lib/location";
import { DiscoverySession, INITIAL_CONDITIONS, MOOD_LIMIT, scrollIntent, type Conditions, type DiscoveryResult, type Mode, type Screen, type ScrollIntent, type HistoryView, HOME_VIEW, restoreHistory } from "../_lib/discovery";
import { Pin } from "./artwork";
import { Dialog, Intro } from "./dialog";
import { RestaurantCard, RestaurantDetail } from "./restaurant-card";

type Busy = "locating" | "searching" | "ranking" | null;
const radiusLabel = (radius: number) => radius < 1000 ? `${radius}m` : `${radius / 1000}km`;
const statusText = (busy: Busy) => busy === "locating" ? "現在地を取得しています…" : busy === "ranking" ? "おすすめを並べ替えています…" : "近くのお店を探しています…";

export function Kokomeshi() {
  const [draft, setDraft] = useState<Conditions>(INITIAL_CONDITIONS);
  const [mood, setMood] = useState("");
  const [mode, setMode] = useState<Mode>("live");
  const [scenario, setScenario] = useState<PreviewScenario>("success");
  const [screen, setScreen] = useState<Screen>("home");
  const [panel, setPanel] = useState(false);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationReady, setLocationReady] = useState(false);
  const [scroll, setScroll] = useState<{ intent: ScrollIntent; token: number }>({ intent: { kind: "keep" }, token: 0 });
  const session = useRef<DiscoverySession | null>(null);
  const location = useRef<Location | null>(null);
  const generation = useRef(0);
  const running = useRef(false);
  const resultRef = useRef<DiscoveryResult | null>(null);
  const version = useRef(0);
  const returnPlace = useRef({ y: 0, cardId: "" });
  const historyView = useRef<HistoryView>(HOME_VIEW);
  const retry = useRef<(() => void) | null>(null);

  function moveScroll(intent: ScrollIntent) { setScroll((previous) => ({ intent, token: previous.token + 1 })); }
  function cancel() { generation.current++; session.current?.cancel(); running.current = false; setBusy(null); }
  function writeHistory(view: HistoryView, replace = false) {
    historyView.current = view;
    const url = view.screen === "home" ? window.location.pathname : `#${view.screen === "detail" ? "restaurant" : "results"}`;
    window.history[replace ? "replaceState" : "pushState"]({ ...window.history.state, kokomeshi: view }, "", url);
  }
  function savePosition() {
    writeHistory({ ...historyView.current, y: window.scrollY, version: version.current }, true);
  }

  useEffect(() => {
    const activeSession = new DiscoverySession();
    session.current = activeSession;
    const invalidate = () => { generation.current++; activeSession.cancel(); };
    const oldRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    // In-memory results cannot be recovered after a reload. Start honestly at home.
    window.history.replaceState({ ...window.history.state, kokomeshi: historyView.current }, "", window.location.pathname);
    const onPop = (event: PopStateEvent) => {
      generation.current++; session.current?.cancel(); running.current = false; setBusy(null); setError(null);
      const incoming = event.state?.kokomeshi as HistoryView | undefined;
      const restored = restoreHistory(historyView.current, incoming, version.current, resultRef.current);
      historyView.current = restored.view;
      setScreen(restored.view.screen); setPanel(restored.view.panel); setSelected(restored.selected);
      moveScroll(restored.intent);
      if (restored.view.panel && !location.current) {
        setError("現在地の取得が中断されています。「再試行する」で取得してください。");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => { invalidate(); window.history.scrollRestoration = oldRestoration; window.removeEventListener("popstate", onPop); };
  }, []);

  useLayoutEffect(() => {
    if (scroll.intent.kind === "keep" || panel) return;
    const intent = scroll.intent;
    // Run after dialog cleanup restores focus. Fixed photo regions prevent late layout shifts.
    const frame = requestAnimationFrame(() => {
      const target = intent.kind === "restore" && intent.cardId ? document.getElementById(`card-${intent.cardId}`)
        : document.getElementById(screen === "results" ? "results-title" : screen === "detail" ? "detail-title" : "hero-title");
      target?.focus({ preventScroll: true });
      window.scrollTo({ top: intent.kind === "restore" ? intent.y : 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [scroll, screen, panel]);

  function home() {
    cancel(); savePosition(); setPanel(false); setSelected(null); setScreen("home"); setError(null);
    writeHistory({ screen: "home", panel: false, selectedId: null, y: 0, cardId: "", version: version.current });
    moveScroll(scrollIntent("home"));
  }
  function openPanel(nextMode: Mode = mode) {
    if (running.current) return;
    savePosition(); setMode(nextMode); setPanel(true); setError(null);
    writeHistory({ ...historyView.current, panel: true });
    if (screen === "results" && result) {
      location.current = result.location; setLocationReady(true);
    }
    if (screen === "home") {
      location.current = null; setLocationReady(false);
      void locate(nextMode);
    }
  }
  function closePanel() {
    cancel(); setPanel(false); setError(null); moveScroll(scrollIntent("cancel"));
    window.history.back();
  }
  async function locate(nextMode: Mode) {
    if (running.current) return;
    const id = ++generation.current; running.current = true; setBusy("locating"); setError(null);
    retry.current = () => void locate(nextMode);
    try {
      const coordinates = nextMode === "demo" ? DEMO_LOCATION : await getLocation();
      if (id !== generation.current) return;
      location.current = coordinates; setLocationReady(true);
    } catch (failure) {
      if (id === generation.current) setError(failure instanceof Error ? failure.message : "現在地を取得できませんでした。");
    } finally { if (id === generation.current) { running.current = false; setBusy(null); } }
  }

  async function search(conditions: Conditions, refresh = false, useMode = mode, useScenario = scenario) {
    if (running.current || !session.current) return;
    const id = ++generation.current; running.current = true; setError(null);
    retry.current = () => void search(conditions, refresh, useMode, useScenario);
    try {
      let coordinates = historyView.current.screen === "results" && resultRef.current?.mode === useMode
        ? resultRef.current.location : location.current;
      if (refresh || !coordinates) {
        setBusy("locating");
        coordinates = useMode === "demo" ? DEMO_LOCATION : await getLocation();
        if (id !== generation.current) return;
      }
      const request = { conditions: { ...conditions }, location: coordinates, mode: useMode, scenario: useScenario };
      setBusy(refresh || session.current.needsAcquisition(request) ? "searching" : "ranking");
      const next = await session.current.run(request, refresh);
      if (id !== generation.current) return;
      location.current = coordinates; setLocationReady(true);
      resultRef.current = next; version.current++;
      setResult(next); setMood(next.applied.mood); setPanel(false); setScreen("results"); setSelected(null);
      returnPlace.current = { y: 0, cardId: "" };
      writeHistory({ screen: "results", panel: false, selectedId: null, y: 0, cardId: "", version: version.current }, historyView.current.panel || historyView.current.screen === "results");
      moveScroll(scrollIntent("search"));
    } catch (failure) {
      if (id === generation.current) setError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "検索に時間がかかっています。もう一度お試しください。");
    } finally { if (id === generation.current) { running.current = false; setBusy(null); } }
  }
  function openDetail(restaurant: Restaurant) {
    cancel();
    returnPlace.current = { y: window.scrollY, cardId: restaurant.id };
    writeHistory({ ...historyView.current, ...returnPlace.current, version: version.current }, true);
    setSelected(restaurant); setScreen("detail");
    writeHistory({ screen: "detail", panel: false, selectedId: restaurant.id, y: 0, cardId: restaurant.id, version: version.current });
    moveScroll(scrollIntent("detail"));
  }

  const feedback = <>
    {busy && <p className="loading-message" role="status"><span className="spinner" />{statusText(busy)}</p>}
    {error && <div className="error-panel" role="alert"><p>{error}</p>{result && <p>前回の結果はそのまま残しています。</p>}<button className="text-button" disabled={!!busy} onClick={() => retry.current?.()}>再試行する</button></div>}
  </>;

  return <>
    <a className="skip-link" href="#main">本文へスキップ</a>
    <main id="main" className={`app-shell ${panel ? "panel-open" : ""}`}>
      <div className="screen-background">
        <section className="hero" hidden={screen !== "home"} aria-labelledby="hero-title">
          <Image src="/images/home-meal.webp" alt="天ぷらとそばの食卓。ホームのイメージ写真" fill priority sizes="(max-width: 900px) 100vw, 1120px" className="hero-photo" />
          <div className="hero-shade" />
          <header className="hero-top"><span className="hero-location">◎ 現在地から探す</span><span className="brand"><Pin />ここメシ</span></header>
          <div className="hero-copy"><h1 id="hero-title" tabIndex={-1}>この近く、<br />何食べる？</h1>
            <button className="primary hero-search" onClick={() => openPanel("live")} disabled={!!busy}>近くのお店の料理を探す <span aria-hidden="true">↗</span></button>
            <p className="hero-help">現在地を使います。現在は東京駅周辺の架空店舗によるモック検索です</p>
            <button className="demo-start" onClick={() => openPanel("demo")} disabled={!!busy}>位置情報を使わず、デモで試す <span aria-hidden="true">→</span></button>
            <p className="hero-demo-note">架空店舗の操作デモもご覧いただけます</p>
          </div>
          <p className="hero-credit">イメージ写真：<a href="https://unsplash.com/photos/xBMNxrbQonw" target="_blank" rel="noopener noreferrer">bady abbas / Unsplash</a></p>
        </section>

        {result && <section className="results-screen" hidden={screen !== "results"} aria-labelledby="results-title" aria-busy={!!busy}>
          <nav className="results-nav" aria-label="候補一覧の移動"><button className="pill" onClick={home}>⌂ ホーム</button><span className="small-brand"><Pin />ここメシ</span><button className="pill" onClick={() => openPanel(result.mode)} disabled={!!busy}>条件 <span aria-hidden="true">☷</span></button></nav>
          <header className="results-heading"><p className="eyebrow">{result.mode === "demo" ? "架空店舗のデモ・東京駅付近" : "モック検索・東京駅周辺の架空店舗"}</p><h1 id="results-title" tabIndex={-1}>この近くで、<br />気になる一軒。</h1>
            <p className="applied-summary">半径 {radiusLabel(result.applied.radiusMeters)}<span>／</span>{result.applied.openNow ? "営業中のみ" : "営業状況の指定なし"}<span>／</span>{result.displayed.length}件</p>
          </header>
          <div className="ranking-box"><p className="mood-summary">今日の気分：{result.applied.mood || "おまかせ"}</p>
            <form onSubmit={(event) => { event.preventDefault(); setDraft((previous) => ({ ...previous, mood })); void search({ ...result.applied, mood }, false, result.mode, result.scenario); }}>
              <label htmlFor="rerank-mood">気分を変えて、並べ替え</label><div className="rerank-row"><input id="rerank-mood" value={mood} maxLength={MOOD_LIMIT} onChange={(event) => setMood(event.target.value)} placeholder="例：そばが食べたい" /><button className="compact-primary" disabled={!!busy}>並べ替え</button></div>
            </form>
            <p className="muted">{result.batch.scope === "server-results"
              ? "料理の情報がある候補に営業条件・気分を適用し、最大5件を表示します。"
              : "表示状態の確認用データです。取得済みの架空候補から最大5件を表示します。"}</p>
            <p className="muted">料理名・料理ジャンルで判断できる気分に対応。一致が不明なお店も残します。</p>
          </div>
          {(result.mode === "demo" || result.displayed.some((r) => r.id.startsWith("mock-"))) && <p className="scope-note">店舗・クチコミ・営業情報・評価はすべて架空です。実際の店舗写真や経路はありません。</p>}
          {!panel && <div className="feedback">{feedback}</div>}
          {result.notice && <p className="notice" role="status">{result.notice}</p>}
          {result.displayed.length ? <div className="candidate-list">{result.displayed.map((restaurant, index) => <RestaurantCard key={restaurant.id} restaurant={restaurant} index={index} onSelect={() => openDetail(restaurant)} />)}</div>
            : <section className="empty-state"><Pin /><h2>条件に合う料理の情報をクチコミから確認できませんでした</h2><p>範囲を広げるか、営業中の条件を外してみてください。営業状況が不明なお店は「営業中のみ」に含めていません。</p></section>}
          <section className="search-again"><span className="end-mark" aria-hidden="true">・ ・ ・</span><h2>ピンとくるお店、なかった？</h2><p>もう少し先まで、探してみよう。</p><button className="primary" disabled={!!busy} onClick={() => openPanel(result.mode)}>条件を変えて探す <span aria-hidden="true">↗</span></button><button className="text-button location-refresh" disabled={!!busy} onClick={() => void search(result.applied, true, result.mode, result.scenario)}>◎ 現在地を更新して探し直す</button>{busy && <p role="status">{statusText(busy)}</p>}{error && !panel && <p role="alert">{error} 前回の結果を残しています。</p>}</section>
          <footer className="site-footer">ここメシ</footer>
        </section>}
        {selected && screen === "detail" && <RestaurantDetail restaurant={selected} demo={result?.mode === "demo" || selected.id.startsWith("mock-")} onBack={() => window.history.back()} onHome={home} />}
      </div>
    </main>

    <Dialog open={panel} onClose={closePanel} titleId="filter-title">
      <div className="sheet-handle" /><div className="sheet-heading"><p>{mode === "demo" ? "架空店舗のデモ" : locationReady ? "現在地の周辺" : "現在地を確認"}</p><button className="glass-circle" onClick={closePanel} aria-label="検索条件を閉じる">×</button></div>
      <h2 id="filter-title">今日は、何食べたい？</h2>
      <form onSubmit={(event) => { event.preventDefault(); void search(draft); }}>
        <fieldset disabled={busy === "searching" || busy === "ranking"} className="condition-fields">
          <label className="mood-label" htmlFor="mood">今日の気分 <span>任意</span></label>
          <textarea id="mood" rows={2} value={draft.mood} maxLength={MOOD_LIMIT} onChange={(event) => setDraft({ ...draft, mood: event.target.value })} placeholder="例：今日は麺が食べたい" aria-describedby="mood-help mood-count" />
          <div className="mood-hints">{["麺もの", "和食", "カフェ"].map((hint) => <button type="button" key={hint} onClick={() => { setDraft({ ...draft, mood: `${draft.mood.trim() ? draft.mood.trim() + "、" : ""}${hint}`.slice(0, MOOD_LIMIT) }); document.getElementById("mood")?.focus(); }}>＋ {hint}</button>)}</div>
          <div className="mood-description"><p id="mood-help">クチコミの料理情報をもとに、気分に合わせて並べます。未対応の気分は距離順です</p><span id="mood-count">{draft.mood.length}/{MOOD_LIMIT}</span></div>
          <fieldset className="radius-field"><legend>探す範囲</legend><div className="radius-options">{([500, 1000, 3000] as const).map((radius) => <label key={radius}><input type="radio" name="radius" value={radius} checked={draft.radiusMeters === radius} onChange={() => setDraft({ ...draft, radiusMeters: radius })} /><span>{radiusLabel(radius)}</span></label>)}</div></fieldset>
          <label className="open-row"><span>今営業している店だけ</span><input type="checkbox" role="switch" checked={draft.openNow} onChange={(event) => setDraft({ ...draft, openNow: event.target.checked })} /></label>
          {mode === "demo" && <details className="preview-controls"><summary>デモの表示状態</summary><label htmlFor="scenario">次に表示する状態</label><select id="scenario" value={scenario} onChange={(event) => setScenario(event.target.value as PreviewScenario)}><option value="success">通常・料理と引用の表示</option><option value="empty">0件</option><option value="missing">情報の一部欠損</option><option value="error">検索失敗</option><option value="rank-error">並べ替え失敗</option><option value="slow">遅い検索（4秒）</option></select></details>}
        </fieldset>
        <div className="panel-feedback">{feedback}</div>
        <button type="submit" className="primary" disabled={!!busy || !locationReady}>この条件で探す <span aria-hidden="true">↗</span></button>
        <p className="panel-note">{mode === "demo" ? "東京駅の固定座標と架空店舗を使います。現在地は取得しません。" : "現在は東京駅周辺の架空店舗を検索します。離れた場所では0件になります。"}</p>
      </form>
    </Dialog>
    <Intro />
  </>;
}
