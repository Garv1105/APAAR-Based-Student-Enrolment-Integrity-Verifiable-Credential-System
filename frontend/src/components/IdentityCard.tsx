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
      has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#7aa2ff]/60
      ${isSelected
        ? "border-[#7aa2ff]/55 bg-gradient-to-r from-[#3b6bff]/[0.18] via-[#5b5bff]/[0.10] to-[#7c5cff]/[0.08] shadow-[0_12px_32px_-16px_rgba(59,107,255,0.75),inset_0_1px_0_rgba(255,255,255,0.08)]"
        : "border-white/[0.07] bg-white/[0.025] hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.05]"}`}>
      <input type="radio" name="identity" value={id} checked={isSelected} onChange={() => onSelect(id)} className="sr-only" />
      <span aria-hidden className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-all duration-300
        ${isSelected ? "bg-gradient-to-br from-[#4f7bff] to-[#7c5cff] text-white shadow-[0_8px_20px_-8px_rgba(79,123,255,0.9)]" : "bg-white/[0.05] text-[#9fb0d0] ring-1 ring-white/[0.06] group-hover:text-white"}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-manrope text-[15.5px] font-semibold tracking-[-0.01em] text-white">{title}</span>
        <span className="mt-0.5 block truncate font-inter text-[13px] text-[#93a2c4]">{subtitle} <span className="text-[#5f6f93]">·</span> <span className="font-mono text-[12px] text-[#7d8db0]">{id}</span></span>
      </span>
      <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-all duration-300 ${isSelected ? "scale-100 bg-[#4f7bff] text-white" : "scale-90 border border-white/20 text-transparent"}`}>
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    </label>
  );
}
