import markUrl from "../assets/vidyapramaan-mark.png";

/** VidyaPramaan mark: the team's logo artwork (docs/design/logo.png), resized for the UI. */
export default function BrandMark({ className = "h-10" }: { className?: string }) {
  return <img src={markUrl} alt="" aria-hidden="true" draggable={false} className={`w-auto select-none ${className}`} />;
}

/** Full lockup: mark, "Vidya" + gold "Pramaan", optional tagline. `size` scales the whole lockup. */
export function BrandLogo({ size = "md", tagline = true, className = "" }: { size?: "sm" | "md" | "lg"; tagline?: boolean; className?: string }) {
  const s = {
    sm: { mark: "h-9", word: "text-[18px]", tag: "text-[8px] tracking-[0.22em]" },
    md: { mark: "h-12", word: "text-[23px]", tag: "text-[9px] tracking-[0.24em]" },
    lg: { mark: "h-16", word: "text-[32px]", tag: "text-[11px] tracking-[0.28em]" },
  }[size];
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <BrandMark className={`${s.mark} shrink-0 drop-shadow-[0_6px_16px_rgba(212,175,55,0.35)]`} />
      <span className="leading-none">
        <span className={`block font-manrope font-extrabold tracking-[-0.025em] ${s.word}`}>
          <span className="text-white">Vidya</span><span className="bg-gradient-to-b from-[#FBE7A1] via-[#E2BC4A] to-[#C9982A] bg-clip-text text-transparent">Pramaan</span>
        </span>
        {tagline && <span className={`mt-1.5 block font-inter font-semibold uppercase text-[#cfc6a6] ${s.tag}`}>National Academic Integrity Platform</span>}
      </span>
    </span>
  );
}
