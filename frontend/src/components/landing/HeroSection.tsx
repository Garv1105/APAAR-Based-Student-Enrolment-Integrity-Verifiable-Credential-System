import { ArrowRight, PlayCircle } from "lucide-react";
import type { S } from "../../api/client";
import IndiaMap3D from "./IndiaMap3D";
import TrustBar from "./TrustBar";
import { BTN_PRIMARY, BTN_SECONDARY, fmt } from "./styles";

// Optional background: drop the image at src/assets/hero-bg.webp. Without it the build still works (empty glob).
const HERO_BG = Object.values(import.meta.glob("../../assets/hero-bg.webp", { eager: true, query: "?url", import: "default" }))[0] as
  | string | undefined;

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export default function HeroSection({ stats, failed }: { stats: S["PublicStats"] | null; failed: boolean }) {
  const badges = stats ? [
    { lon: 77.21, lat: 28.61, title: `${fmt(stats.institutions_reporting)} Institutions Connected`, sub: "Reporting this academic year" },
    { lon: 72.88, lat: 19.08, title: `${stats.states_covered} States`, sub: "Unified Academic Network", side: "left" as const },
    { lon: 77.59, lat: 12.97, title: "Real-time", sub: "Verification & Monitoring" },
    { lon: 88.36, lat: 22.57, title: `${fmt(stats.students_recorded)} Students`, sub: "Each keyed by APAAR ID" },
  ] : [];

  return (
    <section className="relative isolate -mx-5 -mt-6 overflow-hidden px-5 pb-32 pt-10 sm:-mx-8 sm:px-8 lg:pb-40 lg:pt-14">
      <div aria-hidden className="absolute inset-0 -z-10">
        {HERO_BG && (<>
          <img src={HERO_BG} alt="" className="h-full w-full object-cover object-right" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#07090E] via-[#07090E]/80 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#07090E] to-transparent" />
        </>)}
        <div className="absolute right-[-5%] top-[5%] h-[620px] w-[620px] rounded-full bg-[radial-gradient(closest-side,rgba(245,192,103,0.20),transparent)] blur-2xl" />
        <div className="floor-grid absolute inset-x-[-20%] bottom-[-30%] h-[70%] opacity-70" />
      </div>

      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="rise">
          <p className="glass-premium inline-flex items-center gap-3 rounded-full px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-amber-300/90">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.9)]" />
            A trusted academic ecosystem for a stronger India
          </p>
          <h1 className="mt-7 font-inter text-[38px] font-extrabold leading-[1.05] tracking-[-0.035em] text-white sm:text-[50px] xl:text-[58px]">
            Verified Education<br /><span className="gold-shimmer">for a Stronger, Fairer India.</span>
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

        <figure className="rise relative" style={{ ["--d" as string]: "150ms" }}>
          <IndiaMap3D states={stats?.states ?? []} badges={badges} />
          <figcaption className="mt-2 text-center text-xs text-slate-500">
            {stats ? `States shaded by students recorded, ${stats.academic_year}. Hover a state for its numbers.`
              : failed ? "Live figures are unavailable right now." : "Loading live figures…"}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
