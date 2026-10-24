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
}

export default function IdentityPanel({ selectedId, onSelectId, password, onPasswordChange, onSubmit, busy, error }: IdentityPanelProps) {
  const [tab, setTab] = useState(() => Math.max(0, GROUPS.findIndex((g) => g.items.some((i) => i.id === selectedId))));
  const pick = (i: number) => {
    setTab(i);
    if (!GROUPS[i].items.some((it) => it.id === selectedId)) onSelectId(GROUPS[i].items[0].id); // keep a selection in view
  };
  const group = GROUPS[tab];

  return (
    <div className="rise relative w-full overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#0a1024]/55 p-7 font-inter shadow-[0_50px_100px_-40px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl">
      <span aria-hidden className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#9db4ff]/60 to-transparent" />
      <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[#5b6bff]/20 blur-3xl" />

      <div className="relative">
        <p className="text-[12px] font-semibold tracking-[0.14em] text-[#8ea8ff]">SIGN IN</p>
        <h2 className="mt-2 font-manrope text-[30px] font-extrabold leading-tight tracking-[-0.03em] text-white">Choose your identity</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[#93a2c4]">Demo accounts for each role. Every account uses the same demo password.</p>

        {error && (
          <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-[13px] text-rose-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{error}
          </div>
        )}

        <div role="tablist" aria-label="Role" className="mt-6 grid grid-cols-3 gap-1 rounded-2xl border border-white/[0.07] bg-black/25 p-1">
          {GROUPS.map((g, i) => (
            <button key={g.title} type="button" role="tab" aria-selected={tab === i} onClick={() => pick(i)}
              className={`relative rounded-xl px-3 py-2.5 font-manrope text-[13.5px] font-semibold transition-colors duration-200 ${tab === i ? "text-white" : "text-[#8b9bbd] hover:text-white"}`}>
              {tab === i && <motion.span layoutId="role-tab" className="absolute inset-0 rounded-xl bg-gradient-to-b from-white/[0.12] to-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_6px_18px_-8px_rgba(0,0,0,0.8)]"
                transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="relative">{g.title} <span className="font-inter text-[11.5px] font-medium opacity-60">{g.items.length}</span></span>
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="mt-4">
          <fieldset className="min-h-[316px]">
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
            className="group relative mt-5 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-[#3b6bff] via-[#4f63ff] to-[#6f5cff] py-3.5 font-manrope text-[15.5px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_16px_36px_-14px_rgba(59,107,255,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_22px_44px_-14px_rgba(79,99,255,1)] disabled:opacity-60">
            <span aria-hidden className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/20 blur-md transition-transform duration-700 group-hover:translate-x-[420%]" />
            <span className="relative">{busy ? "Signing in…" : "Sign in"}</span>
            <ArrowRight className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </button>

          <p className="mt-4 text-center text-[12px] leading-relaxed text-[#6f7fa3]">
            Prototype · synthetic data only · APAAR registry, AICTE approval registry, OTP and logins are MOCK
          </p>
        </form>
      </div>
    </div>
  );
}
