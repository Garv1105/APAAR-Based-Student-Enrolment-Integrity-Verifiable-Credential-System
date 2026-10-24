import { useId } from "react";

/**
 * VidyaPramaan mark: an open book whose layered pages rise into a student figure, under a gold seal ("pramaan").
 * The reference sheet used the Ashoka Chakra; a national symbol isn't used here, so the seal carries a plain star.
 * `cut` is the background colour used for the thin separations between layers (the mark only sits on dark surfaces).
 */
export default function BrandMark({ className = "h-8 w-8", cut = "#0b0f14" }: { className?: string; cut?: string }) {
  const g = useId().replace(/:/g, "");
  const fill = `url(#gold-${g})`;
  const sep = { stroke: cut, strokeWidth: 1.5, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`gold-${g}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#F7E08A" />
          <stop offset="48%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#9C7A22" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="8.8" r="6.2" fill={fill} />
      <path d="M32.00 5.40 L32.57 7.41 L34.40 6.40 L33.39 8.23 L35.40 8.80 L33.39 9.37 L34.40 11.20 L32.57 10.19 L32.00 12.20 L31.43 10.19 L29.60 11.20 L30.61 9.37 L28.60 8.80 L30.61 8.23 L29.60 6.40 L31.43 7.41Z" fill={cut} opacity="0.55" />
      <circle cx="32" cy="21" r="3.9" fill={fill} />
      <path d="M30.5 45 C25 41.5 19 37.5 12.5 32.5 L12.5 24.5 C19 29.5 25 34 30.5 38 Z" fill={fill} opacity="0.85" {...sep} />
      <path d="M 33.5 45 C 39 41.5 45 37.5 51.5 32.5 L 51.5 24.5 C 45 29.5 39 34 33.5 38 Z" fill={fill} opacity="0.85" {...sep} />
      <path d="M31 60.5 C22 56 12.5 50.5 3.5 43.5 L3.5 30 C12 36.5 21.5 43 31 48.5 Z" fill={fill} {...sep} />
      <path d="M 33 60.5 C 42 56 51.5 50.5 60.5 43.5 L 60.5 30 C 52 36.5 42.5 43 33 48.5 Z" fill={fill} {...sep} />
      <path d="M32 57.5 C26 50 19 41 16.5 25 C25 29 31 37.5 32 47.5 Z" fill={fill} {...sep} />
      <path d="M 32 57.5 C 38 50 45 41 47.5 25 C 39 29 33 37.5 32 47.5 Z" fill={fill} {...sep} />
    </svg>
  );
}

/** Full lockup: mark, "Vidya" + gold "Pramaan", optional tagline. `size` scales the whole lockup. */
export function BrandLogo({ size = "md", tagline = true, className = "", cut }: { size?: "sm" | "md" | "lg"; tagline?: boolean; className?: string; cut?: string }) {
  const s = {
    sm: { mark: "h-8 w-8", word: "text-[17px]", tag: "text-[7.5px] tracking-[0.24em]" },
    md: { mark: "h-10 w-10", word: "text-[21px]", tag: "text-[8.5px] tracking-[0.26em]" },
    lg: { mark: "h-14 w-14", word: "text-[30px]", tag: "text-[10px] tracking-[0.3em]" },
  }[size];
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark cut={cut} className={`${s.mark} shrink-0 drop-shadow-[0_4px_14px_rgba(212,175,55,0.35)]`} />
      <span className="leading-none">
        <span className={`block font-manrope font-bold tracking-[-0.02em] ${s.word}`}>
          <span className="text-white">Vidya</span><span className="bg-gradient-to-b from-[#F7E08A] to-[#D4AF37] bg-clip-text text-transparent">Pramaan</span>
        </span>
        {tagline && <span className={`mt-1.5 block font-inter font-medium uppercase text-[#c9c3ad] ${s.tag}`}>National Academic Integrity Platform</span>}
      </span>
    </span>
  );
}
