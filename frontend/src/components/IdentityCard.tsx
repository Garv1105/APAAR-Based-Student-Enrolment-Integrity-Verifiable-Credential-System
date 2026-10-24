import React from "react";
import { ArrowRight, Briefcase, Building2, ClipboardCheck, GraduationCap } from "lucide-react";

export type IconKind = "institution" | "aicte" | "auditor" | "employer" | "univ";

interface IdentityCardProps {
  id: string;
  title: string;
  subtitle: string;
  iconType: IconKind;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function AicteEmblemTile({ isSelected }: { isSelected: boolean }) {
  return (
    <div
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all ${
        isSelected
          ? "bg-gradient-to-br from-amber-500 via-orange-500 to-amber-300 p-0.5 shadow-md ring-1 ring-amber-400/50"
          : "bg-slate-800/70 border border-slate-700/60 p-0.5"
      }`}
    >
      <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-[#0c1427] text-[8px] font-black uppercase tracking-tight text-amber-400">
        AICTE
      </div>
    </div>
  );
}

export default function IdentityCard({
  id,
  title,
  subtitle,
  iconType,
  isSelected,
  onSelect,
}: IdentityCardProps) {
  const renderIcon = () => {
    if (iconType === "aicte") {
      return <AicteEmblemTile isSelected={isSelected} />;
    }

    const iconClass = `h-4 w-4 ${isSelected ? "text-blue-300" : "text-slate-300"}`;
    const tileBg = isSelected
      ? "bg-blue-600/30 border border-blue-400/50 shadow-[0_0_10px_rgba(37,99,255,0.3)]"
      : "bg-slate-800/70 border border-slate-700/60 group-hover:border-slate-600";

    let iconElement: React.ReactNode = <Building2 className={iconClass} />;
    if (iconType === "auditor") iconElement = <ClipboardCheck className={iconClass} />;
    if (iconType === "employer") iconElement = <Briefcase className={iconClass} />;
    if (iconType === "univ") iconElement = <GraduationCap className={iconClass} />;

    return (
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all ${tileBg}`}
      >
        {iconElement}
      </div>
    );
  };

  return (
    <div
      role="radio"
      aria-checked={isSelected}
      tabIndex={0}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(id);
        }
      }}
      className={`group relative flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3.5 transition-all duration-200 select-none ${
        isSelected
          ? "border-blue-400 bg-gradient-to-r from-blue-600/30 via-indigo-600/25 to-blue-500/20 shadow-[0_0_20px_rgba(37,99,255,0.35)] ring-1 ring-blue-400/50"
          : "border-slate-800/80 bg-[#0c1427]/70 hover:-translate-y-0.5 hover:border-blue-500/40 hover:bg-[#101b33] hover:shadow-[0_4px_16px_rgba(10,20,50,0.5)]"
      }`}
    >
      {/* Left: Radio + Icon Tile + Details */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Radio Indicator */}
        <div
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-all ${
            isSelected
              ? "border-2 border-blue-400 bg-blue-500 ring-2 ring-blue-400/40"
              : "border border-slate-600 bg-transparent group-hover:border-slate-500"
          }`}
        >
          {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
        </div>

        {/* Icon Tile */}
        {renderIcon()}

        {/* Text Details */}
        <div className="min-w-0">
          <div className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-blue-100 transition-colors">
            {title}
          </div>
          <div
            className={`text-[11px] truncate mt-0.5 transition-colors ${
              isSelected ? "text-blue-200 font-medium" : "text-[#9fb0d0]"
            }`}
          >
            {subtitle}
          </div>
        </div>
      </div>

      {/* Right: Circular Arrow Action */}
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
          isSelected
            ? "bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,255,0.8)]"
            : "border border-slate-700/80 text-slate-400 group-hover:border-slate-500 group-hover:text-slate-200"
        }`}
      >
        <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </div>
  );
}
