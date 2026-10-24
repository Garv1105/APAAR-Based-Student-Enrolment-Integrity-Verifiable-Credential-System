import { useEffect, useId, useRef } from "react";
import { INDIA_PATH, INDIA_VIEWBOX, STATE_PATHS, project } from "./indiaGeo";
import { useReducedMotion } from "./motion";

/**
 * Landing illustration of India (DataMeet boundaries, CC BY 4.0): lit land with state borders, city lights,
 * routes to New Delhi with travelling signals, a scanning light and a slight 3D tilt that follows the mouse.
 * Purely illustrative, no data. Every animation stops when the user prefers reduced motion.
 */

// [lon, lat, tier]  tier 1 = metro, 2 = large city, 3 = city
const CITIES: [number, number, 1 | 2 | 3][] = [
  [72.88, 19.08, 1], [77.59, 12.97, 1], [80.27, 13.08, 1], [88.36, 22.57, 1], [78.49, 17.39, 1], [72.57, 23.02, 1], [73.86, 18.52, 1],
  [75.79, 26.91, 2], [80.95, 26.85, 2], [77.41, 23.26, 2], [85.14, 25.59, 2], [85.82, 20.3, 2], [91.75, 26.14, 2], [76.78, 30.73, 2],
  [76.94, 8.52, 2], [76.27, 9.93, 2], [83.22, 17.69, 2], [79.09, 21.15, 2], [81.63, 21.25, 2], [85.31, 23.34, 2], [74.8, 34.08, 2],
  [75.86, 22.72, 2], [80.33, 26.45, 2], [82.99, 25.32, 3], [78.01, 27.18, 3], [77.7, 29.0, 3], [78.03, 30.32, 3], [77.17, 31.1, 3],
  [74.87, 31.63, 3], [73.02, 26.24, 3], [73.71, 24.58, 3], [70.8, 22.3, 3], [72.83, 21.17, 3], [73.83, 15.49, 3], [74.86, 12.91, 3],
  [76.96, 11.0, 3], [78.12, 9.93, 3], [79.83, 11.93, 3], [80.65, 16.51, 3], [79.58, 17.97, 3], [86.98, 23.68, 3], [93.94, 24.81, 3],
  [94.1, 25.67, 3], [91.28, 23.83, 3], [92.72, 23.73, 3], [88.6, 27.33, 3], [77.58, 34.16, 3], [92.73, 11.62, 3],
];
const ROUTES = [0, 1, 2, 3, 4, 5, 12, 14, 20, 11]; // indices of cities with a visible route to New Delhi
const HUB = project(77.21, 28.61);

const arc = ([x, y]: [number, number]) => {
  const [hx, hy] = HUB;
  const dx = hx - x, dy = hy - y, len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(80, len * 0.32);
  const cx = (x + hx) / 2 - (dy / len) * bend, cy = (y + hy) / 2 + (dx / len) * bend;
  return `M${x.toFixed(1)} ${y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${hx.toFixed(1)} ${hy.toFixed(1)}`;
};

/** Tilts its child a few degrees toward the mouse (eased with rAF). */
function useTilt(disabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (disabled) return;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const onMove = (e: MouseEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const tick = () => {
      x += (tx - x) * 0.06; y += (ty - y) * 0.06;
      if (ref.current) ref.current.style.transform = `perspective(1400px) rotateX(${(8 - y * 5).toFixed(2)}deg) rotateY(${(x * 7).toFixed(2)}deg)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(tick);
    return () => { window.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf); };
  }, [disabled]);
  return ref;
}

const PALETTE = {
  blue: { land: ["#2a48b8", "#1a2c78", "#0b1236"], edge: ["#a9c1ff", "#7d93ff", "#a48bff"], route: ["#7aa2ff", "#d6e0ff"], scan: "#9db4ff",
    dot: "#b9caff", glow: ["#cfdbff", "#7d9bff"], halo: "#2c4fc9", state: "#9fb4ff", base: "#8ea8ff", city: "#eef3ff", hub: "#b9caff",
    core: ["#060a1c", "#e3eaff"], label: "#c9d6ff" },
  gold: { land: ["#4a360a", "#241a06", "#0b0803"], edge: ["#FBE7A1", "#D4AF37", "#B8892A"], route: ["#a07a1e", "#FBE7A1"], scan: "#E2BC4A",
    dot: "#E8C766", glow: ["#FFF1C2", "#D4AF37"], halo: "#8a6a14", state: "#D4AF37", base: "#C9A23A", city: "#FFF6DA", hub: "#E8C766",
    core: ["#0B0F14", "#FBE7A1"], label: "#E8D9A8" },
};

export default function IndiaMap({ className = "", tone = "blue" }: { className?: string; tone?: keyof typeof PALETTE }) {
  const p = PALETTE[tone];
  const u = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const tilt = useTilt(reduce);
  const pts = CITIES.map(([lon, lat]) => project(lon, lat));
  const { w: W, h: H } = INDIA_VIEWBOX;

  return (
    <div ref={tilt} className={`will-change-transform ${className}`} style={{ transform: "perspective(1400px) rotateX(8deg)" }}>
      <svg viewBox={`-30 -30 ${W + 60} ${H + 60}`} className="h-auto w-full overflow-visible" aria-hidden="true">
        <defs>
          <clipPath id={`clip-${u}`}><path d={INDIA_PATH} /></clipPath>
          <radialGradient id={`land-${u}`} cx="32%" cy="22%" r="85%">
            <stop offset="0%" stopColor={p.land[0]} stopOpacity="0.5" />
            <stop offset="45%" stopColor={p.land[1]} stopOpacity="0.45" />
            <stop offset="100%" stopColor={p.land[2]} stopOpacity="0.55" />
          </radialGradient>
          <linearGradient id={`edge-${u}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={p.edge[0]} />
            <stop offset="55%" stopColor={p.edge[1]} />
            <stop offset="100%" stopColor={p.edge[2]} />
          </linearGradient>
          <linearGradient id={`route-${u}`} gradientUnits="userSpaceOnUse" x1="0" y1={H} x2="0" y2="0">
            <stop offset="0%" stopColor={p.route[0]} stopOpacity="0.15" />
            <stop offset="100%" stopColor={p.route[1]} stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id={`scan-${u}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={p.scan} stopOpacity="0" />
            <stop offset="50%" stopColor={p.scan} stopOpacity="0.16" />
            <stop offset="100%" stopColor={p.scan} stopOpacity="0" />
          </linearGradient>
          <pattern id={`dots-${u}`} width="5" height="5" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.6" fill={p.dot} opacity="0.28" />
          </pattern>
          <radialGradient id={`glow-${u}`}>
            <stop offset="0%" stopColor={p.glow[0]} stopOpacity="0.9" />
            <stop offset="35%" stopColor={p.glow[1]} stopOpacity="0.35" />
            <stop offset="100%" stopColor={p.glow[1]} stopOpacity="0" />
          </radialGradient>
          <filter id={`halo-${u}`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14" /></filter>
          <filter id={`soft-${u}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" /></filter>
        </defs>

        {/* halo + lit land */}
        <path d={INDIA_PATH} fill={p.halo} opacity="0.26" filter={`url(#halo-${u})`} />
        <path d={INDIA_PATH} fill={`url(#land-${u})`} />
        <path d={INDIA_PATH} fill={`url(#dots-${u})`} />

        {/* state borders, then a scanning light, clipped to the land */}
        <g clipPath={`url(#clip-${u})`}>
          {STATE_PATHS.map((s) => <path key={s.name} d={s.d} fill="none" stroke={p.state} strokeOpacity="0.2" strokeWidth="0.6" strokeLinejoin="round" />)}
          {!reduce && <rect className="scan" x="0" y="0" width={W} height={H * 0.35} fill={`url(#scan-${u})`} />}
        </g>
        <path d={INDIA_PATH} fill="none" stroke={`url(#edge-${u})`} strokeWidth="1.1" strokeLinejoin="round" />
        <path d={INDIA_PATH} fill="none" stroke={p.label} strokeOpacity="0.35" strokeWidth="3" strokeLinejoin="round" filter={`url(#soft-${u})`} />

        {/* routes to New Delhi: a faint base line plus a flowing dash, and travelling signals */}
        {ROUTES.map((ci, i) => (
          <g key={ci}>
            <path id={`r-${u}-${i}`} d={arc(pts[ci])} fill="none" stroke={p.base} strokeOpacity="0.22" strokeWidth="0.8" />
            <path d={arc(pts[ci])} fill="none" stroke={`url(#route-${u})`} strokeWidth="1" strokeLinecap="round"
              className={reduce ? "" : "arc-flow"} style={{ animationDuration: `${2.6 + (i % 4) * 0.5}s` }} />
          </g>
        ))}
        {!reduce && ROUTES.map((_, i) => (
          <circle key={i} r="2" fill="#ffffff">
            <animateMotion dur={`${4.5 + (i % 3) * 1.2}s`} begin={`-${i * 0.8}s`} repeatCount="indefinite" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines=".45 0 .35 1">
              <mpath href={`#r-${u}-${i}`} />
            </animateMotion>
          </circle>
        ))}

        {/* city lights */}
        {pts.map(([x, y], i) => {
          const tier = CITIES[i][2];
          const r = tier === 1 ? 2.4 : tier === 2 ? 1.7 : 1.2;
          return (
            <g key={i} className={reduce ? "" : "city"} style={{ ["--t" as string]: `${3 + (i % 5) * 0.7}s`, ["--dl" as string]: `-${(i * 0.37) % 4}s`, ["--lo" as string]: tier === 1 ? ".7" : ".4" }}>
              <circle cx={x} cy={y} r={r * 5} fill={`url(#glow-${u})`} opacity={tier === 1 ? 0.9 : 0.6} />
              <circle cx={x} cy={y} r={r} fill={p.city} />
            </g>
          );
        })}

        {/* hub: New Delhi */}
        <circle cx={HUB[0]} cy={HUB[1]} r="34" fill={`url(#glow-${u})`} opacity="0.7" />
        {!reduce && <>
          <circle cx={HUB[0]} cy={HUB[1]} r="7" fill="none" stroke={p.dot} strokeWidth="1" className="hub-pulse" />
          <circle cx={HUB[0]} cy={HUB[1]} r="7" fill="none" stroke={p.dot} strokeWidth="1" className="hub-pulse" style={{ animationDelay: "1.6s" }} />
        </>}
        <circle cx={HUB[0]} cy={HUB[1]} r="15" fill="none" stroke={p.dot} strokeOpacity="0.45" strokeWidth="0.8" strokeDasharray="2 4" className={reduce ? "" : "orbit"} />
        <circle cx={HUB[0]} cy={HUB[1]} r="4.6" fill={p.core[0]} stroke={p.core[1]} strokeWidth="1.5" />
        <circle cx={HUB[0]} cy={HUB[1]} r="1.8" fill="#ffffff" />
        <text x={HUB[0] + 20} y={HUB[1] - 14} fill={p.label} className="font-inter text-[11px] font-medium tracking-[0.12em]">NEW DELHI</text>
      </svg>
    </div>
  );
}
