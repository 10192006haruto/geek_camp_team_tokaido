"use client";

import { useEffect, useRef, useState } from "react";
import type { Filters, Location, PreviewScenario, Restaurant, SearchResponse } from "../_lib/restaurant-types";
import { DEFAULT_FILTERS, DEMO_LOCATION, searchPreview } from "../_lib/preview";
import { locationErrorMessage, safeExternalUrl, SearchFailure, searchRestaurants } from "../_lib/search";
import { MealIllustration, Pin } from "./artwork";
import { Dialog, Intro } from "./dialog";
import { Credits, RestaurantCard, RestaurantMeta, RestaurantPhoto } from "./restaurant-card";

type Mode = "live" | "demo";
type Busy = "locating" | "searching" | null;
type Result = { data: SearchResponse; filters: Filters; mode: Mode };
const radiusLabel = (radius: number) => radius < 1000 ? `${radius}m` : `${radius / 1000}km`;
const priceLabels = { free: "無料の価格帯", inexpensive: "手頃な価格帯", moderate: "中程度の価格帯", expensive: "高めの価格帯", very_expensive: "とても高めの価格帯" };

function getLocation(): Promise<Location> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext || !navigator.geolocation) {
      reject(new SearchFailure("この環境では位置情報を利用できません。HTTPSまたはlocalhostで、位置情報に対応したブラウザをお使いください。"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => reject(new SearchFailure(locationErrorMessage(error.code))),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 },
    );
  });
}

export function Kokomeshi() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [mode, setMode] = useState<Mode>("live");
  const [scenario, setScenario] = useState<PreviewScenario>("success");
  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState<Restaurant | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<{ message: string; stage: "location" | "search" } | null>(null);
  const location = useRef<Location | null>(null);
  const freshLocation = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);

  async function begin(nextMode: Mode) {
    const id = ++generation.current;
    controller.current?.abort();
    setMode(nextMode); setError(null);
    if (nextMode === "demo") {
      location.current = DEMO_LOCATION; freshLocation.current = true;
      setBusy(null); setPanelOpen(true); return;
    }
    setBusy("locating");
    try {
      const coordinates = await getLocation();
      if (id !== generation.current) return;
      location.current = coordinates; freshLocation.current = true; setPanelOpen(true);
    } catch (failure) {
      if (id === generation.current) setError({ stage: "location", message: failure instanceof SearchFailure ? failure.message : "現在地を取得できませんでした。端末の設定を確認してください。" });
    } finally { if (id === generation.current) setBusy(null); }
  }

  async function submit() {
    const id = ++generation.current;
    controller.current?.abort();
    const activeController = new AbortController(); controller.current = activeController;
    setPanelOpen(false); setError(null);
    let stage: "location" | "search" = "location";
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const requestedFilters = { ...filters };
    try {
      if (mode === "demo") location.current = DEMO_LOCATION;
      else if (!freshLocation.current || !location.current) {
        setBusy("locating");
        const coordinates = await getLocation();
        if (id !== generation.current) return;
        location.current = coordinates;
      }
      freshLocation.current = false;
      stage = "search"; setBusy("searching");
      const request = { ...requestedFilters, location: location.current! };
      timeout = setTimeout(() => { timedOut = true; activeController.abort(); }, 15000);
      const data = mode === "demo"
        ? await searchPreview(request, scenario, activeController.signal)
        : await searchRestaurants(request, activeController.signal);
      if (id !== generation.current) return;
      setResult({ data, filters: requestedFilters, mode });
      requestAnimationFrame(() => { if (id !== generation.current) return; resultsHeading.current?.focus({ preventScroll: true }); resultsHeading.current?.scrollIntoView({ block: "start", behavior: "instant" }); });
    } catch (failure) {
      if (id !== generation.current) return;
      setError({ stage, message: timedOut ? "検索に時間がかかっています。通信環境を確認して再試行してください。"
        : failure instanceof SearchFailure ? failure.message : "通信に失敗しました。接続を確認して再試行してください。" });
    } finally {
      clearTimeout(timeout);
      if (id === generation.current) setBusy(null);
    }
  }

  return <>
    <a className="skip-link" href="#main">本文へスキップ</a>
    <header className="site-header"><a className="brand" href="#main" aria-label="ここメシ ホーム"><Pin /><span>ここメシ</span></a><span className="header-note">知らない街に、おいしい出会い。</span><span className="preview-badge">フロントプレビュー</span></header>
    <main id="main" className="main-shell">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy"><p className="eyebrow"><span /> いつもの検索から、ちょっと寄り道。</p>
          <h1 id="hero-title">この街で出会う、<br /><span>ここならでは</span>の一皿。</h1>
          <p className="hero-description">旅先の路地に、ふらっと入った食堂。<br />そこで食べた一皿が、街の思い出になる。<br />そんな出会いを、今いる場所から。</p>
          <button className="primary search-start" onClick={() => void begin("live")} disabled={busy !== null}><Pin />近くのご当地グルメを探す<span aria-hidden="true">→</span></button>
          <p className="location-note"><span aria-hidden="true">◎</span> ボタンを押すと現在地を取得します</p>
          <button className="text-button demo-start" onClick={() => void begin("demo")}>位置情報を使わず、デモで試す <span aria-hidden="true">↗</span></button>
          <p className="demo-note">固定座標・架空店舗の画面デモです。検索APIは接続準備中。</p>
        </div>
        <div className="hero-visual"><span className="vertical-copy">おいしい、を旅の思い出に。</span><MealIllustration /><span className="illustration-stamp">街の味に<br /><strong>出会おう。</strong></span><p className="visual-caption">A LITTLE DETOUR, A DELICIOUS DISCOVERY.</p></div>
      </section>

      <div className="status-region" aria-live="polite" aria-atomic="true">{busy && <p className="loading-message"><span className="spinner" />{busy === "locating" ? "現在地を取得しています…" : "近くの一皿を探しています…"}{result && "（表示中の一覧は前回の結果です）"}</p>}</div>
      {error && <section className="error-panel" role="alert"><h2>{error.stage === "location" ? "現在地を確認できませんでした" : "検索を完了できませんでした"}</h2><p>{error.message}</p><div className="button-row"><button className="secondary" disabled={busy !== null} onClick={() => error.stage === "location" ? void begin(mode) : void submit()}>再試行する</button><button className="text-button" onClick={() => { setMode("demo"); location.current = DEMO_LOCATION; freshLocation.current = true; setPanelOpen(true); }}>デモで試す</button></div></section>}

      {result ? <section className="results" aria-labelledby="results-title">
        <div className="section-heading"><div><p className="eyebrow">YOUR NEXT DELICIOUS STOP</p><h2 id="results-title" tabIndex={-1} ref={resultsHeading}>近くで見つけた、おいしい候補。<span className="count">{result.data.returnedCount}件</span></h2></div><button className="secondary" onClick={() => setPanelOpen(true)}>条件を変更 <span aria-hidden="true">☷</span></button></div>
        <div className="applied-filters"><span>{result.mode === "demo" ? "モック · 東京駅付近の固定座標" : "取得した現在地"}</span><span>半径 {radiusLabel(result.filters.radiusMeters)}</span><span>{result.filters.cuisine ?? "ジャンル指定なし"}</span><span>{result.filters.budgetMaxYen === null ? "予算指定なし" : `${result.filters.budgetMaxYen.toLocaleString()}円以下`}</span></div>
        {result.mode === "demo" && <p className="result-note">すべて架空の店舗です。評価・メニュー・営業情報もデモ用で、実在の店舗情報ではありません。</p>}
        {(busy || error) && <p className="result-note">前回の検索結果を表示しています。新しい検索が成功すると更新されます。</p>}
        {result.data.restaurants.length ? <div className="restaurant-grid">{result.data.restaurants.map((restaurant, index) => <RestaurantCard key={restaurant.id} restaurant={restaurant} index={index} onSelect={() => setSelected(restaurant)} />)}</div>
          : <div className="empty-state"><Pin /><h3>まだ見つからない一皿が、あるかも。</h3><p>条件に合うお店は見つかりませんでした。<br />{filters.radiusMeters < 3000 ? "少し範囲を広げるか、条件を変えてみましょう。" : "ジャンルや予算の指定を外してみましょう。"}</p><button className="primary" onClick={() => { if (filters.radiusMeters < 3000) setFilters({ ...filters, radiusMeters: 3000 }); setPanelOpen(true); }}>{filters.radiusMeters < 3000 ? "範囲を3kmに広げて条件を確認" : "条件を変更する"}</button></div>}
        <button className="text-button research" disabled={busy !== null} onClick={() => setPanelOpen(true)}>{mode === "demo" ? "条件を確認してもう一度デモ検索" : "条件を確認して現在地を更新・再検索"} <span aria-hidden="true">↻</span></button>
      </section> : <section className="discovery-guide" aria-labelledby="guide-title"><div className="guide-heading"><p className="eyebrow">ひとつ先の、おいしい出会い。</p><h2 id="guide-title">ここメシで見つけるもの</h2></div><div className="guide-items"><article><span className="guide-number">01 / LOCAL</span><h3>その土地ならではの味</h3><p>メニューや紹介情報を手がかりに、<br />地域の一皿を見つけよう。</p></article><article><span className="guide-number">02 / DISCOVER</span><h3>まだ知らない、小さなお店</h3><p>いつもの候補から少し離れて、<br />新しいお気に入りに出会おう。</p></article><article><span className="guide-number">03 / REASON</span><h3>おすすめには、理由を</h3><p>お店の情報に基づいた理由で、<br />今日の一軒を選びやすく。</p></article></div></section>}
      <footer className="site-footer"><span className="footer-brand">ここメシ</span><span>ひと皿から、街を好きになる。</span><span>FRONTEND PREVIEW</span></footer>
    </main>

    <Dialog open={panelOpen} onClose={() => setPanelOpen(false)} titleId="filter-title">
      <div className="sheet-handle" /><div className="dialog-heading"><div><p className="eyebrow">あなたの気分に合わせて</p><h2 id="filter-title">どんな一皿に出会う？</h2></div><button className="icon-button" onClick={() => setPanelOpen(false)} aria-label="絞り込みを閉じる">×</button></div>
      <p className="mode-notice">{mode === "demo" ? "モックモード · 東京駅付近の固定座標／架空店舗" : "現在地を利用 · 同一プロジェクトの検索APIに接続"}</p>
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <fieldset><legend>どのくらい近く？<span>検索範囲</span></legend><div className="radius-options">{([500, 1000, 3000] as const).map((radius) => <label key={radius} className={filters.radiusMeters === radius ? "selected" : ""}><input type="radio" name="radius" value={radius} checked={filters.radiusMeters === radius} onChange={() => setFilters({ ...filters, radiusMeters: radius })} /><strong>{radiusLabel(radius)}</strong><span>{radius === 500 ? "すぐ近く" : radius === 1000 ? "ほどよく近く" : "少し足をのばす"}</span></label>)}</div></fieldset>
        <label className="select-label" htmlFor="cuisine">料理ジャンル<span>任意</span></label><select id="cuisine" value={filters.cuisine ?? ""} onChange={(event) => setFilters({ ...filters, cuisine: event.target.value || null })}><option value="">指定なし · いろんな味に出会う</option><option>和食</option><option>そば・うどん</option><option>カフェ</option></select>
        <label className="select-label" htmlFor="budget">予算の上限<span>任意</span></label><select id="budget" value={filters.budgetMaxYen ?? ""} onChange={(event) => setFilters({ ...filters, budgetMaxYen: event.target.value ? Number(event.target.value) : null })}><option value="">指定なし</option><option value="1000">1,000円以下</option><option value="2000">2,000円以下</option><option value="3000">3,000円以下</option></select>
        <p className="field-note">ジャンル・予算の選択肢はデモ用です。実APIでの対応は確認中です。</p>
        {mode === "demo" && <details className="preview-controls"><summary>開発用：画面の状態を確認</summary><label htmlFor="scenario">次の検索で表示する状態</label><select id="scenario" value={scenario} onChange={(event) => setScenario(event.target.value as PreviewScenario)}><option value="success">通常</option><option value="empty">0件</option><option value="missing">情報の一部欠損（null）</option><option value="error">検索エラー</option><option value="slow">遅い検索（4秒）</option></select></details>}
        <div className="sheet-actions"><button className="text-button" type="button" onClick={() => setFilters(DEFAULT_FILTERS)}>条件をリセット</button><button className="primary" type="submit">{mode === "demo" ? "この条件でデモ検索" : "この条件で探す"}<span aria-hidden="true">→</span></button></div>
      </form>
    </Dialog>

    <Dialog open={selected !== null} onClose={() => setSelected(null)} titleId="detail-title" className="detail-sheet">
      {selected && <><div className="detail-top"><button className="text-button" onClick={() => setSelected(null)}>← 一覧に戻る</button><span>{result?.mode === "demo" ? "架空店舗のデモ" : "店舗詳細"}</span></div><RestaurantPhoto restaurant={selected} /><div className="detail-body"><p className="eyebrow">{selected.cuisineLabel ?? "ジャンル不明"}</p><h2 id="detail-title">{selected.name}</h2><RestaurantMeta restaurant={selected} /><section className="detail-reason"><h3>このお店が候補になった理由</h3><p>{selected.recommendationReason ?? "選定理由は確認中です。"}</p>{selected.labels.length > 0 && <div className="labels">{selected.labels.map((label) => <span key={label}>{label}</span>)}</div>}</section><dl className="detail-info"><div><dt>住所</dt><dd>{selected.address ?? "住所は不明です"}</dd></div><div><dt>価格帯</dt><dd>{selected.priceLevel === null ? "不明" : priceLabels[selected.priceLevel]}<small>価格帯は実際の金額とは異なります。</small></dd></div><div><dt>営業情報</dt><dd>{selected.isOpenNow === null ? "営業状況は不明です" : selected.isOpenNow ? "取得時点では営業中" : "取得時点では営業時間外"}<small>最新の営業時間は店舗にご確認ください。</small></dd></div></dl><Credits items={selected.attributions} />{safeExternalUrl(selected.googleMapsUrl, true) ? <a className="primary maps-link" href={safeExternalUrl(selected.googleMapsUrl, true)} target="_blank" rel="noopener noreferrer">Google Mapsで経路を見る ↗</a> : <p className="field-note">{result?.mode === "demo" ? "架空店舗のため、Google Mapsへの経路はありません。" : "この店舗のGoogle Mapsリンクは未取得です。"}</p>}</div></>}
    </Dialog>
    <Intro />
  </>;
}
