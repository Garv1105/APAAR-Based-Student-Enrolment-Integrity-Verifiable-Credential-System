import { Activity, FileCheck, Network, ShieldCheck } from "lucide-react";

const ITEMS = [
  [ShieldCheck, "Trusted Verification"],
  [Activity, "Real-time Transparency"],
  [Network, "Unified National Network"],
  [FileCheck, "Better Access for Students"],
] as const;

/** Micro-trust row under the hero buttons. */
export default function TrustBar() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-3">
      {ITEMS.map(([Icon, label]) => (
        <li key={label} className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <Icon className="h-4 w-4 text-amber-400/90" strokeWidth={1.8} aria-hidden />{label}
        </li>
      ))}
    </ul>
  );
}
