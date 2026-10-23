import { ArrowRight, FileText, GraduationCap, ShieldCheck, Users } from "lucide-react";

interface HeroProps {
  onOpenStudentModal?: () => void;
}

export default function Hero({ onOpenStudentModal }: HeroProps) {
  return (
    <section className="relative flex flex-col justify-between space-y-8 lg:space-y-10">
      {/* Top Section */}
      <div className="space-y-6">
        {/* Transparent Ecosystem Pill Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-[#0a1820]/70 px-3.5 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-300 backdrop-blur-md shadow-inner">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-black text-slate-950 shadow-sm">
            A
          </span>
          <span>Transparent Higher Education Ecosystem</span>
        </div>

        {/* Huge 3-line Headline */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[76px] xl:text-[84px] font-extrabold tracking-tight text-white leading-[1.04]">
          Every seat <br />
          builds a <br />
          fairer{" "}
          <span className="bg-gradient-to-r from-[#2563ff] via-[#38bdf8] to-[#60a5fa] bg-clip-text text-transparent">
            India.
          </span>
        </h1>

        {/* Subtitle Paragraph */}
        <p className="max-w-xl text-base sm:text-lg leading-relaxed text-[#9fb0d0] font-normal">
          APAAR Seat Integrity ensures transparent, tamper-proof and auditable
          student data across Indian higher education.
        </p>

        {/* Row of 3 Feature Badges */}
        <div className="flex flex-wrap items-center gap-4 pt-2 sm:gap-6">
          {/* Badge 1: Verified data */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-500/30 bg-blue-950/40 text-blue-400 shadow-[0_0_12px_rgba(37,99,255,0.25)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-bold text-white leading-tight">
                Verified data
              </div>
              <div className="text-[11px] text-[#9fb0d0] font-medium leading-tight mt-0.5">
                End-to-end traceability
              </div>
            </div>
          </div>

          {/* Badge 2: Student-centric */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-500/30 bg-blue-950/40 text-blue-400 shadow-[0_0_12px_rgba(37,99,255,0.25)]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-bold text-white leading-tight">
                Student-centric
              </div>
              <div className="text-[11px] text-[#9fb0d0] font-medium leading-tight mt-0.5">
                Consent-first design
              </div>
            </div>
          </div>

          {/* Badge 3: Tamper-evident */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-500/30 bg-blue-950/40 text-blue-400 shadow-[0_0_12px_rgba(37,99,255,0.25)]">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-bold text-white leading-tight">
                Tamper-evident
              </div>
              <div className="text-[11px] text-[#9fb0d0] font-medium leading-tight mt-0.5">
                Trusted &amp; auditable
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: CTA Card & Footer */}
      <div className="space-y-6 pt-4">
        {/* Glassmorphism CTA Card */}
        <div
          onClick={onOpenStudentModal}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (onOpenStudentModal) onOpenStudentModal();
            }
          }}
          className="group relative flex max-w-lg cursor-pointer items-center justify-between gap-4 rounded-2xl border border-blue-500/35 bg-[#0a142e]/75 p-4 backdrop-blur-xl shadow-[0_0_25px_rgba(37,99,255,0.2)] transition-all hover:border-blue-400/70 hover:bg-[#0e1b3d]/85 hover:shadow-[0_0_35px_rgba(37,99,255,0.35)]"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-blue-400/40 bg-gradient-to-tr from-blue-700/50 to-indigo-600/40 text-blue-300 shadow-[0_0_15px_rgba(37,99,255,0.35)] transition-transform group-hover:scale-105">
              <GraduationCap className="h-6 w-6 text-blue-300" />
            </div>
            <div className="text-sm font-medium text-slate-200 leading-snug">
              One trusted ecosystem for institutions, regulators, verifiers and students.
            </div>
          </div>

          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blue-400/30 bg-blue-600/20 text-blue-300 shadow-sm transition-all group-hover:border-blue-300 group-hover:bg-blue-600 group-hover:text-white group-hover:shadow-[0_0_12px_rgba(37,99,255,0.6)]">
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>

        {/* Bottom Footer Strip with Indian Flag */}
        <div className="flex items-center gap-3 pt-2 text-[10px] sm:text-[11px] font-bold tracking-widest text-slate-500 uppercase">
          {/* Micro Indian Flag */}
          <div className="flex h-3.5 w-5 shrink-0 overflow-hidden rounded-[2px] shadow-xs ring-1 ring-white/10">
            <div className="h-full w-1/3 bg-[#FF9933]" />
            <div className="relative flex h-full w-1/3 items-center justify-center bg-white">
              <div className="h-1.5 w-1.5 rounded-full border-[0.6px] border-[#000080]" />
            </div>
            <div className="h-full w-1/3 bg-[#138808]" />
          </div>

          <span className="text-slate-700">|</span>

          <span className="tracking-widest">
            FOR A MORE TRANSPARENT HIGHER EDUCATION ECOSYSTEM IN INDIA
          </span>
        </div>
      </div>
    </section>
  );
}
