"use client";

import { useState } from "react";
import type { Attribution, Restaurant } from "../_lib/restaurant-types";
import { safeExternalUrl } from "../_lib/search";
import { MealIllustration } from "./artwork";

export function Credits({ items }: { items: Attribution[] }) {
  return items.length > 0 ? <ul className="credits">{items.map((item, index) => <li key={index}>
    {safeExternalUrl(item.url) ? <a href={safeExternalUrl(item.url)} target="_blank" rel="noopener noreferrer">{item.text}</a> : item.text}
  </li>)}</ul> : null;
}

export function RestaurantPhoto({ restaurant }: { restaurant: Restaurant }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = safeExternalUrl(restaurant.photoUrl);
  return <div className="restaurant-image">
    {url && failedUrl !== url ?
      // Provider photos may require attribution and use URLs not known at build time.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={`${restaurant.name}の写真`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
      : <><MealIllustration small /><span className="image-caption">写真は準備中 · イメージイラスト</span></>}
    <Credits items={restaurant.photoAttributions} />
  </div>;
}

export function RestaurantMeta({ restaurant: r }: { restaurant: Restaurant }) {
  return <p className="restaurant-meta"><span className="star" aria-hidden="true">★</span> {r.rating === null ? "評価不明" : r.rating.toFixed(1)}
    <span>（{r.reviewCount === null ? "レビュー数不明" : `${r.reviewCount}件`}）</span>
    <span className="meta-distance">{r.distanceMeters === null ? "距離不明" : `${Math.round(r.distanceMeters)}m`} · 直線距離</span>
  </p>;
}

export function RestaurantCard({ restaurant, onSelect, index }: { restaurant: Restaurant; onSelect: () => void; index: number }) {
  return <article className="restaurant-card">
    <RestaurantPhoto restaurant={restaurant} />
    <div className="card-body"><div className="card-kicker"><span>{restaurant.cuisineLabel ?? "ジャンル不明"}</span><span>0{index + 1}</span></div>
      <h3><button className="restaurant-title" onClick={onSelect}>{restaurant.name}<span aria-hidden="true"> ↗</span></button></h3>
      <RestaurantMeta restaurant={restaurant} />
      <p className="reason"><span aria-hidden="true">✧ </span>{restaurant.recommendationReason ?? "おすすめ理由は確認中です。"}</p>
      <Credits items={restaurant.attributions} />
    </div>
  </article>;
}
