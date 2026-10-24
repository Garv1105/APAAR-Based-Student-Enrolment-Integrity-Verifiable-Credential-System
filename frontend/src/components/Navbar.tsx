/** Landing top bar: brand and environment status. No links that lead nowhere. */
export default function Navbar() {
  return (
    <header className="relative z-40 w-full">
      <div className="mx-auto flex h-20 w-full max-w-[1320px] items-center justify-between px-5 sm:px-8">
        <a href="#/" className="flex items-center gap-3" aria-label="APAAR Integrity home">
          <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full border border-[#7aa2ff]/45 font-display text-[22px] leading-none text-[#c9d6ff]">A</span>
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold tracking-[-0.01em] text-white">APAAR Integrity</span>
            <span className="hidden text-[11.5px] text-[#8b9bbd] sm:block">Seat integrity &amp; credentials · SIH26263</span>
          </span>
        </a>
        <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11.5px] text-[#b7c4e0] backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          Demo environment
        </span>
      </div>
    </header>
  );
}
