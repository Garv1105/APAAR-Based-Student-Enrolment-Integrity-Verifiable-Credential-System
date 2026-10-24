import { ArrowRight, PlayCircle } from "lucide-react";
import type { S } from "../../api/client";
import MapConstellation from "./MapConstellation";
import TrustBar from "./TrustBar";
import { BTN_PRIMARY, BTN_SECONDARY, GOLD_TEXT, fmt } from "./styles";

// Optional background: drop the image at src/assets/hero-bg.webp. Without it the build still works (empty glob).
const HERO_BG = Object.values(import.meta.glob("../../assets/hero-bg.webp", { eager: true, query: "?url", import: "default" }))[0] as
  | string | undefined;

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export default function HeroSection({ stats, failed }: { stats: S["PublicStats"] | null; failed: boolean }) {
  const values = stats ? Object.fromEntries(stats.states.filter((s) => s.reporting > 0).map((s) => [s.state, s.students ?? null])) : undefined;
  const badges = stats ? [
    { lon: 77.21, lat: 28.61, title: `${fmt(stats.institutions_reporting)} Institutions Connected`, sub: "Reporting this academic year" },
    { lon: 72.88, lat: 19.08, title: `${stats.states_covered} States`, sub: "Unified Academic Network", side: "left" as const },
    { lon: 77.59, lat: 12.97, title: "Real-time", sub: "Verification & Monitoring" },
    { lon: 88.36, lat: 22.57, title: `${fmt(stats.students_recorded)} Students`, sub: "Each keyed by APAAR ID" },
  ] : [];

  return (
    <section className="relative isolate -mx-5 -mt-6 overflow-hidden px-5 pb-28 pt-10 sm:-mx-8 sm:px-8 lg:pb-36 lg:pt-16">
      {/* background: optional image on the right, darkened toward the copy for contrast */}
      <div aria-hidden className="absolute inset-0 -z-10">
        {HERO_BG && (<>
          <img src={HERO_BG} alt="" className="h-full w-full object-cover object-right" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#07090E] via-[#07090E]/80 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#07090E] to-transparent" />
        </>)}
        <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_85%_20%,rgba(212,175,55,0.14),transparent_65%)]" />
      </div>

      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <p className="inline-flex items-center gap-3 rounded-full border border-amber-300/20 bg-white/[0.03] px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-amber-300/80">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-300/80" />A trusted academic ecosystem for a stronger India
          </p>
          <h1 className="mt-7 font-inter text-[38px] font-extrabold leading-[1.06] tracking-[-0.03em] text-white sm:text-[50px] xl:text-[56px]">
            Verified Education<br /><span className={GOLD_TEXT}>for a Stronger, Fairer India.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300">
            VidyaPramaan gives AICTE student-level, APAAR-keyed records from every approved institution: each row validated, every seat
            checked against approved intake, and credentials that students share only when they choose to.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => scrollTo("roles")} className={`${BTN_PRIMARY} group`}>
              Explore the Platform <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </button>
            <button type="button" onClick={() => scrollTo("how")} className={BTN_SECONDARY}>
              <PlayCircle className="h-5 w-5" aria-hidden />See How it Works
            </button>
          </div>
          <div className="mt-10"><TrustBar /></div>
        </div>

        <MapConstellation values={values} badges={badges} hubLabel={false}
          caption={stats ? `States shaded by students recorded, ${stats.academic_year}. Hover a state for its count.`
            : failed ? "Live figures are unavailable right now." : "Loading live figures…"} />
      </div>
    </section>
  );
}
