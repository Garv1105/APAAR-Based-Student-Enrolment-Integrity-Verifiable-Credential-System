import React from "react";
import { ArrowRight, Building2, Cog, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import IdentityCard, { type IconKind } from "./IdentityCard";
import PasswordField from "./PasswordField";

interface PersonaConfig {
  id: string;
  title: string;
  subtitle: string;
  iconType: IconKind;
  group: "INSTITUTIONS" | "REGULATORS" | "VERIFICATION";
}

const PERSONAS: PersonaConfig[] = [
  // INSTITUTIONS
  {
    id: "inst-a",
    title: "Demo Institute of Technology",
    subtitle: "Clean data · inst-a",
    iconType: "institution",
    group: "INSTITUTIONS",
  },
  {
    id: "inst-b",
    title: "Sample College of Engineering",
    subtitle: "Messy data · inst-b",
    iconType: "institution",
    group: "INSTITUTIONS",
  },
  {
    id: "inst-c",
    title: "Example School of Management",
    subtitle: "Enrollment spike · inst-c",
    iconType: "institution",
    group: "INSTITUTIONS",
  },
  {
    id: "inst-d",
    title: "Closed Polytechnic",
    subtitle: "Not approved · inst-d",
    iconType: "institution",
    group: "INSTITUTIONS",
  },
  // REGULATORS
  {
    id: "aicte",
    title: "AICTE Monitoring Officer",
    subtitle: "National monitoring · aicte",
    iconType: "aicte",
    group: "REGULATORS",
  },
  {
    id: "auditor",
    title: "Regulator (auditor)",
    subtitle: "Read-only · auditor",
    iconType: "auditor",
    group: "REGULATORS",
  },
  // VERIFICATION
  {
    id: "employer",
    title: "Acme Hiring (verifier)",
    subtitle: "Employer · consent-based",
    iconType: "employer",
    group: "VERIFICATION",
  },
  {
    id: "univ",
    title: "Demo Technological University",
    subtitle: "Registrar · awards degrees · univ",
    iconType: "univ",
    group: "VERIFICATION",
  },
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

export default function IdentityPanel({
  selectedId,
  onSelectId,
  password,
  onPasswordChange,
  onSubmit,
  busy,
  error,
}: IdentityPanelProps) {
  const institutions = PERSONAS.filter((p) => p.group === "INSTITUTIONS");
  const regulators = PERSONAS.filter((p) => p.group === "REGULATORS");
  const verification = PERSONAS.filter((p) => p.group === "VERIFICATION");

  return (
    <div className="relative w-full rounded-[24px] border border-blue-500/20 bg-[#080f24]/85 p-6 sm:p-7 backdrop-blur-2xl shadow-[0_0_50px_rgba(10,20,50,0.8),0_0_30px_rgba(37,99,255,0.12)] ring-1 ring-white/5">
      {/* Header */}
      <div className="space-y-1.5 pb-5">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          Choose your{" "}
          <span className="bg-gradient-to-r from-blue-400 via-sky-400 to-indigo-400 bg-clip-text text-transparent">
            identity
          </span>
        </h2>
        <p className="text-xs sm:text-sm text-[#9fb0d0]">
          Select an institution, regulator or verifier and enter the password to access the portal.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs font-semibold text-rose-300">
          <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={onSubmit} className="space-y-5">
        {/* Section 1: INSTITUTIONS */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <Building2 className="h-3.5 w-3.5 text-sky-400" />
            <span>Institutions</span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {institutions.map((p) => (
              <IdentityCard
                key={p.id}
                id={p.id}
                title={p.title}
                subtitle={p.subtitle}
                iconType={p.iconType}
                isSelected={selectedId === p.id}
                onSelect={onSelectId}
              />
            ))}
          </div>
        </div>

        {/* Section 2: REGULATORS */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <Cog className="h-3.5 w-3.5 text-blue-400" />
            <span>Regulators</span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {regulators.map((p) => (
              <IdentityCard
                key={p.id}
                id={p.id}
                title={p.title}
                subtitle={p.subtitle}
                iconType={p.iconType}
                isSelected={selectedId === p.id}
                onSelect={onSelectId}
              />
            ))}
          </div>
        </div>

        {/* Section 3: VERIFICATION */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <Shield className="h-3.5 w-3.5 text-cyan-400" />
            <span>Verification</span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {verification.map((p) => (
              <IdentityCard
                key={p.id}
                id={p.id}
                title={p.title}
                subtitle={p.subtitle}
                iconType={p.iconType}
                isSelected={selectedId === p.id}
                onSelect={onSelectId}
              />
            ))}
          </div>
        </div>

        {/* Password Field */}
        <div className="pt-1">
          <PasswordField
            value={password}
            onChange={onPasswordChange}
            disabled={busy}
          />
        </div>

        {/* Full-width Access Portal Button */}
        <div>
          <button
            type="submit"
            disabled={busy}
            className="group relative flex w-full items-center justify-center gap-2 rounded-[14px] bg-gradient-to-r from-[#2563ff] via-[#4f46e5] to-[#7c5cff] py-3.5 text-sm font-bold text-white shadow-[0_4px_25px_rgba(37,99,255,0.4)] transition-all hover:shadow-[0_6px_35px_rgba(37,99,255,0.65)] hover:brightness-110 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            <span>{busy ? "Connecting to Ledger…" : "Access Portal"}</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        {/* Bottom Disclaimer */}
        <div className="flex items-center justify-center gap-1.5 pt-1 text-center text-[10px] sm:text-[11px] text-slate-400 font-normal">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-blue-400/80" />
          <span>
            Prototype · Synthetic data only · APAAR registry, AICTE approval registry, OTP and logins are MOCK
          </span>
        </div>
      </form>
    </div>
  );
}
