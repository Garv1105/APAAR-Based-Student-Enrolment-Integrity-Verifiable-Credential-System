import { BrandLogo } from "./BrandMark";

/**
 * Landing header (sticky, glass): VidyaPramaan lockup, then a plain-text affiliation note where an official
 * emblem would sit. No government or AICTE emblem: this is a prototype, not an official site.
 */
export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.06] bg-[#050816]/55 backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] w-full max-w-[1440px] items-center justify-between gap-6 px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-5">
          <a href="#/" aria-label="VidyaPramaan home"><BrandLogo size="md" cut="#050816" /></a>
          <span aria-hidden className="hidden h-9 w-px bg-gradient-to-b from-transparent via-white/25 to-transparent lg:block" />
          <p className="hidden font-inter text-[11.5px] leading-snug text-[#98a6c6] lg:block">
            <span className="block font-medium text-[#d6def0]">SIH26263 prototype · problem statement for AICTE</span>
            Not an official Government of India or AICTE website
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 font-inter text-[12px] text-[#c3cfe8]">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          Demo environment
        </span>
      </div>
    </header>
  );
}
