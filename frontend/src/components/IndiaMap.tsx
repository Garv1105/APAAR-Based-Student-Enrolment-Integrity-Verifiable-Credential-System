import { useId } from "react";
import { INDIA_PATH, INDIA_VIEWBOX, project } from "./indiaGeo";
import { useReducedMotion } from "./motion";

/**
 * Landing illustration: India (DataMeet composite boundary, CC BY 4.0) with arcs from major cities to
 * New Delhi. Purely illustrative, no data. Motion: arcs draw once, a few signals travel slowly, the hub
 * pulses in place. All of it stops when the user prefers reduced motion.
 */
// Mumbai, Bengaluru, Chennai, Kolkata, Hyderabad, Ahmedabad, Guwahati, Bhopal, Thiruvananthapuram, Bhubaneswar, Srinagar
const CITIES: [number, number][] = [
  [72.88, 19.08], [77.59, 12.97], [80.27, 13.08], [88.36, 22.57], [78.49, 17.39], [72.57, 23.02], [91.75, 26.14],
  [77.41, 23.26], [76.94, 8.52], [85.82, 20.3], [74.8, 34.08],
];
const HUB = project(77.21, 28.61);

const arc = ([x, y]: [number, number]) => {
  const [hx, hy] = HUB;
  const dx = hx - x, dy = hy - y, len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(70, len * 0.3);
  const cx = (x + hx) / 2 - (dy / len) * bend, cy = (y + hy) / 2 + (dx / len) * bend;
  return `M${x.toFixed(1)} ${y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${hx.toFixed(1)} ${hy.toFixed(1)}`;
};

export default function IndiaMap({ className = "" }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const pts = CITIES.map(([lon, lat]) => project(lon, lat));

  return (
    <svg viewBox={`-20 -20 ${INDIA_VIEWBOX.w + 40} ${INDIA_VIEWBOX.h + 40}`} className={`h-auto w-full ${className}`} aria-hidden="true">
      <defs>
        <pattern id={`dot-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.7" fill="#8fb0ff" opacity="0.32" />
        </pattern>
        <linearGradient id={`edge-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7aa2ff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#9d8cff" stopOpacity="0.55" />
        </linearGradient>
        <radialGradient id={`halo-${uid}`}>
          <stop offset="0%" stopColor="#6f8dff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#6f8dff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`land-${uid}`} cx="45%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#3b6bff" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#3b6bff" stopOpacity="0.02" />
        </radialGradient>
      </defs>

      <path d={INDIA_PATH} fill={`url(#land-${uid})`} />
      <path d={INDIA_PATH} fill={`url(#dot-${uid})`} />
      <path d={INDIA_PATH} fill="none" stroke={`url(#edge-${uid})`} strokeWidth="0.9" strokeLinejoin="round" />

      {pts.map((p, i) => (
        <path key={i} id={`arc-${uid}-${i}`} d={arc(p)} fill="none" stroke="#9db4ff" strokeOpacity="0.4" strokeWidth="0.85"
          className="arc-fade" style={{ animationDelay: `${400 + i * 90}ms` }} />
      ))}

      {!reduce && pts.map((_, i) => i % 2 === 0 && (
        <circle key={i} r="1.6" fill="#dbe4ff" opacity="0.9">
          <animateMotion dur={`${6 + (i % 4)}s`} begin={`-${i * 0.9}s`} repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1"
            calcMode="spline" keySplines=".4 0 .2 1">
            <mpath href={`#arc-${uid}-${i}`} />
          </animateMotion>
        </circle>
      ))}

      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="6" fill={`url(#halo-${uid})`} />
          <circle cx={x} cy={y} r="1.9" fill="#c9d6ff" />
        </g>
      ))}

      <circle cx={HUB[0]} cy={HUB[1]} r="22" fill={`url(#halo-${uid})`} />
      {!reduce && <circle cx={HUB[0]} cy={HUB[1]} r="6" fill="none" stroke="#a9bcff" strokeWidth="1" className="hub-pulse" />}
      <circle cx={HUB[0]} cy={HUB[1]} r="4.2" fill="#050816" stroke="#c9d6ff" strokeWidth="1.4" />
      <circle cx={HUB[0]} cy={HUB[1]} r="1.6" fill="#ffffff" />
    </svg>
  );
}
