import React from "react";
import { ArrowRight, ShieldAlert } from "lucide-react";
import IdentityCard, { type IconKind } from "./IdentityCard";
import PasswordField from "./PasswordField";

// Seeded MOCK identities (backend/data/seed/registry.json), shown so judges can switch roles quickly.
const GROUPS: { title: string; items: { id: string; title: string; subtitle: string; icon: IconKind }[] }[] = [
  { title: "Institutions", items: [
    { id: "inst-a", title: "Demo Institute of Technology", subtitle: "Clean data · inst-a", icon: "institution" },
    { id: "inst-b", title: "Sample College of Engineering", subtitle: "Messy data · inst-b", icon: "institution" },
    { id: "inst-c", title: "Example School of Management", subtitle: "Enrolment spike · inst-c", icon: "institution" },
    { id: "inst-d", title: "Closed Polytechnic", subtitle: "Not approved · inst-d", icon: "institution" },
  ] },
  { title: "Regulators", items: [
    { id: "aicte", title: "AICTE Monitoring Officer", subtitle: "National monitoring · aicte", icon: "aicte" },
    { id: "auditor", title: "Regulator (auditor)", subtitle: "Read-only · auditor", icon: "auditor" },
  ] },
  { title: "Verification", items: [
    { id: "employer", title: "Acme Hiring", subtitle: "Employer, consent-based checks · employer", icon: "employer" },
    { id: "univ", title: "Demo Technological University", subtitle: "Registrar, awards degrees · univ", icon: "univ" },
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
  return (
    <div className="rise relative w-full rounded-[22px] border border-white/[0.08] bg-[#0a1024]/55 p-6 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:p-7">
      <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#9db4ff]/50 to-transparent" />
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#8ea8ff]">Sign in</p>
      <h2 className="mt-2 font-display text-[34px] leading-none text-white">Choose an identity</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[#8b9bbd]">Demo accounts for institutions, regulators and verifiers.</p>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-[12.5px] text-rose-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{error}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        {GROUPS.map((g) => (
          <fieldset key={g.title}>
            <legend className="mb-1 px-1 text-[10.5px] font-medium uppercase tracking-[0.18em] text-[#6f7fa3]">{g.title}</legend>
            <div className="space-y-0.5">
              {g.items.map((p) => (
                <IdentityCard key={p.id} id={p.id} title={p.title} subtitle={p.subtitle} iconType={p.icon}
                  isSelected={selectedId === p.id} onSelect={onSelectId} />
              ))}
            </div>
          </fieldset>
        ))}

        <div className="border-t border-white/[0.07] pt-3">
          <PasswordField value={password} onChange={onPasswordChange} disabled={busy} />
        </div>

        <button type="submit" disabled={busy}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b6bff] py-3 text-[14px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_30px_-12px_rgba(59,107,255,0.8)] transition-colors duration-200 hover:bg-[#4a78ff] disabled:opacity-60">
          {busy ? "Signing in…" : "Sign in"}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
        </button>

        <p className="text-center text-[11px] leading-relaxed text-[#6f7fa3]">
          Prototype · synthetic data only · APAAR registry, AICTE approval registry, OTP and logins are MOCK
        </p>
      </form>
    </div>
  );
}
