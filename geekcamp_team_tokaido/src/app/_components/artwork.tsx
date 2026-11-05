export function Pin({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 80 100" fill="none" aria-hidden="true">
    <path d="M40 96S7 58 7 36a33 33 0 1 1 66 0c0 22-33 60-33 60Z" fill="currentColor" />
    <path d="M21 36h38c-2 15-10 21-19 21S23 51 21 36Z" fill="#fff8e9" />
    <path d="M25 34c0-8 7-13 15-13s15 5 15 13M32 59h16" stroke="#fff8e9" strokeWidth="4" strokeLinecap="round" />
  </svg>;
}

export function MealIllustration({ small = false }: { small?: boolean }) {
  return <svg className={small ? "meal-art small" : "meal-art"} viewBox="0 0 540 440" fill="none" aria-hidden="true">
    <ellipse cx="270" cy="235" rx="211" ry="180" fill="#e9eddd" />
    <path d="M55 325c78-39 319-43 431-3l-15 32c-112 38-309 30-397 1Z" fill="#e7c697" />
    <path d="m69 322 391 11M89 343l346 2" stroke="#cfaa76" strokeWidth="2" />
    <ellipse cx="235" cy="240" rx="128" ry="44" fill="#ab4c25" />
    <path d="M108 237c9 72 51 116 126 116s120-44 129-116" fill="#c45b2a" />
    <path d="M129 266c13 42 44 65 92 71M152 278c15 31 34 43 62 48" stroke="#dd7943" strokeWidth="5" strokeLinecap="round" />
    <ellipse cx="235" cy="237" rx="119" ry="36" fill="#fff4d7" />
    <path d="M133 233c0-13 10-26 26-27 2-19 20-27 35-20 10-22 37-26 53-9 19-10 39 0 43 17 24-6 43 10 43 31 16-1 22 10 20 18-68 30-167 26-220-10Z" fill="#fffdf3" />
    <g stroke="#dfd7b8" strokeWidth="3" strokeLinecap="round"><path d="m166 226 7-3m18-19 6 3m22 24 7-2m-25 16 7 1m35-44 6 3m24 22 6-1m23-11 5 3m-16 26 6-2m-41-25 6-1" /></g>
    <ellipse cx="240" cy="220" rx="22" ry="17" fill="#be513a" />
    <path d="M231 214c4-5 9-5 12-4" stroke="#e79373" strokeWidth="4" strokeLinecap="round" />
    <path d="M200 361h69l-6 14h-57Z" fill="#9b4124" />
    <ellipse cx="405" cy="294" rx="52" ry="18" fill="#534c37" />
    <path d="M354 293c4 34 19 53 50 53s47-19 53-53" fill="#66684b" />
    <ellipse cx="405" cy="292" rx="44" ry="13" fill="#b58045" />
    <path d="m392 287 10 3m13-4 10 3" stroke="#e5d4a6" strokeWidth="6" />
    <path d="m391 304 9-8 10 5" stroke="#556744" strokeWidth="4" />
    <path d="m340 175 116-56m-111 65 116-52" stroke="#896640" strokeWidth="7" strokeLinecap="round" />
    <g stroke="#8b9276" strokeWidth="3" strokeLinecap="round"><path d="M200 155c-13-16 11-25 0-43m35 36c-13-16 11-25 0-43m35 50c-13-16 11-25 0-43" /></g>
    <path d="m83 184 7-14 7 14-7 14ZM429 203l5-10 5 10-5 10Z" fill="#d79043" />
    <circle cx="119" cy="115" r="5" fill="#9ba583" />
    <path d="M99 388c53 10 91 13 135 11" stroke="#dfd6c2" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}
