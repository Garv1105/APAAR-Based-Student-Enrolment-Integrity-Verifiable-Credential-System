import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ShieldAlert } from "lucide-react";
import IdentityCard, { type IconKind } from "./IdentityCard";
import PasswordField from "./PasswordField";

// Seeded MOCK identities (backend/data/seed/registry.json), shown so judges can switch roles quickly.
const GROUPS: { title: string; items: { id: string; title: string; subtitle: string; icon: IconKind }[] }[] = [
  { title: "Institutions", items: [
    { id: "inst-a", title: "Demo Institute of Technology", subtitle: "Clean data", icon: "institution" },
    { id: "inst-b", title: "Sample College of Engineering", subtitle: "Messy data, duplicates", icon: "institution" },
    { id: "inst-c", title: "Example School of Management", subtitle: "Enrolment spike", icon: "institution" },
    { id: "inst-d", title: "Closed Polytechnic", subtitle: "Not approved this year", icon: "institution" },
  ] },
  { title: "Regulators", items: [
    { id: "aicte", title: "AICTE Monitoring Officer", subtitle: "National monitoring, cases, ledger", icon: "aicte" },
    { id: "auditor", title: "Regulator (auditor)", subtitle: "Read-only national view", icon: "auditor" },
  ] },
  { title: "Verifiers", items: [
    { id: "employer", title: "Acme Hiring", subtitle: "Employer, consent-based checks", icon: "employer" },
    { id: "univ", title: "Demo Technological University", subtitle: "Registrar, awards degrees", icon: "univ" },
  ] },
];

interface IdentityPanelProps {
  selectedId: string;
  onSelectId: (id: string) => void;
  password: string;
  onPasswordChange: (pwd: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
  error?: string | null;
  focusGroup?: 0 | 1 | 2;
}

export default function IdentityPanel({ selectedId, onSelectId, password, onPasswordChange, onSubmit, busy, error, focusGroup }: IdentityPanelProps) {
  const [tab, setTab] = useState(() => {
    if (typeof focusGroup === "number" && focusGroup >= 0 && focusGroup <= 2) return focusGroup;
    return Math.max(0, GROUPS.findIndex((g) => g.items.some((i) => i.id === selectedId)));
  });

  React.useEffect(() => {
    if (typeof focusGroup === "number" && focusGroup >= 0 && focusGroup <= 2) {
      setTab(focusGroup);
      if (!GROUPS[focusGroup].items.some((it) => it.id === selectedId)) {
        onSelectId(GROUPS[focusGroup].items[0].id);
      }
    }
  }, [focusGroup]);

  const pick = (i: number) => {
    setTab(i);
    if (!GROUPS[i].items.some((it) => it.id === selectedId)) onSelectId(GROUPS[i].items[0].id); // keep a selection in view
  };
  const group = GROUPS[tab];

  return (
    <div className="glass rise relative w-full overflow-hidden rounded-[24px] p-6 font-inter shadow-[0_50px_100px_-40px_rgba(0,0,0,0.95)] sm:p-7">
      <span aria-hidden className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#d4af37]/60 to-transparent" />
      <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[#d4af37]/10 blur-3xl" />

      <div className="relative">
        {/* Spec: small labels — Inter semibold 12px, UPPERCASE, tracking 0.16em */}
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#d4af37]">Portal Access</p>
        {/* Spec: display heading — Manrope bold */}
        <h2 className="mt-2 font-manrope text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-[#f5f5f5] sm:text-[28px]">Choose your identity</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#b3b9c2]">Demo accounts for each role. Every account uses the same demo password.</p>

        {error && (
          <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#e5534b]/30 bg-[#e5534b]/10 px-3.5 py-2.5 text-[13px] text-[#f39a94]">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#e5534b]" aria-hidden />{error}
          </div>
        )}

        <div role="tablist" aria-label="Role" className="mt-6 grid grid-cols-3 gap-1 rounded-2xl border border-white/[0.08] bg-black/40 p-1">
          {GROUPS.map((g, i) => (
            <button key={g.title} type="button" role="tab" aria-selected={tab === i} onClick={() => pick(i)}
              className={`relative rounded-xl px-3 py-2.5 font-inter text-[13px] font-semibold transition-colors duration-200 ${tab === i ? "text-[#0b0f14]" : "text-[#b3b9c2] hover:text-[#f5f5f5]"}`}>
              {tab === i && <motion.span layoutId="role-tab" className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#c4a032] via-[#d4af37] to-[#f7e08a] shadow-[0_4px_14px_-3px_rgba(212,175,55,0.6)]"
                transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="relative font-manrope font-bold">{g.title} <span className="tnum font-mono text-[11px] opacity-75">{g.items.length}</span></span>
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="mt-4">
          <fieldset className="min-h-[300px]">
            <legend className="sr-only">{group.title}</legend>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={group.title} className="space-y-2.5"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: "easeOut" }}>
                {group.items.map((p) => (
                  <IdentityCard key={p.id} id={p.id} title={p.title} subtitle={p.subtitle} iconType={p.icon}
                    isSelected={selectedId === p.id} onSelect={onSelectId} />
                ))}
              </motion.div>
            </AnimatePresence>
          </fieldset>

          <div className="mt-5">
            <PasswordField value={password} onChange={onPasswordChange} disabled={busy} />
          </div>

          <button type="submit" disabled={busy}
            className="group relative mt-5 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#c4a032] via-[#d4af37] to-[#f7e08a] py-3.5 font-manrope text-[15px] font-bold text-[#0b0f14] shadow-[0_12px_28px_-10px_rgba(212,175,55,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-8px_rgba(212,175,55,0.9)] disabled:opacity-60">
            <span aria-hidden className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/30 blur-md transition-transform duration-700 group-hover:translate-x-[420%]" />
            <span className="relative">{busy ? "Signing in…" : "Access Portal"}</span>
            <ArrowRight className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </button>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-[#b3b9c2]/60">
            Prototype · synthetic data only · APAAR registry, AICTE approval registry, OTP and logins are MOCK
          </p>
        </form>
      </div>
    </div>
  );
}
