import { useId, useRef, useState } from "react";
import { INDIA_PATH, INDIA_VIEWBOX, STATE_PATHS, project } from "../indiaGeo";
import { useReducedMotion } from "../motion";

export type StateStat = { state: string; institutions: number; reporting: number; students: number | null };
export interface MapBadge { lon: number; lat: number; title: string; sub: string; side?: "left" | "right" }

/** [name, lon, lat, tier]  tier 1 = metro (brightest), 3 = city */
const CITIES: [string, number, number, 1 | 2 | 3][] = [
  ["New Delhi", 77.21, 28.61, 1], ["Mumbai", 72.88, 19.08, 1], ["Bengaluru", 77.59, 12.97, 1], ["Chennai", 80.27, 13.08, 1],
  ["Kolkata", 88.36, 22.57, 1], ["Hyderabad", 78.49, 17.39, 1], ["Ahmedabad", 72.57, 23.02, 2], ["Pune", 73.86, 18.52, 2],
  ["Jaipur", 75.79, 26.91, 2], ["Lucknow", 80.95, 26.85, 2], ["Bhopal", 77.41, 23.26, 2], ["Patna", 85.14, 25.59, 2],
  ["Bhubaneswar", 85.82, 20.3, 2], ["Guwahati", 91.75, 26.14, 2], ["Chandigarh", 76.78, 30.73, 2], ["Thiruvananthapuram", 76.94, 8.52, 2],
  ["Nagpur", 79.09, 21.15, 2], ["Indore", 75.86, 22.72, 3], ["Kochi", 76.27, 9.93, 3], ["Visakhapatnam", 83.22, 17.69, 3],
  ["Raipur", 81.63, 21.25, 3], ["Ranchi", 85.31, 23.34, 3], ["Srinagar", 74.8, 34.08, 3], ["Coimbatore", 76.96, 11.0, 3],
  ["Madurai", 78.12, 9.93, 3], ["Varanasi", 82.99, 25.32, 3], ["Dehradun", 78.03, 30.32, 3], ["Surat", 72.83, 21.17, 3],
  ["Vijayawada", 80.65, 16.51, 3], ["Kanpur", 80.33, 26.45, 3],
];
const ROUTES = [1, 2, 3, 4, 5, 6, 11, 12, 13, 15]; // cities with a route to New Delhi
const DEPTH = 14;                                 // extrusion layers (slab thickness)
const PAD = { x: 40, top: 30, bottom: 40 };
const W = INDIA_VIEWBOX.w, H = INDIA_VIEWBOX.h;
const VB = { x: -PAD.x, y: -PAD.top, w: W + 2 * PAD.x, h: H + PAD.top + PAD.bottom };

const LOW = [64, 46, 14], HIGH = [250, 204, 82], NONE = "#17130c";
const ramp = (t: number) => `rgb(${LOW.map((l, i) => Math.round(l + (HIGH[i] - l) * t)).join(",")})`;
const pos = (lon: number, lat: number) => {
  const [x, y] = project(lon, lat);
  return { left: `${((x - VB.x) / VB.w) * 100}%`, top: `${((y - VB.y) / VB.h) * 100}%` };
};
const arc = ([x, y]: [number, number], [hx, hy]: [number, number]) => {
  const dx = hx - x, dy = hy - y, len = Math.hypot(dx, dy) || 1, bend = Math.min(70, len * 0.3);
  return `M${x.toFixed(1)} ${y.toFixed(1)} Q${((x + hx) / 2 - (dy / len) * bend).toFixed(1)} ${((y + hy) / 2 + (dx / len) * bend).toFixed(1)} ${hx.toFixed(1)} ${hy.toFixed(1)}`;
};

function PulseDot() {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.9)]" />
    </span>
  );
}

/** A raised, lit 3D map of India: states shaded by students recorded (gold ramp), city lights, routes to New Delhi,
 *  glass badges pinned to cities, and a hover card per state. Every animation stops with reduced motion. */
export default function IndiaMap3D({ states, badges }: { states: StateStat[]; badges: MapBadge[] }) {
  const u = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const outer = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);

  const by = new Map(states.map((s) => [s.state, s]));
  const max = Math.max(1, ...states.map((s) => s.students ?? 0));
  const shade = (name: string) => {
    const s = by.get(name);
    if (!s || !s.reporting) return NONE;
    return ramp(Math.sqrt((s.students ?? 5) / max));  // null = fewer than 10: the faint end of the ramp
  };
  const pts = CITIES.map(([, lon, lat]) => project(lon, lat));
  const hub = pts[0];
  const move = (name: string) => (e: React.MouseEvent) => {
    const r = outer.current!.getBoundingClientRect();
    setHover({ name, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const h = hover ? by.get(hover.name) : undefined;
  const summary = states.filter((s) => s.reporting).map((s) => `${s.state}: ${s.students == null ? "fewer than 10" : s.students.toLocaleString("en-IN")} students`).join("; ");

  return (
    <div ref={outer} className="relative" onMouseLeave={() => setHover(null)}>
      <div className={reduce ? "" : "map-float"} style={{ transform: "perspective(1800px) rotateX(18deg) rotateZ(-1.5deg)", transformOrigin: "50% 60%" }}>
        <svg viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} className="h-auto w-full overflow-visible" role="img"
          aria-label={`Map of India, states shaded by students recorded. ${summary || "No data yet."}`}>
          <defs>
            <clipPath id={`land-${u}`}><path d={INDIA_PATH} /></clipPath>
            <linearGradient id={`side-${u}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6b4e16" /><stop offset="100%" stopColor="#120c04" />
            </linearGradient>
            <linearGradient id={`edge-${u}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFF1C2" /><stop offset="50%" stopColor="#F5C067" /><stop offset="100%" stopColor="#B8862A" />
            </linearGradient>
            <radialGradient id={`sheen-${u}`} cx="22%" cy="12%" r="75%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" /><stop offset="45%" stopColor="#ffffff" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.25" />
            </radialGradient>
            <radialGradient id={`glow-${u}`}>
              <stop offset="0%" stopColor="#FFF4D0" stopOpacity="1" /><stop offset="35%" stopColor="#F5C067" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#F5C067" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`route-${u}`} gradientUnits="userSpaceOnUse" x1="0" y1={H} x2="0" y2="0">
              <stop offset="0%" stopColor="#F5C067" stopOpacity="0.15" /><stop offset="100%" stopColor="#FFF1C2" stopOpacity="0.9" />
            </linearGradient>
            <filter id={`blur-${u}`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14" /></filter>
            <filter id={`soft-${u}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
          </defs>

          {/* cast shadow + gold halo under the slab */}
          <path d={INDIA_PATH} transform={`translate(0 ${DEPTH * 1.4 + 18})`} fill="#000" opacity="0.65" filter={`url(#blur-${u})`} />
          <path d={INDIA_PATH} fill="#D4AF37" opacity="0.10" filter={`url(#blur-${u})`} />

          {/* extrusion: stacked copies give the land its thickness */}
          <g pointerEvents="none">
            {Array.from({ length: DEPTH }, (_, i) => DEPTH - i).map((i) => (
              <path key={i} d={INDIA_PATH} transform={`translate(0 ${i * 1.4})`} fill={i === DEPTH ? "#0b0703" : `url(#side-${u})`} />
            ))}
          </g>

          {/* top surface: states on the gold ramp */}
          <path d={INDIA_PATH} fill={NONE} />
          {STATE_PATHS.map((s) => (
            <path key={s.name} d={s.d} fill={shade(s.name)} stroke={hover?.name === s.name ? "#FFF1C2" : "rgba(255,226,150,0.30)"}
              strokeWidth={hover?.name === s.name ? 1.6 : 0.7} strokeLinejoin="round"
              style={{ filter: hover?.name === s.name ? "brightness(1.25)" : undefined, transition: "filter 150ms, stroke 150ms" }}
              onMouseMove={move(s.name)} className="cursor-default" />
          ))}

          {/* light: sheen from the top-left, glowing coastline */}
          <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} fill={`url(#sheen-${u})`} clipPath={`url(#land-${u})`} pointerEvents="none" />
          <path d={INDIA_PATH} fill="none" stroke="#F5C067" strokeOpacity="0.55" strokeWidth="4" filter={`url(#soft-${u})`} pointerEvents="none" />
          <path d={INDIA_PATH} fill="none" stroke={`url(#edge-${u})`} strokeWidth="1.4" strokeLinejoin="round" pointerEvents="none" />

          {/* routes to New Delhi + travelling signals */}
          <g pointerEvents="none">
            {ROUTES.map((ci, i) => (
              <g key={ci}>
                <path id={`r-${u}-${i}`} d={arc(pts[ci], hub)} fill="none" stroke="#F5C067" strokeOpacity="0.18" strokeWidth="0.8" />
                <path d={arc(pts[ci], hub)} fill="none" stroke={`url(#route-${u})`} strokeWidth="1.1" strokeLinecap="round"
                  className={reduce ? "" : "arc-flow"} style={{ animationDuration: `${2.6 + (i % 4) * 0.5}s` }} />
              </g>
            ))}
            {!reduce && ROUTES.map((_, i) => (
              <circle key={i} r="2.2" fill="#FFF8E1">
                <animateMotion dur={`${4.5 + (i % 3) * 1.2}s`} begin={`-${i * 0.8}s`} repeatCount="indefinite" calcMode="spline"
                  keyPoints="0;1" keyTimes="0;1" keySplines=".45 0 .35 1"><mpath href={`#r-${u}-${i}`} /></animateMotion>
              </circle>
            ))}
            {/* city lights */}
            {pts.map(([x, y], i) => {
              const tier = CITIES[i][3], r = tier === 1 ? 2.6 : tier === 2 ? 1.8 : 1.3;
              return (
                <g key={CITIES[i][0]} className={reduce ? "" : "city"}
                  style={{ ["--t" as string]: `${3 + (i % 5) * 0.7}s`, ["--dl" as string]: `-${(i * 0.37) % 4}s`, ["--lo" as string]: tier === 1 ? ".75" : ".45" }}>
                  <circle cx={x} cy={y} r={r * 5.5} fill={`url(#glow-${u})`} opacity={tier === 1 ? 0.95 : 0.6} />
                  <circle cx={x} cy={y} r={r} fill="#FFF8E1" />
                </g>
              );
            })}
            {/* New Delhi hub */}
            <circle cx={hub[0]} cy={hub[1]} r="30" fill={`url(#glow-${u})`} opacity="0.6" />
            {!reduce && <>
              <circle cx={hub[0]} cy={hub[1]} r="7" fill="none" stroke="#FDE68A" strokeWidth="1" className="hub-pulse" />
              <circle cx={hub[0]} cy={hub[1]} r="7" fill="none" stroke="#FDE68A" strokeWidth="1" className="hub-pulse" style={{ animationDelay: "1.6s" }} />
            </>}
            <circle cx={hub[0]} cy={hub[1]} r="4.5" fill="#07090E" stroke="#FDE68A" strokeWidth="1.5" />
          </g>
        </svg>

        {/* glass badges, on the same tilted plane so they stay on their cities */}
        {badges.map((b) => (
          <div key={b.title} style={pos(b.lon, b.lat)}
            className={`pointer-events-none absolute hidden -translate-y-1/2 items-center gap-2 sm:flex ${b.side === "left" ? "-translate-x-full flex-row-reverse" : ""}`}>
            <PulseDot />
            <span aria-hidden className="h-px w-5 bg-gradient-to-r from-amber-300/80 to-amber-300/0" />
            <div className="glass-premium whitespace-nowrap rounded-lg px-3 py-2 text-xs text-slate-200">
              <p className="font-semibold text-white">{b.title}</p>
              <p className="text-slate-300">{b.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* hover card */}
      {hover && (
        <div role="status" className="glass-premium pointer-events-none absolute z-20 w-56 rounded-xl px-4 py-3 text-sm"
          style={{ left: Math.min(hover.x + 16, (outer.current?.clientWidth ?? 600) - 236), top: hover.y + 16 }}>
          <p className="font-semibold text-white">{hover.name}</p>
          {h && h.reporting ? (<>
            <p className="mt-1 text-amber-200">{h.students == null ? "Fewer than 10 students" : `${h.students.toLocaleString("en-IN")} students recorded`}</p>
            <p className="text-slate-300">{h.reporting} of {h.institutions} approved colleges reporting</p>
          </>) : <p className="mt-1 text-slate-400">No reporting colleges yet</p>}
        </div>
      )}

      {/* legend */}
      <div className="mx-auto mt-4 flex max-w-sm items-center gap-3 text-[11.5px] text-slate-400">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: NONE, boxShadow: "inset 0 0 0 1px rgba(255,226,150,.3)" }} />No data</span>
        <span>Fewer</span>
        <span className="h-2 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${ramp(0)}, ${ramp(0.5)}, ${ramp(1)})` }} />
        <span>More students</span>
      </div>
    </div>
  );
}
