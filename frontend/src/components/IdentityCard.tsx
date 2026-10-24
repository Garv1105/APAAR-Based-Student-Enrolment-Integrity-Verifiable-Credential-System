import { Briefcase, Building2, ClipboardCheck, GraduationCap, Landmark } from "lucide-react";

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
    <label className={`group flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-[7px] transition-colors duration-200
      has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#7aa2ff]/60
      ${isSelected ? "border-[#7aa2ff]/45 bg-[#3b6bff]/[0.10]" : "border-transparent hover:border-white/[0.08] hover:bg-white/[0.03]"}`}>
      <input type="radio" name="identity" value={id} checked={isSelected} onChange={() => onSelect(id)} className="sr-only" />
      <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors duration-200 ${isSelected ? "bg-[#3b6bff]/25 text-[#dbe4ff]" : "bg-white/[0.045] text-[#8b9bbd] group-hover:text-[#c9d3ea]"}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-white">{title}</span>
        <span className="block truncate text-[11.5px] text-[#8b9bbd]">{subtitle}</span>
      </span>
      <span aria-hidden className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors duration-200 ${isSelected ? "border-[#9db4ff]" : "border-white/20"}`}>
        <span className={`h-2 w-2 rounded-full bg-[#c9d6ff] transition-transform duration-200 ${isSelected ? "scale-100" : "scale-0"}`} />
      </span>
    </label>
  );
}
