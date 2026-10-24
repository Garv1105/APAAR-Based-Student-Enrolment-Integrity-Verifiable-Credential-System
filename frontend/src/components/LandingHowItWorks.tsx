import React from "react";
import { CheckCircle2, Database, FileSpreadsheet, Lock } from "lucide-react";

const STEPS = [
  {
    step: "01",
    title: "Batch Upload & Ingestion",
    description: "Institutions upload and validate batch enrolment records formatted with verified APAAR identifiers.",
    icon: FileSpreadsheet,
  },
  {
    step: "02",
    title: "Dual Registry Check",
    description: "Every student record is cross-checked against AICTE approved intake quotas and APAAR identity registries (MOCK).",
    icon: Database,
  },
  {
    step: "03",
    title: "Cryptographic Sealing",
    description: "Valid admissions are sealed in a tamper-resistant hash-chained ledger anchored with periodic AICTE checkpoints.",
    icon: Lock,
  },
  {
    step: "04",
    title: "Consent & Verification",
    description: "Regulators monitor seat health in real time, while students consent to share signed credentials with employers.",
    icon: CheckCircle2,
  },
];

export default function LandingHowItWorks() {
  const spot = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <section id="how" className="relative z-10 mx-auto w-full max-w-[1440px] px-5 py-16 sm:px-8 sm:py-24">
      {/* Header */}
      <div className="max-w-2xl">
        <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.2em] text-[#d4af37]">
          VERIFIABLE ARCHITECTURE
        </p>
        <h2 className="mt-2.5 font-manrope text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] text-[#f5f5f5] sm:text-[40px]">
          How VidyaPramaan Works
        </h2>
        <p className="mt-3 font-inter text-[15.5px] leading-relaxed text-[#b3b9c2]">
          A 4-step cryptographic pipeline ensuring every academic seat matches AICTE approved quotas and student consent.
        </p>
      </div>

      {/* 4-Step Horizontal Timeline */}
      <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, idx) => (
          <div
            key={s.step}
            onMouseMove={spot}
            style={{ ["--d" as string]: `${idx * 100}ms` }}
            className="glass spotlight rise group relative flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#0c1219]/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#d4af37]/40 hover:shadow-[0_20px_40px_-15px_rgba(212,175,55,0.2)]"
          >
            {/* Top gold rule */}
            <div className="gold-rule mb-5 w-full" aria-hidden="true" />

            {/* Step Number & Icon */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-[13px] font-bold tracking-[0.18em] text-[#d4af37] tnum">
                {s.step}
              </span>
              <span className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-[#d4af37] transition-colors group-hover:border-[#d4af37]/30 group-hover:text-[#f7e08a]">
                <s.icon className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>

            {/* Title & Description */}
            <div className="mt-6">
              <h3 className="font-manrope text-[17px] font-bold tracking-tight text-[#f5f5f5] transition-colors group-hover:text-[#f7e08a]">
                {s.title}
              </h3>
              <p className="mt-2 font-inter text-[13.5px] leading-relaxed text-[#b3b9c2]">
                {s.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
