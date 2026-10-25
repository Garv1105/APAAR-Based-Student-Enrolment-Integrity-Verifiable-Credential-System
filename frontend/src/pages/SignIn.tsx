import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { ApiError, getJson, login, type S, type Session } from "../api/client";
import AccountSearch, { type Account } from "../components/AccountSearch";
import DemoAccess from "../components/DemoAccess";
import PasswordField from "../components/PasswordField";
import { StudentSignIn } from "./StudentSignIn";

const ROLES = [
  { key: "institution", label: "Institution" },
  { key: "university", label: "University" },
  { key: "aicte", label: "AICTE" },
  { key: "verifier", label: "Verifier" },
  { key: "student", label: "Student" },
] as const;
type RoleKey = (typeof ROLES)[number]["key"];

const INTRO: Record<RoleKey, string> = {
  institution: "Find your institution by name, AICTE id or city, then enter your account password.",
  university: "Registrars sign in to award degree credentials for affiliated colleges.",
  aicte: "AICTE officers and regulators sign in with their official account.",
  verifier: "Employers and agencies approved by AICTE sign in with their organisation account.",
  student: "Students and guardians sign in with a passkey: fingerprint, face or device PIN.",
};

const input = "w-full rounded-2xl border border-white/[0.09] bg-black/25 px-4 py-3 text-[14.5px] text-white placeholder:text-[#6b7280] focus:border-[#d4af37]/60 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/20";
const lbl = "mb-1.5 block px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a3a9b3]";

export default function SignIn({ onLogin, demo, initialRole }: { onLogin: (s: Session) => void; demo: boolean; initialRole: string | null }) {
  const [role, setRole] = useState<RoleKey>(() => (ROLES.some((r) => r.key === initialRole) ? initialRole as RoleKey : "institution"));
  const [states, setStates] = useState<string[]>([]);
  const [state, setState] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJson<S["PublicStats"]>("/v1/public/stats").then((s) => setStates(s.states.filter((x) => x.reporting > 0).map((x) => x.state))).catch(() => {});
  }, []);
  useEffect(() => { setAccount(null); setUserId(""); setError(null); }, [role]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = role === "institution" || role === "university" ? account?.login_id : userId.trim();
    if (!id) { setError(role === "institution" || role === "university" ? "Choose your institution from the list." : "Enter your account ID."); return; }
    setBusy(true);
    setError(null);
    try {
      onLogin(await login(id, password));
    } catch (err) {
      setError(err instanceof ApiError
        ? err.status === 401 ? "That account and password don't match. New account? Activate it first with your AICTE code."
          : err.status === 429 ? "Too many attempts. Wait a few minutes and try again." : err.text
        : "The service is unreachable. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1120px] grid-cols-1 items-start gap-10 py-6 lg:grid-cols-[minmax(0,1fr)_500px] lg:py-12">
      <section className="rise lg:pt-6">
        <p className="text-[12px] font-semibold tracking-[0.14em] text-[#e3c05a]">SIGN IN</p>
        <h1 className="mt-3 font-manrope text-[44px] font-extrabold leading-[1.02] tracking-[-0.035em] text-white">Welcome back.</h1>
        <p className="mt-4 max-w-[440px] text-[15.5px] leading-[1.7] text-[#b8bec8]">{INTRO[role]}</p>
        <ul className="mt-8 max-w-[440px] space-y-3 border-t border-white/[0.08] pt-6 text-[14px] text-[#b8bec8]">
          <li>New institution, university or verifier account? <a href="#/activate" className="font-semibold text-[#f1d488] underline decoration-white/20 underline-offset-2 hover:text-white">Activate it with your AICTE code</a>.</li>
          <li>Organisation that needs to verify credentials? <a href="#/request-access" className="font-semibold text-[#f1d488] underline decoration-white/20 underline-offset-2 hover:text-white">Request verifier access</a>.</li>
          <li>Forgot your password? AICTE can issue a new activation code for your account.</li>
        </ul>
      </section>

      <div className="rise relative w-full overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#11161d]/60 p-6 shadow-[0_50px_100px_-40px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl sm:p-7"
        style={{ ["--d" as string]: "120ms" }}>
        <span aria-hidden className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#d4af37]/60 to-transparent" />
        <div role="tablist" aria-label="Sign in as" className="grid grid-cols-5 gap-1 rounded-2xl border border-white/[0.07] bg-black/25 p-1">
          {ROLES.map((r) => (
            <button key={r.key} type="button" role="tab" aria-selected={role === r.key} onClick={() => setRole(r.key)}
              className={`relative rounded-xl px-1 py-2.5 font-manrope text-[12.5px] font-semibold transition-colors ${role === r.key ? "text-white" : "text-[#a3a9b3] hover:text-white"}`}>
              {role === r.key && <motion.span layoutId="signin-tab" className="absolute inset-0 rounded-xl bg-gradient-to-b from-white/[0.12] to-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="relative">{r.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-6" role="tabpanel">
          {demo && <DemoAccess key={role} tab={role} onLogin={onLogin} />}
          {role === "student" ? <StudentSignIn onLogin={onLogin} demo={demo} /> : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              {role === "institution" && (
                <div>
                  <label htmlFor="state-filter" className={lbl}>State</label>
                  <select id="state-filter" value={state} onChange={(e) => { setState(e.target.value); setAccount(null); }}
                    className={`${input} appearance-none`}>
                    <option value="">All states</option>
                    {states.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              {(role === "institution" || role === "university") ? (
                <AccountSearch key={role} kind={role} state={state || undefined} selected={account} onSelect={setAccount}
                  label={role === "institution" ? "Institution" : "University"}
                  placeholder={role === "institution" ? "Name, AICTE id or city" : "University name"} />
              ) : (
                <div>
                  <label htmlFor="user-id" className={lbl}>{role === "aicte" ? "Official account ID" : "Organisation account ID"}</label>
                  <input id="user-id" value={userId} onChange={(e) => setUserId(e.target.value)} autoComplete="username" spellCheck={false}
                    placeholder={role === "aicte" ? "Issued by AICTE" : "From your AICTE approval"} className={`${input} font-mono`} />
                </div>
              )}
              {account && <p className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5 text-[12.5px] text-[#b8bec8]">
                Signing in to <span className="font-semibold text-white">{account.name}</span>{account.state ? `, ${account.state}` : ""}</p>}
              <PasswordField value={password} onChange={setPassword} disabled={busy} demo={demo} />

              {error && (
                <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-[13px] text-rose-200">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{error}
                </div>
              )}
              <button type="submit" disabled={busy}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl btn-gold py-3.5 font-manrope text-[15.5px] font-bold transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-60">
                <span>{busy ? "Signing in…" : "Sign in"}</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
