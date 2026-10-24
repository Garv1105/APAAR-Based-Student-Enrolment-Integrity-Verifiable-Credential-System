import BrandMark from "./BrandMark";

/** Landing top bar: brand and environment status. No links that lead nowhere. */
export default function Navbar() {
  return (
    <header className="relative z-40 w-full">
      <div className="mx-auto flex h-20 w-full max-w-[1440px] items-center justify-between px-5 sm:px-8">
        <a href="#/" className="flex items-center gap-3" aria-label="ShikshaNetra home">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-gradient-to-br from-[#3b6bff]/30 to-[#7c5cff]/20 text-[#dbe4ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <BrandMark className="h-6 w-6" />
          </span>
          <span className="leading-tight">
            <span className="block font-manrope text-[17px] font-bold tracking-[-0.02em] text-white">ShikshaNetra</span>
            <span className="hidden font-inter text-[12px] text-[#8b9bbd] sm:block">Seat integrity &amp; credentials · SIH26263</span>
          </span>
        </a>
        <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 font-inter text-[12px] text-[#c3cfe8] backdrop-blur">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          Demo environment
        </span>
      </div>
    </header>
  );
}
