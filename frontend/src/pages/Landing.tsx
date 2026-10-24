import { useEffect, useState } from "react";
import { BadgeCheck, FileCheck2, Network, Upload } from "lucide-react";
import { getJson, type S } from "../api/client";
import HeroSection from "../components/landing/HeroSection";
import MetricsDock from "../components/landing/MetricsDock";
import RoleCards from "../components/landing/RoleCards";
import { GOLD_TEXT, spotlight } from "../components/landing/styles";

const STEPS = [
  [Upload, "Institutions upload", "Student-level records keyed by APAAR ID, through the portal or their ERP."],
  [BadgeCheck, "Every row is validated", "APAAR registry match, duplicates, dates and seats against AICTE-approved intake."],
  [Network, "AICTE monitors", "Excess admissions, cross-institution duplicates and anomalies, ranked for inspection."],
  [FileCheck2, "Credentials, with consent", "W3C verifiable credentials that students share only when they approve."],
] as const;

export default function Landing({ section }: { section?: string | null }) {
  const [stats, setStats] = useState<S["PublicStats"] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { getJson<S["PublicStats"]>("/v1/public/stats").then(setStats).catch(() => setFailed(true)); }, []);
  useEffect(() => {
    if (section) setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, [section]);

  return (
    <div className="space-y-20">
      <div>
        <HeroSection stats={stats} failed={failed} />
        <MetricsDock stats={stats} />
      </div>
      <RoleCards />
      <section id="how" aria-labelledby="how-heading" className="scroll-mt-28 pb-6">
        <h2 id="how-heading" className="font-inter text-[28px] font-bold tracking-[-0.02em] text-white">How it <span className={GOLD_TEXT}>works</span></h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map(([Icon, title, body], i) => (
            <li key={title} onMouseMove={spotlight} className="glass-premium lift relative rounded-2xl p-6">
              <span className="flex items-center gap-3">
                <span className="font-mono text-[13px] tracking-[0.18em] text-amber-400">0{i + 1}</span>
                <Icon className="h-5 w-5 text-amber-400" strokeWidth={1.6} aria-hidden />
              </span>
              <span className="mt-4 block text-[16px] font-semibold text-white">{title}</span>
              <span className="mt-1.5 block text-sm leading-relaxed text-slate-400">{body}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
