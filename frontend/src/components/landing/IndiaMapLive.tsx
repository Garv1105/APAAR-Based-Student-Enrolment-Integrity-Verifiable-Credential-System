import { useId, useMemo, useRef, useState } from "react";
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
  ["Vijayawada", 80.65, 16.51, 3], ["Kanpur", 80.33, 26.45, 3], ["Shillong", 91.88, 25.57, 3], ["Imphal", 93.94, 24.81, 3],
  ["Goa", 73.83, 15.49, 3], ["Mangaluru", 74.86, 12.91, 3], ["Jodhpur", 73.02, 26.24, 3], ["Udaipur", 73.71, 24.58, 3],
];
const ROUTES = Array.from({ length: 16 }, (_, i) => i + 1);  // metros and large cities send a live route to New Delhi
const PAD = 16;
const W = INDIA_VIEWBOX.w, H = INDIA_VIEWBOX.h;
const VB = { x: -PAD, y: -PAD, w: W + 2 * PAD, h: H + 2 * PAD };

// Fewer students = lighter (champagne), more = darker (deep amber). No reporting colleges = near-black.
const LIGHT = [252, 239, 199], DARK = [150, 86, 10], NONE = "#120f0a";
const ramp = (t: number) => `rgb(${LIGHT.map((l, i) => Math.round(l + (DARK[i] - l) * t)).join(",")})`;
const pct = (lon: number, lat: number) => {
  const [x, y] = project(lon, lat);
  return { left: `${((x - VB.x) / VB.w) * 100}%`, top: `${((y - VB.y) / VB.h) * 100}%` };
};
/** Gentle curve to the hub, always bowing south so routes stay over land (never across the northern border). */
const arc = ([x, y]: [number, number], [hx, hy]: [number, number]) => {
  const dx = hx - x, dy = hy - y, len = Math.hypot(dx, dy) || 1, bend = Math.min(60, len * 0.22);
  let nx = -dy / len, ny = dx / len;
  if (ny < 0) { nx = -nx; ny = -ny; }  // pick the perpendicular that points down (south) on screen
  return `M${x.toFixed(1)} ${y.toFixed(1)} Q${((x + hx) / 2 + nx * bend).toFixed(1)} ${((y + hy) / 2 + ny * bend).toFixed(1)} ${hx.toFixed(1)} ${hy.toFixed(1)}`;
};

function PulseDot() {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.9)]" />
    </span>
  );
}

/** Live 2D map of India: states shaded by students recorded (lighter = fewer, darker = more), a glowing web of city
 *  lights with live routes to New Delhi, glass badges on real cities and a glass hover card per state. */
export default function IndiaMapLive({ states, badges }: { states: StateStat[]; badges: MapBadge[] }) {
  const u = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const pts = useMemo(() => CITIES.map(([, lon, lat]) => project(lon, lat)), []);
  const web = useMemo(() => {  // each city to its two nearest neighbours: a constellation, not a hub-and-spoke
    const seen = new Set<string>(), out: [number, number][] = [];
    pts.forEach((p, i) => {
      pts.map((q, j) => [j, Math.hypot(p[0] - q[0], p[1] - q[1])] as const).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 2)
        .forEach(([j]) => { const k = i < j ? `${i}-${j}` : `${j}-${i}`; if (!seen.has(k)) { seen.add(k); out.push([i, j]); } });
    });
    return out;
  }, [pts]);

  const by = new Map(states.map((s) => [s.state, s]));
  const max = Math.max(1, ...states.map((s) => s.students ?? 0));
  const fill = (name: string) => {
    const s = by.get(name);
    return !s || !s.reporting ? NONE : ramp(Math.sqrt((s.students ?? 0) / max));
  };
  const hub = pts[0];
  const onMove = (name: string) => (e: React.MouseEvent) => {
    const r = box.current!.getBoundingClientRect();
    setHover({ name, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const h = hover ? by.get(hover.name) : undefined;
  const summary = states.filter((s) => s.reporting).map((s) => `${s.state}: ${s.students == null ? "fewer than 10" : s.students.toLocaleString("en-IN")} students`).join("; ");

  return (
    <div ref={box} className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} className="relative h-auto w-full overflow-visible" role="img"
        aria-label={`Map of India, states shaded by students recorded (lighter means fewer). ${summary || "No data yet."}`}>
        <defs>
          <clipPath id={`land-${u}`}><path d={INDIA_PATH} /></clipPath>
          <pattern id={`dots-${u}`} width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.7" fill="#F5C067" opacity="0.28" /></pattern>
          <radialGradient id={`glow-${u}`}>
            <stop offset="0%" stopColor="#FFF4D0" stopOpacity="1" /><stop offset="35%" stopColor="#F5B841" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#F5B841" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`edge-${u}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFF1C2" /><stop offset="55%" stopColor="#F5C067" /><stop offset="100%" stopColor="#C68A1E" />
          </linearGradient>
          <linearGradient id={`route-${u}`} gradientUnits="userSpaceOnUse" x1="0" y1={H} x2="0" y2="0">
            <stop offset="0%" stopColor="#F5B841" stopOpacity="0.25" /><stop offset="100%" stopColor="#FFF4D0" stopOpacity="1" />
          </linearGradient>
          <filter id={`halo-${u}`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16" /></filter>
          <filter id={`soft-${u}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" /></filter>
        </defs>

        {/* halo behind the land */}
        <path d={INDIA_PATH} fill="#D4AF37" opacity="0.16" filter={`url(#halo-${u})`} />

        {/* states: lighter = fewer students, darker = more */}
        {STATE_PATHS.map((s) => {
          const on = hover?.name === s.name;
          return (
            <path key={s.name} d={s.d} fill={fill(s.name)} fillOpacity={0.92} stroke={on ? "#FFF1C2" : "rgba(255,226,150,0.35)"}
              strokeWidth={on ? 2 : 0.7} strokeLinejoin="round" onMouseMove={onMove(s.name)}
              style={{ filter: on ? "drop-shadow(0 0 6px rgba(255,214,120,0.9))" : undefined, transition: "stroke-width 120ms" }} />
          );
        })}
        <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} fill={`url(#dots-${u})`} clipPath={`url(#land-${u})`} pointerEvents="none" />

        {/* glowing coastline */}
        <path d={INDIA_PATH} fill="none" stroke="#F5C067" strokeOpacity="0.6" strokeWidth="4.5" filter={`url(#soft-${u})`} pointerEvents="none" />
        <path d={INDIA_PATH} fill="none" stroke={`url(#edge-${u})`} strokeWidth="1.4" strokeLinejoin="round" pointerEvents="none" />

        <g pointerEvents="none">
          {/* constellation web: one thin solid line per link */}
          {web.map(([i, j]) => (
            <line key={`${i}-${j}`} x1={pts[i][0]} y1={pts[i][1]} x2={pts[j][0]} y2={pts[j][1]}
              stroke="#FFE7A8" strokeOpacity="0.4" strokeWidth="0.7" strokeLinecap="round" />
          ))}
          {/* live routes to New Delhi */}
          {ROUTES.map((ci, i) => (
            <path key={ci} id={`r-${u}-${i}`} d={arc(pts[ci], hub)} fill="none" stroke={`url(#route-${u})`} strokeWidth="1.3"
              strokeLinecap="round" />
          ))}
          {!reduce && ROUTES.map((_, i) => (
            <circle key={i} r="2.4" fill="#FFF8E1" style={{ filter: "drop-shadow(0 0 4px #F5B841)" }}>
              <animateMotion dur={`${4 + (i % 4) * 1.1}s`} begin={`-${i * 0.6}s`} repeatCount="indefinite" calcMode="spline"
                keyPoints="0;1" keyTimes="0;1" keySplines=".45 0 .35 1"><mpath href={`#r-${u}-${i}`} /></animateMotion>
            </circle>
          ))}
          {/* city lights */}
          {pts.map(([x, y], i) => {
            const tier = CITIES[i][3], r = tier === 1 ? 3 : tier === 2 ? 2.1 : 1.5;
            return (
              <g key={CITIES[i][0]} className={reduce ? "" : "city"}
                style={{ ["--t" as string]: `${2.6 + (i % 5) * 0.6}s`, ["--dl" as string]: `-${(i * 0.37) % 4}s`, ["--lo" as string]: tier === 1 ? ".8" : ".5" }}>
                <circle cx={x} cy={y} r={r * 6} fill={`url(#glow-${u})`} opacity={tier === 1 ? 1 : 0.7} />
                <circle cx={x} cy={y} r={r + 0.9} fill="#2a1a05" opacity="0.55" />
                <circle cx={x} cy={y} r={r} fill="#FFF8E1" />
              </g>
            );
          })}
          {/* New Delhi hub */}
          {!reduce && <>
            <circle cx={hub[0]} cy={hub[1]} r="8" fill="none" stroke="#FDE68A" strokeWidth="1.2" className="hub-pulse" />
            <circle cx={hub[0]} cy={hub[1]} r="8" fill="none" stroke="#FDE68A" strokeWidth="1.2" className="hub-pulse" style={{ animationDelay: "1.6s" }} />
          </>}
          <circle cx={hub[0]} cy={hub[1]} r="16" fill="none" stroke="#FDE68A" strokeOpacity="0.35" strokeWidth="0.9" />
          <circle cx={hub[0]} cy={hub[1]} r="5" fill="#07090E" stroke="#FDE68A" strokeWidth="1.8" />
        </g>
      </svg>

      {/* glass badges pinned to cities */}
      {badges.map((b) => (
        <div key={b.title} style={pct(b.lon, b.lat)}
          className={`pointer-events-none absolute hidden -translate-y-1/2 items-center gap-2 sm:flex ${b.side === "left" ? "-translate-x-full flex-row-reverse" : ""}`}>
          <PulseDot />
          <span aria-hidden className={`h-px w-5 ${b.side === "left" ? "bg-gradient-to-l" : "bg-gradient-to-r"} from-amber-300/80 to-amber-300/0`} />
          <div className="glass-premium relative whitespace-nowrap rounded-lg px-3 py-2 text-xs text-slate-200">
            <p className="font-semibold text-white">{b.title}</p>
            <p className="text-slate-300">{b.sub}</p>
          </div>
        </div>
      ))}

      {/* glass hover card */}
      {hover && (
        <div role="status" className="glass-premium pointer-events-none absolute z-30 w-60 rounded-xl px-4 py-3 text-sm"
          style={{ left: Math.max(8, Math.min(hover.x + 18, (box.current?.clientWidth ?? 600) - 248)), top: Math.max(8, hover.y - 96) }}>
          <p className="font-semibold text-white">{hover.name}</p>
          {h && h.reporting ? (<>
            <p className="mt-1 text-[15px] font-semibold text-amber-200">{h.students == null ? "Fewer than 10 students" : `${h.students.toLocaleString("en-IN")} students`}</p>
            <p className="text-slate-300">{h.reporting} of {h.institutions} approved colleges reporting</p>
          </>) : <p className="mt-1 text-slate-400">No reporting colleges yet</p>}
        </div>
      )}

      {/* legend */}
      <div className="mx-auto mt-3 flex max-w-sm items-center gap-3 text-[11.5px] text-slate-400">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: NONE, boxShadow: "inset 0 0 0 1px rgba(255,226,150,.35)" }} />No data</span>
        <span>Fewer</span>
        <span className="h-2 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${ramp(0)}, ${ramp(0.5)}, ${ramp(1)})` }} />
        <span>More students</span>
      </div>
    </div>
  );
}
