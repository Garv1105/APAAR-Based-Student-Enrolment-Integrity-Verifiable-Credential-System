import { useId } from "react";
import { INDIA_PATH, INDIA_VIEWBOX, project } from "./indiaGeo";

/**
 * Monochrome gold map of India for the AICTE dashboard. Only states that appear in the API data get a node;
 * nothing is drawn for states with no reporting institutions. Outline: DataMeet India composite boundary
 * (CC BY 4.0), simplified; see indiaGeo.ts.
 */

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

const px = ([lon, lat]: [number, number]) => project(lon, lat);
const W = INDIA_VIEWBOX.w, H = INDIA_VIEWBOX.h;

export interface MapState { state: string; filled: number; approved: number; excess: boolean }

export default function GoldIndiaMap({ states }: { states: MapState[] }) {
  const uid = useId().replace(/:/g, "");
  const placed = states.filter((s) => STATE_POS[s.state]);
  const max = Math.max(1, ...placed.map((s) => s.filled));
  const [hx, hy] = px(HUB);

  return (
    <svg viewBox={`-10 -10 ${W + 20} ${H + 20}`} className="h-auto w-full" role="img"
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

      <path d={INDIA_PATH} fill="#d4af37" fillOpacity="0.04" />
      <path d={INDIA_PATH} fill={`url(#dots-${uid})`} stroke="#d4af37" strokeOpacity="0.55" strokeWidth="0.9" strokeLinejoin="round" />

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
