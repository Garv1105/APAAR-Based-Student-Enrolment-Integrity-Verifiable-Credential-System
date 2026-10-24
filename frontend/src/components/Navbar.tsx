import { BrandLogo } from "./BrandMark";

const LINKS = [
  ["#/activate", "Activate account"],
  ["#/request-access", "Verifier access"],
] as const;

/**
 * Public header (sticky, glass): VidyaPramaan lockup, a plain-text affiliation note where an official emblem would sit
 * (no government or AICTE emblem: this is a prototype, not an official site), account links and Sign in.
 * The "Demo environment" badge shows only when the server runs in DEMO_MODE.
 */
export default function Navbar({ demo = false, current = "/" }: { demo?: boolean; current?: string }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.06] bg-[#050816]/55 backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] w-full max-w-[1440px] items-center justify-between gap-6 px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-5">
          <a href="#/" aria-label="VidyaPramaan home"><BrandLogo size="md" /></a>
          <span aria-hidden className="hidden h-9 w-px bg-gradient-to-b from-transparent via-white/25 to-transparent xl:block" />
          <p className="hidden font-inter text-[11.5px] leading-snug text-[#98a6c6] xl:block">
            <span className="block font-medium text-[#d6def0]">Student data and credential platform for AICTE (SIH26263)</span>
            Prototype · not an official Government of India or AICTE website
          </p>
        </div>
        <nav aria-label="Account" className="flex shrink-0 items-center gap-1 font-inter sm:gap-2">
          {demo && (
            <span className="mr-2 hidden items-center gap-2 whitespace-nowrap rounded-full border border-amber-400/25 bg-amber-400/[0.06] px-3 py-1 text-[11.5px] text-amber-100/90 md:inline-flex">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-amber-300" aria-hidden />Demo environment
            </span>
          )}
          {LINKS.map(([href, text]) => (
            <a key={href} href={href} aria-current={current === href.slice(1) ? "page" : undefined}
              className="hidden rounded-xl px-3 py-2 text-[13.5px] text-[#a9b6d3] transition-colors hover:bg-white/[0.05] hover:text-white aria-[current=page]:text-white lg:inline-block">
              {text}
            </a>
          ))}
          <a href="#/signin"
            className="rounded-xl bg-white/[0.08] px-4 py-2 font-manrope text-[13.5px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors hover:bg-white/[0.14]">
            Sign in
          </a>
        </nav>
      </div>
    </header>
  );
}
