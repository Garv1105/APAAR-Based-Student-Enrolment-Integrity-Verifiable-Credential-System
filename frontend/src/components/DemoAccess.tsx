import { useState } from "react";
import { ArrowRight, Building2, FileWarning, GraduationCap, Landmark, BadgeCheck, UserRound, type LucideIcon } from "lucide-react";
import { ApiError, login, studentLogin, type Session } from "../api/client";

const ACCOUNTS: { key: string; tab: string; icon: LucideIcon; role: string; name: string; shows: string; go: () => Promise<Session> }[] = [
  { key: "inst-a", tab: "institution", icon: Building2, role: "Institution · clean data", name: "Kalyani Devi Hegde Institute of Technology, Hubballi",
    shows: "Upload, seats vs intake, data quality, student records and certificates", go: () => login("inst-a", "demo") },
  { key: "inst-b", tab: "institution", icon: FileWarning, role: "Institution · messy data", name: "Anandrao Kulkarni College of Engineering, Solapur",
    shows: "Rejected rows, every error type, excess seats, AI fix checklist, 13 languages", go: () => login("inst-b", "demo") },
  { key: "aicte", tab: "aicte", icon: Landmark, role: "AICTE officer", name: "Monitoring & Evaluation Cell, AICTE",
    shows: "National monitoring, duplicate cases, inspection priorities, shared students, reports", go: () => login("aicte", "demo") },
  { key: "univ", tab: "university", icon: GraduationCap, role: "University registrar", name: "Narmada Valley Technological University",
    shows: "Award degree credentials to students who completed", go: () => login("univ", "demo") },
  { key: "employer", tab: "verifier", icon: BadgeCheck, role: "Verifier (employer)", name: "Kaveri Talent Solutions Pvt Ltd",
    shows: "Ask a student for consent, then verify their credential", go: () => login("employer", "demo") },
  { key: "student", tab: "student", icon: UserRound, role: "Student", name: "Asha Joshi",
    shows: "Credential wallet, consent inbox, certificate with QR, who accessed my data", go: () => studentLogin("328865551724", "2006-11-05") },
];

export default function DemoAccess({ tab, onLogin }: { tab: string; onLogin: (s: Session) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = ACCOUNTS.filter((a) => a.tab === tab);
  if (!list.length) return null;
  async function enter(a: (typeof ACCOUNTS)[number]) {
    setBusy(a.key);
    setError(null);
    try { onLogin(await a.go()); }
    catch (e) { setError(e instanceof ApiError ? e.text : "The service is unreachable. Try again shortly."); }
    finally { setBusy(null); }
  }
  return (
    <section aria-label="Demo access" className="mb-5 rounded-2xl border border-[#d4af37]/30 bg-[#d4af37]/[0.05] p-3">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e3c05a]">Demo access · one click, synthetic data</p>
      <ul className="mt-2 space-y-2">
        {list.map((a) => (
          <li key={a.key}>
            <button type="button" onClick={() => enter(a)} disabled={busy !== null}
              className="group flex w-full items-start gap-3 rounded-xl border border-white/[0.08] bg-black/25 p-3 text-left transition-colors hover:border-[#d4af37]/50 hover:bg-[#d4af37]/[0.07] disabled:opacity-60">
              <a.icon className="mt-0.5 h-5 w-5 shrink-0 text-[#e3c05a]" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold leading-snug text-white">{a.name}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-[#a3a9b3]">{a.role}: {a.shows}</span>
              </span>
              <span className="mt-0.5 shrink-0 text-[12.5px] font-semibold text-[#f1d488]">
                {busy === a.key ? "Opening…" : <span className="inline-flex items-center gap-1">Enter <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden /></span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 px-1 text-[13px] text-rose-200">{error}</p>}
    </section>
  );
}
