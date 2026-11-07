"use client";

import { useState } from "react";
import type { Attribution, Restaurant, RestaurantPhotoData } from "../_lib/restaurant-types";
import { safeExternalUrl } from "../_lib/search";
import { Pin } from "./artwork";

export function Credits({ items }: { items: Attribution[] }) {
  return items.length > 0 ? <ul className="credits">{items.map((item, index) => <li key={index} className={item.text === "Google Maps" ? "google-maps-attribution" : undefined} translate={item.text === "Google Maps" ? "no" : undefined}>
    {safeExternalUrl(item.url) ? <a href={safeExternalUrl(item.url)} target="_blank" rel="noopener noreferrer">{item.text}</a> : item.text}
  </li>)}</ul> : null;
}

export function photosFor(restaurant: Restaurant): RestaurantPhotoData[] {
  const primary = safeExternalUrl(restaurant.photoUrl);
  const extras = (restaurant.photos ?? []).filter((photo) => safeExternalUrl(photo.url));
  // Preserve the card's primary photo as the first slide in the detail.
  return [ ...(primary ? [{ url: primary, label: null, attributions: restaurant.photoAttributions }] : []),
    ...extras.filter((photo) => photo.url !== primary) ];
}

function Photo({ photo, name, eager = false }: { photo?: RestaurantPhotoData; name: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className="photo-frame">
    {photo && !failed ?
      // Dynamic provider images are not proxied through a new external service.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photo.url} alt={`${name}${photo.label ? `・${photo.label}` : "の写真"}`} loading={eager ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      : <div className="photo-placeholder"><Pin /><span>写真はまだ届いていません</span><small>お店の情報をご覧ください</small></div>}
  </div>;
}

export function RestaurantPhoto({ restaurant, gallery = false }: { restaurant: Restaurant; gallery?: boolean }) {
  const photos = photosFor(restaurant);
  const shown = gallery ? photos : photos.slice(0, 1);
  const [index, setIndex] = useState(0);
  return <>
    <div className={`restaurant-image ${shown.length > 1 ? "gallery" : ""}`} tabIndex={shown.length > 1 ? 0 : undefined}
      role={shown.length > 1 ? "region" : undefined} aria-label={shown.length > 1 ? "店舗写真。左右にスクロールできます" : undefined}
      onScroll={(event) => setIndex(Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth))}>
      {shown.length ? shown.map((photo) => <Photo key={photo.url} photo={photo} name={restaurant.name} eager={gallery} />) : <Photo name={restaurant.name} />}
    </div>
    {shown.length > 1 && <p className="photo-count" aria-live="polite">{index + 1} / {shown.length}<span>横にスワイプして写真を見る</span></p>}
  </>;
}

export function RestaurantMeta({ restaurant: r }: { restaurant: Restaurant }) {
  return <p className="restaurant-meta">{r.distanceMeters === null ? "距離不明" : `検索した位置から直線 ${Math.round(r.distanceMeters).toLocaleString()}m`}
    {r.isOpenNow !== null && <span className={r.isOpenNow ? "open-label" : "closed-label"}>{r.isOpenNow ? "営業中" : "営業時間外"}<small>（取得時点）</small></span>}
  </p>;
}

export function RestaurantCard({ restaurant, onSelect, index }: { restaurant: Restaurant; onSelect: () => void; index: number }) {
  return <article className="candidate" aria-labelledby={`name-${restaurant.id}`}>
    <div className="candidate-visual"><RestaurantPhoto restaurant={restaurant} />
      <span className="candidate-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <div className="candidate-glass"><RestaurantMeta restaurant={restaurant} />
        <h3 id={`name-${restaurant.id}`}>{restaurant.name}</h3>
        {restaurant.cuisineLabel && <p className="cuisine">{restaurant.cuisineLabel}</p>}
        <p className="reason">{restaurant.inferredMenu.length
          ? `クチコミの料理：${restaurant.inferredMenu.map((item) => item.name).join("・")}`
          : "クチコミからの料理情報は未取得です。"}</p>
        <span className="candidate-action">お店を詳しく見る <span aria-hidden="true">↗</span></span>
      </div>
      <button id={`card-${restaurant.id}`} className="whole-card" onClick={onSelect} aria-label={`${restaurant.name}の詳細を見る`} />
    </div>
    <Credits items={photosFor(restaurant)[0]?.attributions ?? restaurant.photoAttributions} />
    <Credits items={restaurant.attributions} />
  </article>;
}

export function ReviewDishes({ restaurant }: { restaurant: Restaurant }) {
  return <section className="review-dishes" aria-labelledby="review-dishes-title">
    <h2 id="review-dishes-title">クチコミで言及された料理</h2>
    <p className="muted">過去のクチコミから抽出した情報です。現在の提供を保証するものではありません。</p>
    {restaurant.attributions.some((a) => a.text === "Google Maps") && <p className="muted">Google Mapsが関連性順に返した最大5件のクチコミから、料理への言及を抽出しています。</p>}
    {restaurant.inferredMenu.length === 0 ? <p>クチコミからの料理情報は未取得です。</p>
      : <ul className="dish-list">{restaurant.inferredMenu.map((item, index) => <li key={`${item.name}-${index}`}>
        <h3>{item.name}</h3>
        {item.evidence.map((evidence, i) => <figure className="review-evidence" key={i}>
          <blockquote><p>{evidence.quote}</p></blockquote>
          <figcaption>
            {safeExternalUrl(evidence.authorPhotoUrl ?? null) &&
              // eslint-disable-next-line @next/next/no-img-element
              <img className="review-avatar" src={safeExternalUrl(evidence.authorPhotoUrl ?? null)} alt="" width={32} height={32} loading="lazy" referrerPolicy="no-referrer" />}
            <Credits items={[evidence.author]} />
            {evidence.publishTime && <time dateTime={evidence.publishTime}>{new Date(evidence.publishTime).toISOString().slice(0, 10)} 投稿</time>}
            {safeExternalUrl(evidence.reviewUrl, true) && <a href={safeExternalUrl(evidence.reviewUrl, true)} target="_blank" rel="noopener noreferrer">元のクチコミを見る<span className="sr-only">（Google Maps・新しいタブ）</span></a>}
            {evidence.translated && <p className="muted">翻訳されたクチコミです。</p>}
            {evidence.originalText && <details><summary>原文を見る</summary><p>{evidence.originalText}</p></details>}
          </figcaption>
        </figure>)}
      </li>)}</ul>}
  </section>;
}

export function directionsUrl(restaurant: Restaurant, demo: boolean) {
  if (demo) return undefined;
  if (restaurant.location) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${restaurant.location.latitude},${restaurant.location.longitude}`)}`;
  const url = safeExternalUrl(restaurant.googleMapsUrl, true);
  return url && new URL(url).pathname.startsWith("/maps/dir") ? url : undefined;
}

const priceLabels = { free: "無料の価格帯", inexpensive: "手頃な価格帯", moderate: "中程度の価格帯", expensive: "高めの価格帯", very_expensive: "とても高めの価格帯" };
export function RestaurantDetail({ restaurant: r, demo, onBack, onHome }: { restaurant: Restaurant; demo: boolean; onBack: () => void; onHome: () => void }) {
  const directions = directionsUrl(r, demo);
  return <section className="detail-screen" aria-labelledby="detail-title">
    <div className="detail-hero"><RestaurantPhoto key={r.id} restaurant={r} gallery />
      <nav className="photo-nav" aria-label="店舗詳細の移動"><button className="glass-pill" onClick={onBack}>‹ 候補一覧</button><button className="glass-pill" onClick={onHome}>ホーム</button></nav>
    </div>
    <div className="detail-body">
      {demo && <p className="demo-badge">架空店舗のデモ</p>}
      <h1 id="detail-title" tabIndex={-1}>{r.name}</h1>
      {r.cuisineLabel && <p className="detail-cuisine">{r.cuisineLabel}</p>}
      <RestaurantMeta restaurant={r} />
      <ReviewDishes restaurant={r} />
      <Credits items={r.attributions} />
      <dl className="detail-info">
        <div><dt>住所</dt><dd>{r.address ?? "情報なし"}</dd></div>
        <div><dt>営業情報</dt><dd>{r.isOpenNow === null ? "営業状況不明" : r.isOpenNow ? "取得時点では営業中" : "取得時点では営業時間外"}<small>営業時間の詳細は未取得です。</small></dd></div>
        <div><dt>価格情報</dt><dd>{r.priceLevel === null ? "情報なし" : priceLabels[r.priceLevel]}<small>価格帯は実際の金額とは異なります。</small></dd></div>
        <div><dt>評価</dt><dd>{r.rating === null ? "評価不明" : `${r.rating.toFixed(1)} / 5`}<small>{r.reviewCount === null ? "レビュー数不明" : `レビュー ${r.reviewCount.toLocaleString()}件`}</small></dd></div>
      </dl>
      {photosFor(r).some((photo) => photo.attributions.length) && <section className="photo-credits"><h2>写真の出典</h2>{photosFor(r).map((photo) => <Credits key={photo.url} items={photo.attributions} />)}</section>}
      {directions ? <a className="primary" href={directions} target="_blank" rel="noopener noreferrer">この店への経路を見る <span aria-hidden="true">↗</span><span className="sr-only">（Google Maps・新しいタブ）</span></a>
        : <><button className="primary" disabled>この店への経路を見る ↗</button><p className="muted">{demo ? "架空店舗のため、実際の経路はありません。" : "経路の表示に必要な位置情報が未取得です。"}</p></>}
      <button className="text-button detail-back" onClick={onBack}>‹ 候補一覧へ戻る</button>
    </div>
  </section>;
}
