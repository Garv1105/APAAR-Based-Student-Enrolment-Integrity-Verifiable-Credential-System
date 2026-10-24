import { Building2, FileCheck, MapPinned, Users } from "lucide-react";
import type { S } from "../../api/client";
import CountUp from "./CountUp";
import { GOLD_TEXT, fmt, spotlight } from "./styles";

/** Frosted glass dock of live national figures, floating over the bottom edge of the hero. */
export default function MetricsDock({ stats }: { stats: S["PublicStats"] | null }) {
  const items = [
    { icon: Building2, value: stats && <CountUp value={stats.institutions_reporting} />, label: "Institutions", sub: `reporting of ${stats ? fmt(stats.institutions_approved) : "…"} approved` },
    { icon: Users, value: stats && <CountUp value={stats.students_recorded} />, label: "Student records", sub: "keyed by APAAR ID" },
    { icon: MapPinned, value: stats && <CountUp value={stats.states_covered} />, label: "States connected", sub: "with a reporting institution" },
    { icon: FileCheck, value: stats && <CountUp value={stats.credentials_issued} />, label: "Credentials issued", sub: "W3C verifiable credentials" },
  ];
  return (
    <section id="data" aria-labelledby="dock-heading" className="relative z-10 -mt-20 scroll-mt-28 lg:-mt-24">
      <h2 id="dock-heading" className="mb-3 flex items-center justify-center gap-4 text-center text-[11px] font-medium uppercase tracking-[0.26em] text-amber-300/80">
        <span aria-hidden className="h-px w-12 bg-gradient-to-r from-transparent to-amber-400/60" />Empowering India's education ecosystem
        <span aria-hidden className="h-px w-12 bg-gradient-to-l from-transparent to-amber-400/60" />
      </h2>
      <div onMouseMove={spotlight} className="glass-premium relative grid grid-cols-1 gap-6 rounded-2xl p-7 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
        {items.map(({ icon: Icon, value, label, sub }, i) => (
          <div key={label} className={`flex items-center gap-4 ${i ? "lg:border-l lg:border-white/10 lg:pl-6" : ""}`}>
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-amber-300/20 to-amber-500/5 ring-1 ring-amber-300/25 shadow-[0_0_24px_-6px_rgba(245,192,103,0.6)]" aria-hidden>
              <Icon className="h-7 w-7 text-amber-300" strokeWidth={1.5} /></span>
            <div>
              <p className={`font-inter text-[32px] font-extrabold leading-none tabular-nums ${GOLD_TEXT}`}>
                {value || <span className="inline-block h-8 w-20 animate-pulse rounded bg-white/[0.06] align-middle" aria-label="loading" />}
              </p>
              <p className="mt-1.5 text-sm leading-snug text-slate-200">{label}<br /><span className="text-slate-400">{sub}</span></p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />Live from submitted records{stats ? `, academic year ${stats.academic_year}` : ""}
      </p>
    </section>
  );
}
