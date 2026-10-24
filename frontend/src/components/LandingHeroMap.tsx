import IndiaMap from "./IndiaMap";

export default function LandingHeroMap() {
  return (
    <div className="relative mx-auto flex w-full max-w-[680px] items-center justify-center lg:max-w-[760px] xl:max-w-[820px]">
      {/* Ambient background gold glow behind the map */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 z-0 rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(212,175,55,0.18),transparent_65%)] blur-2xl"
      />

      {/* Micro-label Left: ONE NATION · ONE ACADEMIC TRUTH */}
      <div
        className="pointer-events-none absolute -left-4 top-[58%] z-20 hidden -translate-y-1/2 flex-col xl:flex"
        aria-hidden="true"
      >
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#d4af37]/80">
          ONE NATION
        </span>
        <span className="mt-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#f7e08a]">
          ONE ACADEMIC TRUTH
        </span>
        <span className="gold-rule mt-2 w-16" />
      </div>

      {/* Micro-label Right: A CONNECTED EDUCATION ECOSYSTEM */}
      <div
        className="pointer-events-none absolute -right-2 top-8 z-20 hidden text-right xl:block"
        aria-hidden="true"
      >
        <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#d4af37]/80">
          A CONNECTED
        </p>
        <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#f7e08a]">
          EDUCATION ECOSYSTEM
        </p>
        <ul className="mt-3 space-y-1 text-[11.5px] font-medium text-[#b3b9c2]/80">
          <li>Institutions</li>
          <li>Regulators</li>
          <li>Verifiers</li>
          <li>Students</li>
        </ul>
      </div>

      {/* 4 Interactive Glass Callout Chips with Hairline Connectors (Landing_Page_2.png) */}
      {/* 1. Top-Right: 6,200+ Institutions Connected */}
      <div
        className="pointer-events-none absolute right-4 top-16 z-20 hidden items-center xl:flex"
        aria-hidden="true"
      >
        <div className="glass flex flex-col rounded-xl border border-white/[0.1] bg-[#0d141e]/75 px-3.5 py-2 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          <span className="font-manrope text-[12.5px] font-extrabold text-[#f7e08a] tnum">6,200+</span>
          <span className="font-inter text-[11px] font-medium text-[#b3b9c2]">Institutions Connected</span>
        </div>
        <svg className="h-6 w-12 -translate-x-1" viewBox="0 0 48 24" fill="none">
          <path d="M48 12 H16 L0 24" stroke="#d4af37" strokeWidth="0.8" strokeOpacity="0.4" strokeDasharray="2 3" />
          <circle cx="0" cy="24" r="2" fill="#d4af37" />
        </svg>
      </div>

      {/* 2. Upper-Left: All States & UTs Unified Academic Network */}
      <div
        className="pointer-events-none absolute -left-2 top-28 z-20 hidden items-center xl:flex"
        aria-hidden="true"
      >
        <svg className="h-6 w-12 translate-x-1" viewBox="0 0 48 24" fill="none">
          <path d="M0 12 H32 L48 24" stroke="#d4af37" strokeWidth="0.8" strokeOpacity="0.4" strokeDasharray="2 3" />
          <circle cx="48" cy="24" r="2" fill="#d4af37" />
        </svg>
        <div className="glass flex flex-col rounded-xl border border-white/[0.1] bg-[#0d141e]/75 px-3.5 py-2 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          <span className="font-manrope text-[12px] font-bold text-[#f5f5f5]">All States & UTs</span>
          <span className="font-inter text-[10.5px] font-medium text-[#b3b9c2]">Unified Academic Network</span>
        </div>
      </div>

      {/* 3. Mid-Right: Real-time Verification & Monitoring */}
      <div
        className="pointer-events-none absolute -right-4 top-[56%] z-20 hidden items-center xl:flex"
        aria-hidden="true"
      >
        <div className="glass flex flex-col rounded-xl border border-white/[0.1] bg-[#0d141e]/75 px-3.5 py-2 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          <span className="font-manrope text-[12px] font-bold text-[#f7e08a]">Real-time</span>
          <span className="font-inter text-[10.5px] font-medium text-[#b3b9c2]">Verification & Monitoring</span>
        </div>
        <svg className="h-6 w-10 -translate-x-1" viewBox="0 0 40 24" fill="none">
          <path d="M40 12 H14 L0 0" stroke="#d4af37" strokeWidth="0.8" strokeOpacity="0.4" strokeDasharray="2 3" />
          <circle cx="0" cy="0" r="2" fill="#d4af37" />
        </svg>
      </div>

      {/* 4. Lower-Right: Towards a Transparent India */}
      <div
        className="pointer-events-none absolute right-8 bottom-16 z-20 hidden items-center xl:flex"
        aria-hidden="true"
      >
        <div className="glass flex flex-col rounded-xl border border-white/[0.1] bg-[#0d141e]/75 px-3.5 py-2 shadow-[0_8px_20px_-6px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          <span className="font-manrope text-[11.5px] font-semibold text-[#f5f5f5]">Towards a</span>
          <span className="font-inter text-[10.5px] font-medium text-[#d4af37]">Transparent India</span>
        </div>
        <svg className="h-6 w-10 -translate-x-1" viewBox="0 0 40 24" fill="none">
          <path d="M40 12 H14 L0 24" stroke="#d4af37" strokeWidth="0.8" strokeOpacity="0.4" strokeDasharray="2 3" />
          <circle cx="0" cy="24" r="2" fill="#d4af37" />
        </svg>
      </div>

      {/* Main Gold India Map */}
      <div className="relative z-10 w-full scale-[1.05] sm:scale-100 xl:scale-[1.12]">
        <IndiaMap tone="gold" className="w-full drop-shadow-[0_20px_40px_rgba(212,175,55,0.2)]" />
      </div>
    </div>
  );
}
