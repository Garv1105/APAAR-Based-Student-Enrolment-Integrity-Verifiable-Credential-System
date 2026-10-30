import { useState, type ReactNode } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { ApiError, sendJson, type S } from "../api/client";
import AccountSearch, { type Account } from "../components/AccountSearch";
import PasswordField from "../components/PasswordField";

const input = "w-full rounded-2xl border border-white/[0.09] bg-black/25 px-4 py-3 text-[14.5px] text-white placeholder:text-[#6b7280] focus:border-[#d4af37]/60 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/20";
const lbl = "mb-1.5 block px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a3a9b3]";
const primary = "flex w-full items-center justify-center gap-2 rounded-2xl btn-gold py-3.5 font-manrope text-[15.5px] font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-60";

function Page({ eyebrow, title, intro, aside, children }: { eyebrow: string; title: string; intro: ReactNode; aside: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[1120px] grid-cols-1 items-start gap-10 py-6 lg:grid-cols-[minmax(0,1fr)_520px] lg:py-12">
      <section className="rise lg:pt-6">
        <p className="text-[12px] font-semibold tracking-[0.14em] text-[#e3c05a]">{eyebrow}</p>
        <h1 className="mt-3 font-manrope text-[42px] font-extrabold leading-[1.04] tracking-[-0.035em] text-white">{title}</h1>
        <div className="mt-4 max-w-[460px] text-[15.5px] leading-[1.7] text-[#b8bec8]">{intro}</div>
        <div className="mt-8 max-w-[460px] border-t border-white/[0.08] pt-6 text-[14px] leading-relaxed text-[#b8bec8]">{aside}</div>
      </section>
      <div className="rise relative w-full rounded-[28px] border border-white/[0.09] bg-[#11161d]/60 p-6 shadow-[0_50px_100px_-40px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl sm:p-7"
        style={{ ["--d" as string]: "120ms" }}>
        {children}
      </div>
    </div>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-[13px] text-rose-200">
    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{children}</div>;
}

function Done({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="status" className="text-center">
      <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-300" aria-hidden />
      <h2 className="mt-4 font-manrope text-[22px] font-extrabold text-white">{title}</h2>
      <div className="mt-2 text-[14px] leading-relaxed text-[#b8bec8]">{children}</div>
    </div>
  );
}

const KINDS = [["institution", "Institution"], ["university", "University"], ["verifier", "Verifier"]] as const;
type Kind = (typeof KINDS)[number][0];

export function Activate() {
  const [kind, setKind] = useState<Kind>("institution");
  const [account, setAccount] = useState<Account | null>(null);
  const [userId, setUserId] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = kind === "verifier" ? userId.trim() : account?.login_id;
    if (!id) return setError(kind === "verifier" ? "Enter the account ID from your approval." : "Choose your institution from the list.");
    if (pw.length < 12) return setError("Use at least 12 characters for the password.");
    if (pw !== pw2) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await sendJson<S["AccountActivateOut"]>("/v1/auth/activate-account", "POST", { user_id: id, code, password: pw });
      setDone(id);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 429 ? "Too many attempts. Wait 15 minutes and try again." : err.status === 401
        ? "That code doesn't match this account, has expired or was already used. Ask AICTE for a new one." : err.text)
        : "The service is unreachable. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page eyebrow="ACTIVATE ACCOUNT" title="Set up your account."
      intro="AICTE sends every approved institution, university and verifier a one-time activation code. Use it once to set your password; it expires after 7 days."
      aside={<ul className="space-y-3">
        <li>Lost the code or forgot your password? AICTE can issue a new code, which cancels the old one.</li>
        <li>Students and guardians don't need this: they <a href="#/signin?as=student" className="font-semibold text-[#f1d488] underline decoration-white/20 underline-offset-2 hover:text-white">register a passkey</a> with the code from their institution.</li>
      </ul>}>
      {done ? (
        <Done title="Account activated">
          <p>Your password is set for <span className="font-mono text-white">{done}</span>.</p>
          <a href={`#/signin?as=${kind}`} className={`${primary} mt-6`}>Sign in now</a>
        </Done>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div role="radiogroup" aria-label="Account type" className="grid grid-cols-3 gap-1 rounded-2xl border border-white/[0.07] bg-black/25 p-1">
            {KINDS.map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setAccount(null); setError(null); }}
                className={`rounded-xl py-2.5 font-manrope text-[13px] font-semibold transition-colors ${kind === k ? "bg-white/[0.1] text-white" : "text-[#a3a9b3] hover:text-white"}`}>
                {label}
              </button>
            ))}
          </div>
          {kind === "verifier" ? (
            <div>
              <label htmlFor="act-user" className={lbl}>Account ID</label>
              <input id="act-user" value={userId} onChange={(e) => setUserId(e.target.value)} className={`${input} font-mono`} spellCheck={false}
                placeholder="From your approval message" autoComplete="username" />
            </div>
          ) : (
            <AccountSearch key={kind} kind={kind} selected={account} onSelect={setAccount}
              label={kind === "institution" ? "Institution" : "University"} placeholder={kind === "institution" ? "Name, AICTE id or city" : "University name"} />
          )}
          <div>
            <label htmlFor="act-code" className={lbl}>Activation code</label>
            <input id="act-code" value={code} onChange={(e) => setCode(e.target.value)} required placeholder="XXXX-XXXX-XX" autoComplete="one-time-code"
              className={`${input} font-mono uppercase tracking-[0.12em]`} />
          </div>
          <PasswordField id="act-pw" label="New password (12+ characters)" value={pw} onChange={setPw} disabled={busy} autoComplete="new-password" />
          <PasswordField id="act-pw2" label="Repeat password" value={pw2} onChange={setPw2} disabled={busy} autoComplete="new-password" />
          {error && <Alert>{error}</Alert>}
          <button type="submit" disabled={busy} className={primary}>{busy ? "Activating…" : "Activate account"}</button>
        </form>
      )}
    </Page>
  );
}

export function RequestAccess() {
  const [f, setF] = useState({ organisation: "", contact_name: "", contact_email: "", purpose: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<number | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setRef((await sendJson<S["AccessRequestCreated"]>("/v1/access-requests", "POST", f)).id);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 422 ? "Check the fields: organisation (3+ characters), a valid email and a purpose of at least 10 characters."
        : err.status === 429 ? "Too many requests from this network. Try again later." : err.text) : "The service is unreachable. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page eyebrow="VERIFIER ACCESS" title="Verify credentials, with consent."
      intro="Employers, background-check agencies and admission offices can check a student's credentials once the student approves each request. AICTE reviews every organisation before it gets an account."
      aside={<ol className="list-decimal space-y-2 pl-5">
        <li>Tell us who you are and why you need to verify credentials.</li>
        <li>AICTE reviews the request and, once approved, sends your account ID and a one-time activation code.</li>
        <li>Activate the account, then request checks. Each one needs the student's approval.</li>
      </ol>}>
      {ref !== null ? (
        <Done title="Request received">
          <p>Reference <span className="font-mono text-white">#{ref}</span>. AICTE will review it and contact you at the email you gave.</p>
          <p className="mt-3 text-[12px] text-[#8f959f]">Prototype: no email is sent (MOCK). The reviewing officer sees the activation code on screen.</p>
          <a href="#/" className="mt-6 inline-block text-[14px] font-semibold text-[#f1d488] underline decoration-white/20 underline-offset-2 hover:text-white">Back to home</a>
        </Done>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div><label htmlFor="ra-org" className={lbl}>Organisation</label>
            <input id="ra-org" value={f.organisation} onChange={set("organisation")} required minLength={3} maxLength={150} autoComplete="organization" className={input} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="ra-name" className={lbl}>Contact name</label>
              <input id="ra-name" value={f.contact_name} onChange={set("contact_name")} required minLength={2} maxLength={100} autoComplete="name" className={input} /></div>
            <div><label htmlFor="ra-email" className={lbl}>Work email</label>
              <input id="ra-email" type="email" value={f.contact_email} onChange={set("contact_email")} required maxLength={254} autoComplete="email" className={input} /></div>
          </div>
          <div><label htmlFor="ra-purpose" className={lbl}>Why do you need to verify credentials?</label>
            <textarea id="ra-purpose" value={f.purpose} onChange={set("purpose")} required minLength={10} maxLength={500} rows={4}
              placeholder="e.g. We verify degrees of candidates before issuing offer letters." className={`${input} resize-y`} /></div>
          <p className="text-[12px] text-[#8f959f]">Your name and email are stored encrypted and seen only by AICTE reviewers.</p>
          {error && <Alert>{error}</Alert>}
          <button type="submit" disabled={busy} className={primary}>{busy ? "Sending…" : "Send request"}</button>
        </form>
      )}
    </Page>
  );
}
