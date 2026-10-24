import { ArrowRight } from "lucide-react";
import { BrandLogo } from "./BrandMark";

const LINKS = [
  ["#/", "Home", "/"],
  ["#/?s=how", "How it works", "how"],
  ["#/?s=data", "Live data", "data"],
  ["#/?s=roles", "Who it's for", "roles"],
  ["#/activate", "Activate account", "/activate"],
] as const;

/**
 * Public header (sticky, glass): VidyaPramaan lockup, section links and a gold Sign in button. No government or AICTE
 * emblem: this is a prototype, not an official site (said in the footer). The "Demo environment" badge shows only when
 * the server runs in DEMO_MODE.
 */
export default function Navbar({ demo = false, current = "/" }: { demo?: boolean; current?: string }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.06] bg-[#0b0f14]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-[84px] w-full max-w-[1440px] items-center justify-between gap-6 px-5 sm:px-8">
        <a href="#/" aria-label="VidyaPramaan home" className="shrink-0"><BrandLogo size="md" /></a>
        <nav aria-label="Main" className="hidden items-center gap-1 font-inter xl:flex">
          {LINKS.map(([href, text, key]) => {
            const on = current === key;
            return (
              <a key={href} href={href} aria-current={on ? "page" : undefined}
                className={`relative px-3.5 py-2 text-[14.5px] transition-colors ${on ? "text-[#e3c05a]" : "text-[#d5d9de] hover:text-white"}`}>
                {text}
                {on && <span aria-hidden className="absolute inset-x-3.5 -bottom-[3px] h-[2px] rounded-full bg-[#d4af37]" />}
              </a>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-3 font-inter">
          {demo && (
            <span className="hidden items-center gap-2 whitespace-nowrap rounded-full border border-[#d4af37]/25 bg-[#d4af37]/[0.06] px-3 py-1 text-[11.5px] text-[#f1d488] md:inline-flex">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#e3c05a]" aria-hidden />Demo environment
            </span>
          )}
          <a href="#/signin" className="btn-gold group inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-manrope text-[14.5px] font-bold">
            Sign in <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </a>
        </div>
      </div>
    </header>
  );
}
