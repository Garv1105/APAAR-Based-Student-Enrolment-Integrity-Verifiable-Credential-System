import IndiaMap from "../IndiaMap";
import { INDIA_VIEWBOX, project } from "../indiaGeo";

export interface MapBadge { lon: number; lat: number; title: string; sub: string; side?: "left" | "right" }

/** Position of a lon/lat point as a percentage of the map box (IndiaMap draws with a 30-unit margin). */
const at = (lon: number, lat: number) => {
  const [x, y] = project(lon, lat);
  return { left: `${((x + 30) / (INDIA_VIEWBOX.w + 60)) * 100}%`, top: `${((y + 30) / (INDIA_VIEWBOX.h + 60)) * 100}%` };
};

function PulseDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
    </span>
  );
}

/** Golden India map with glass badges pinned to real places (live figures, not decoration). */
export default function MapConstellation({ values, badges, caption, hubLabel = true }: {
  values?: Record<string, number | null>; badges: MapBadge[]; caption: string; hubLabel?: boolean;
}) {
  return (
    <figure className="relative mx-auto w-full max-w-[640px]">
      <IndiaMap tone="gold" values={values} hubLabel={hubLabel} />
      {badges.map((b) => (
        <div key={b.title} style={at(b.lon, b.lat)}
          className={`absolute hidden -translate-y-1/2 items-center gap-2 sm:flex ${b.side === "left" ? "-translate-x-full flex-row-reverse" : ""}`}>
          <PulseDot />
          <div className="rounded-md border border-amber-400/30 bg-black/60 px-3 py-1.5 text-xs text-slate-200 shadow-lg backdrop-blur-md">
            <p className="font-semibold text-white">{b.title}</p>
            <p className="text-slate-300">{b.sub}</p>
          </div>
        </div>
      ))}
      <figcaption className="mt-2 text-center text-xs text-slate-500">{caption}</figcaption>
    </figure>
  );
}
