import { useId } from "react";

/**
 * Monochrome gold map of India for the AICTE dashboard. Only states that appear in the API data get a node;
 * nothing is drawn for states with no reporting institutions. The outline is a simplified silhouette
 * (equirectangular, ~80 points), meant as a locator, not a survey map.
 */

// [lon, lat] outline, clockwise from Kutch
const OUTLINE: [number, number][] = [
  [68.2, 23.7], [68.9, 22.9], [69.7, 22.8], [69.1, 22.4], [69.6, 21.6], [70.4, 20.9], [71.0, 20.75], [72.1, 21.3], [72.4, 22.2],
  [72.75, 21.1], [72.85, 20.4], [72.8, 19.0], [73.0, 18.0], [73.3, 17.0], [73.7, 15.9], [73.95, 15.2], [74.3, 14.4], [74.7, 13.3],
  [74.85, 12.8], [75.4, 11.9], [75.8, 11.2], [76.2, 9.95], [76.5, 9.0], [76.95, 8.45], [77.55, 8.08], [78.15, 8.8], [78.9, 9.3],
  [79.3, 9.35], [79.85, 10.3], [79.85, 11.5], [80.3, 13.1], [80.15, 14.2], [80.1, 15.4], [80.9, 15.8], [81.3, 16.3], [82.3, 16.6],
  [82.4, 17.0], [83.3, 17.7], [84.1, 18.3], [84.9, 19.2], [85.8, 19.8], [86.5, 20.2], [86.9, 20.8], [87.0, 21.5], [87.8, 21.7],
  [88.4, 21.6], [89.05, 21.7], [89.1, 22.3], [88.9, 23.0], [88.7, 23.7], [88.2, 24.3], [88.0, 24.7], [88.4, 25.2], [88.95, 25.25],
  [89.0, 25.9], [89.85, 26.0], [89.85, 25.3], [90.6, 25.15], [92.0, 25.15], [92.4, 24.9], [92.25, 24.2], [91.6, 24.1], [91.2, 23.7],
  [91.4, 22.95], [91.8, 23.1], [92.2, 23.4], [92.3, 22.6], [92.6, 21.95], [93.1, 22.2], [93.4, 23.0], [93.4, 23.7], [94.1, 23.9],
  [94.2, 24.5], [94.6, 25.3], [95.0, 25.9], [95.2, 26.6], [96.1, 27.2], [97.2, 27.1], [97.4, 28.2], [96.6, 28.4], [96.0, 29.4],
  [95.4, 29.0], [94.6, 29.3], [93.8, 28.7], [92.7, 27.95], [91.65, 27.8], [91.6, 26.85], [90.4, 26.9], [89.7, 26.75], [88.95, 26.9],
  [88.8, 27.3], [88.9, 27.9], [88.6, 28.1], [88.0, 27.85], [88.15, 27.0], [88.1, 26.45], [87.2, 26.4], [86.0, 26.65], [85.2, 26.85],
  [84.6, 27.3], [84.0, 27.45], [83.3, 27.4], [82.5, 27.65], [81.6, 28.0], [81.0, 28.4], [80.3, 28.6], [80.05, 28.95], [80.5, 29.6],
  [81.0, 30.25], [80.2, 30.75], [79.5, 31.0], [79.0, 31.3], [78.8, 32.1], [78.4, 32.6], [79.2, 32.6], [79.6, 33.2], [79.4, 34.0],
  [80.2, 35.3], [79.0, 35.8], [78.0, 35.5], [77.0, 35.6], [76.0, 36.2], [75.2, 36.9], [74.6, 37.05], [73.8, 36.9], [72.9, 36.8],
  [72.5, 36.2], [73.2, 35.5], [73.6, 34.8], [73.9, 34.2], [73.6, 33.6], [74.0, 33.0], [74.65, 32.45], [74.55, 31.9], [74.6, 31.1],
  [74.0, 30.6], [73.9, 30.0], [73.4, 29.95], [72.9, 29.3], [72.3, 28.65], [71.85, 27.9], [70.65, 27.75], [70.0, 27.2], [69.55, 26.75],
  [70.15, 26.2], [70.1, 25.6], [70.75, 25.25], [71.1, 24.65], [70.6, 24.35], [69.6, 24.3], [68.8, 24.3], [68.75, 23.9],
];
const ISLANDS: [number, number][] = [
  [92.7, 13.4], [92.85, 12.9], [92.75, 12.3], [92.7, 11.7], [92.6, 11.1], [92.5, 10.6], [93.5, 8.0], [93.8, 7.3], // Andaman & Nicobar
  [72.6, 11.2], [73.0, 10.6], [72.2, 11.6], [73.6, 8.3], // Lakshadweep, Minicoy
];

/** Administrative seats (approx.) used as node positions. */
export const STATE_POS: Record<string, [number, number]> = {
  "Andhra Pradesh": [80.5, 16.5], "Arunachal Pradesh": [93.6, 27.1], Assam: [91.75, 26.15], Bihar: [85.1, 25.6], Chhattisgarh: [81.6, 21.25],
  Delhi: [77.2, 28.6], Goa: [73.85, 15.5], Gujarat: [72.6, 23.2], Haryana: [76.8, 30.7], "Himachal Pradesh": [77.2, 31.1],
  Jharkhand: [85.3, 23.35], Karnataka: [77.6, 12.97], Kerala: [76.95, 8.5], "Madhya Pradesh": [77.4, 23.25], Maharashtra: [72.88, 19.08],
  Manipur: [93.95, 24.8], Meghalaya: [91.9, 25.57], Mizoram: [92.72, 23.73], Nagaland: [94.1, 25.67], Odisha: [85.82, 20.3],
  Punjab: [75.85, 30.9], Rajasthan: [75.8, 26.9], Sikkim: [88.6, 27.33], "Tamil Nadu": [80.27, 13.08], Telangana: [78.48, 17.38],
  Tripura: [91.28, 23.83], "Uttar Pradesh": [80.95, 26.85], Uttarakhand: [78.03, 30.32], "West Bengal": [88.36, 22.57],
  "Jammu and Kashmir": [74.8, 34.08], Ladakh: [77.58, 34.16], Puducherry: [79.83, 11.93], Chandigarh: [76.78, 30.73],
};
const HUB: [number, number] = [77.2, 28.6]; // AICTE, New Delhi

const K = 16;
const px = ([lon, lat]: [number, number]): [number, number] => [(lon - 67.5) * 0.93 * K, (37.6 - lat) * K];
const W = Math.round((97.8 - 67.5) * 0.93 * K), H = Math.round((37.6 - 6.4) * K);
const OUTLINE_D = "M" + OUTLINE.map((p) => px(p).map((v) => v.toFixed(1)).join(" ")).join(" L") + " Z";

export interface MapState { state: string; filled: number; approved: number; excess: boolean }

export default function GoldIndiaMap({ states }: { states: MapState[] }) {
  const uid = useId().replace(/:/g, "");
  const placed = states.filter((s) => STATE_POS[s.state]);
  const max = Math.max(1, ...placed.map((s) => s.filled));
  const [hx, hy] = px(HUB);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
      aria-label={`Map of India. States with reporting institutions: ${placed.map((s) => `${s.state}, ${s.filled} of ${s.approved} seats filled${s.excess ? ", excess admissions" : ""}`).join("; ") || "none"}.`}>
      <defs>
        <pattern id={`dots-${uid}`} width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.75" fill="#d4af37" opacity="0.22" />
        </pattern>
        <radialGradient id={`glow-${uid}`}>
          <stop offset="0%" stopColor="#d4af37" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
        </radialGradient>
      </defs>

      <path d={OUTLINE_D} fill={`url(#dots-${uid})`} stroke="#d4af37" strokeOpacity="0.55" strokeWidth="1" strokeLinejoin="round" />
      <path d={OUTLINE_D} fill="#d4af37" fillOpacity="0.035" />
      {ISLANDS.map((p, i) => { const [x, y] = px(p); return <circle key={i} cx={x} cy={y} r={1.6} fill="#d4af37" opacity={0.5} />; })}

      {/* arcs: each reporting state to AICTE, New Delhi */}
      {placed.map((s, i) => {
        const [x, y] = px(STATE_POS[s.state]);
        const mx = (x + hx) / 2, my = (y + hy) / 2;
        const dx = hx - x, dy = hy - y, len = Math.hypot(dx, dy) || 1;
        const bend = Math.min(60, len * 0.28);
        const cx = mx - (dy / len) * bend, cy = my + (dx / len) * bend;
        return (
          <path key={s.state} d={`M${x} ${y} Q${cx} ${cy} ${hx} ${hy}`} fill="none" stroke={s.excess ? "#e5534b" : "#f7e08a"}
            strokeOpacity="0.55" strokeWidth="1" pathLength={1} strokeDasharray="1"
            className="map-arc" style={{ animationDelay: `${i * 120}ms` }} />
        );
      })}

      {/* hub */}
      <circle cx={hx} cy={hy} r={18} fill={`url(#glow-${uid})`} />
      <circle cx={hx} cy={hy} r={5} fill="#0b0f14" stroke="#f7e08a" strokeWidth="1.5" />
      <circle cx={hx} cy={hy} r={1.8} fill="#f7e08a" />
      <text x={hx + 9} y={hy - 8} className="fill-[#f7e08a] text-[10px] font-medium tracking-wide">AICTE · New Delhi</text>

      {placed.map((s) => {
        const [x, y] = px(STATE_POS[s.state]);
        const r = 3.5 + 6 * Math.sqrt(s.filled / max);
        const left = x > W * 0.62;
        return (
          <g key={s.state}>
            <title>{`${s.state}: ${s.filled} of ${s.approved} seats filled${s.excess ? " · excess admissions" : ""}`}</title>
            <circle cx={x} cy={y} r={r + 6} fill={`url(#glow-${uid})`} />
            <circle cx={x} cy={y} r={r} fill="#d4af37" fillOpacity="0.9" stroke={s.excess ? "#e5534b" : "#f7e08a"} strokeWidth={s.excess ? 2 : 1} />
            <text x={left ? x - r - 6 : x + r + 6} y={y - 2} textAnchor={left ? "end" : "start"} className="fill-[#f5f5f5] text-[11px] font-medium">{s.state}</text>
            <text x={left ? x - r - 6 : x + r + 6} y={y + 11} textAnchor={left ? "end" : "start"} className="fill-[#9ca3af] text-[10px]">
              {s.filled.toLocaleString()} / {s.approved.toLocaleString()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
