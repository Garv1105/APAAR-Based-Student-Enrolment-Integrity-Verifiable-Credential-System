import { ArrowRight } from "lucide-react";
import { BrandLogo } from "./BrandMark";
import { BTN_PRIMARY } from "./landing/styles";

const LINKS = [
  ["#/", "Home", "/"],
  ["#/?s=how", "How it works", "how"],
  ["#/?s=data", "Live data", "data"],
  ["#/?s=roles", "Who it's for", "roles"],
  ["#/activate", "Activate account", "/activate"],
] as const;

export default function Navbar({ current = "/" }: { demo?: boolean; current?: string }) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.06] bg-[#131417]/75 backdrop-blur-xl">
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
          <a href="#/signin" className={`${BTN_PRIMARY} group !px-5 !py-2.5 text-[14.5px]`}>
            Sign in <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </a>
        </div>
      </div>
    </header>
  );
}
