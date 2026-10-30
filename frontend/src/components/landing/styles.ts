export const GOLD_TEXT = "bg-gradient-to-r from-[#FDE047] via-[#D4AF37] to-[#EAB308] bg-clip-text text-transparent";
export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#F5C067] to-[#E5A93C] px-6 py-3 font-semibold text-black shadow-[0_0_25px_rgba(245,192,103,0.3)] transition-all hover:brightness-110";
export const BTN_SECONDARY =
  "flex items-center gap-2 rounded-lg border border-white/20 bg-white/[0.03] px-6 py-3 text-white backdrop-blur-md transition-colors hover:bg-white/[0.08]";
export const fmt = (n: number) => n.toLocaleString("en-IN");

export const spotlight = (e: { currentTarget: HTMLElement; clientX: number; clientY: number }) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
};
export const GLASS = "glass-premium rounded-2xl";
