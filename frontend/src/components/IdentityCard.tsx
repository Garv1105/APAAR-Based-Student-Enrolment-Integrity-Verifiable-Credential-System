import { Briefcase, Building2, Check, ClipboardCheck, GraduationCap, Landmark } from "lucide-react";

export type IconKind = "institution" | "aicte" | "auditor" | "employer" | "univ";
const ICON = { institution: Building2, aicte: Landmark, auditor: ClipboardCheck, employer: Briefcase, univ: GraduationCap } as const;

interface IdentityCardProps {
  id: string;
  title: string;
  subtitle: string;
  iconType: IconKind;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

/** One selectable demo identity: a real radio input inside a label, so keyboard and screen readers work natively. */
export default function IdentityCard({ id, title, subtitle, iconType, isSelected, onSelect }: IdentityCardProps) {
  const Icon = ICON[iconType];
  return (
    <label className={`group relative flex cursor-pointer items-center gap-4 rounded-2xl border px-4 py-3.5 transition-all duration-300
      has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#d4af37]
      ${isSelected
        ? "border-[#d4af37]/60 bg-gradient-to-r from-[#d4af37]/15 via-[#f7e08a]/10 to-[#d4af37]/5 shadow-[0_12px_32px_-16px_rgba(212,175,55,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]"
        : "border-white/[0.07] bg-white/[0.025] hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.05]"}`}>
      <input type="radio" name="identity" value={id} checked={isSelected} onChange={() => onSelect(id)} className="sr-only" />
      <span aria-hidden className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-all duration-300
        ${isSelected ? "bg-gradient-to-br from-[#c4a032] via-[#d4af37] to-[#f7e08a] text-[#0b0f14] shadow-[0_8px_20px_-8px_rgba(212,175,55,0.6)]" : "bg-white/[0.04] text-[#d4af37] ring-1 ring-white/[0.06] group-hover:text-[#f7e08a]"}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        {/* Institution name: Manrope semibold, ~15.5px */}
        <span className="block truncate font-manrope text-[15px] font-semibold tracking-[-0.01em] text-[#f5f5f5]">{title}</span>
        {/* Subtitle: Inter 13px · ID in Geist Mono */}
        <span className="mt-0.5 block truncate font-inter text-[12.5px] text-[#b3b9c2]">
          {subtitle} <span className="text-[#64748b]">·</span>{" "}
          <span className="tnum font-mono text-[11.5px] text-[#d4af37]/80">{id}</span>
        </span>
      </span>
      <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-all duration-300 ${isSelected ? "scale-100 bg-[#d4af37] text-[#0b0f14]" : "scale-90 border border-white/20 text-transparent"}`}>
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    </label>
  );
}
