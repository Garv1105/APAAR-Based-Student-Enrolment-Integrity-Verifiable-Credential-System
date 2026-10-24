import { ArrowRight, BarChart2, FileCheck2, PlayCircle, ShieldCheck, Users } from "lucide-react";
import LandingHeroMap from "./LandingHeroMap";
import LandingSkyline from "./LandingSkyline";

const d = (ms: number) => ({ ["--d" as string]: `${ms}ms` });

export default function LandingHero({ onOpenPortal: _onOpenPortal }: { onOpenPortal?: (group?: 0 | 1 | 2) => void }) {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section id="home" className="relative w-full overflow-hidden pb-12 pt-6 sm:pb-16 lg:pb-20 lg:pt-10">
      {/* Background Skyline and Monument silhouettes */}
      <LandingSkyline />

      <div className="relative z-10 mx-auto w-full max-w-[1440px] px-5 sm:px-8">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-8 xl:gap-12">
          {/* Left Column: Headline, Copy, CTAs, Trust Row */}
          <div className="lg:col-span-6 xl:col-span-6">
            {/* Eyebrow Pill */}
            <div
              className="glass rise inline-flex items-center gap-2.5 rounded-full border border-white/[0.1] bg-[#0c1219]/65 px-4 py-1.5 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.5)] backdrop-blur-md"
              style={d(60)}
            >
              <span className="live-dot h-2 w-2 rounded-full bg-[#d4af37]" aria-hidden="true" />
              <span className="font-inter text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d4af37] sm:text-[11.5px]">
                A UNIFIED ACADEMIC INFRASTRUCTURE FOR INDIA
              </span>
            </div>

            {/* H1 Display Headline */}
            <h1
              className="rise mt-6 font-manrope text-[46px] font-extrabold leading-[1.04] tracking-[-0.035em] text-[#f5f5f5] sm:text-[62px] lg:text-[66px] xl:text-[76px]"
              style={d(130)}
            >
              Every Seat.
              <br />
              A Stronger{" "}
              <span className="bg-gradient-to-r from-[#f7e08a] via-[#d4af37] to-[#c4a032] bg-clip-text text-transparent">
                India.
              </span>
            </h1>

            {/* Paragraph Body */}
            <p
              className="rise mt-6 max-w-xl font-inter text-[16px] leading-[1.7] text-[#b3b9c2] sm:text-[17.5px]"
              style={d(210)}
            >
              VidyaPramaan enables transparent, verifiable and accountable student admission records across all
              AICTE-approved institutions, building a fairer and more trusted higher education ecosystem.
            </p>

            {/* CTAs */}
            <div className="rise mt-8 flex flex-wrap items-center gap-4" style={d(290)}>
              <button
                type="button"
                onClick={() => scrollTo("portals")}
                className="group inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-[#c4a032] via-[#d4af37] to-[#f7e08a] px-6 py-3.5 font-manrope text-[15px] font-bold text-[#0b0f14] shadow-[0_12px_28px_-10px_rgba(212,175,55,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-8px_rgba(212,175,55,0.9)] focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
              >
                Explore the Platform
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => scrollTo("how")}
                className="group inline-flex items-center gap-2.5 rounded-xl border border-[#222c37] bg-white/[0.03] px-6 py-3.5 font-inter text-[15px] font-medium text-[#f5f5f5] backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-[#d4af37]/40 hover:bg-white/[0.07] hover:text-[#f7e08a] focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
              >
                <PlayCircle className="h-4 w-4 text-[#d4af37]" aria-hidden="true" />
                See How it Works
              </button>
            </div>

            {/* Trust Row (Landing_Page_2.png) */}
            <div
              className="rise mt-10 grid grid-cols-2 gap-y-4 border-t border-[#222c37] pt-6 sm:grid-cols-4 sm:gap-x-2"
              style={d(370)}
            >
              <div className="flex items-center gap-2.5 pr-2 sm:border-r sm:border-[#222c37]">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#d4af37]" aria-hidden="true" />
                <span className="font-inter text-[12px] font-medium text-[#b3b9c2]">
                  Trusted Verification
                </span>
              </div>

              <div className="flex items-center gap-2.5 px-2 sm:border-r sm:border-[#222c37]">
                <BarChart2 className="h-4 w-4 shrink-0 text-[#d4af37]" aria-hidden="true" />
                <span className="font-inter text-[12px] font-medium text-[#b3b9c2]">
                  Real-time Transparency
                </span>
              </div>

              <div className="flex items-center gap-2.5 px-2 sm:border-r sm:border-[#222c37]">
                <Users className="h-4 w-4 shrink-0 text-[#d4af37]" aria-hidden="true" />
                <span className="font-inter text-[12px] font-medium text-[#b3b9c2]">
                  Unified National Network
                </span>
              </div>

              <div className="flex items-center gap-2.5 pl-2">
                <FileCheck2 className="h-4 w-4 shrink-0 text-[#d4af37]" aria-hidden="true" />
                <span className="font-inter text-[12px] font-medium text-[#b3b9c2]">
                  Better Access for Students
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Gold India Map */}
          <div className="rise lg:col-span-6 xl:col-span-6" style={d(200)}>
            <LandingHeroMap />
          </div>
        </div>
      </div>
    </section>
  );
}
