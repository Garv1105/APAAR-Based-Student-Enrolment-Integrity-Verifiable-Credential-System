import { useState } from "react";
import { Fingerprint } from "lucide-react";
import { activateAndRegister, ApiError, passkeyLogin, studentLogin, type Session } from "../api/client";
import { passkeyError, passkeysSupported } from "../webauthn";

const field = "w-full rounded-xl border border-white/[0.09] bg-[#0b0f14]/70 px-3.5 py-2.5 text-sm text-white focus:border-[#d4af37]/60 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/20";
const label = "mb-1.5 block text-[10.5px] font-medium uppercase tracking-[0.18em] text-[#8a909a]";

export function StudentSignIn({ onLogin, demo }: { onLogin: (s: Session) => void; demo: boolean }) {
  const [apaar, setApaar] = useState("");
  const [code, setCode] = useState("");
  const [dob, setDob] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const supported = passkeysSupported();

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (err) {
      setError(passkeyError(err) ?? (err instanceof ApiError ? (err.status === 401 ? "Sign-in failed. Check the details and try again." : err.text) : "The service is unreachable. Try again shortly."));
    } finally { setBusy(false); }
  }
  const activate = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const setup = await activateAndRegister(apaar.replace(/[\s-]/g, ""), code);
      setNote(`Passkey registered for the ${setup.kind}.` + (setup.reissue ? " It can approve consent after 24 hours (reissued code)." : "") + " Now sign in with it.");
      setCode("");
    });
  };
  const dobSignIn = (e: React.FormEvent) => { e.preventDefault(); run(async () => onLogin(await studentLogin(apaar.replace(/[\s-]/g, ""), dob))); };

  return (
    <div className="space-y-5">
      {supported ? (
        <button type="button" disabled={busy} onClick={() => run(async () => onLogin(await passkeyLogin()))}
          className="flex w-full items-center justify-center gap-2 rounded-2xl btn-gold py-3.5 font-manrope text-[15px] font-bold transition-opacity hover:opacity-95 disabled:opacity-50">
          <Fingerprint className="h-4 w-4" aria-hidden /> {busy ? "Waiting for passkey…" : "Sign in with passkey"}
        </button>
      ) : <p className="text-xs text-rose-300">This browser doesn't support passkeys.</p>}
      <p className="text-xs text-[#b8bec8]">Fingerprint, face or device PIN. Nothing to type, no password.</p>

      <form onSubmit={activate} className="space-y-3 border-t border-white/[0.07] pt-4">
        <p className="text-xs text-slate-300">First time? Use the one-time activation code from your institution to register a passkey.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className={label}>APAAR ID</span>
            <input value={apaar} onChange={(e) => setApaar(e.target.value)} required inputMode="numeric" placeholder="12 digits" className={`${field} font-mono`} /></label>
          <label className="block"><span className={label}>Activation code</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="XXXX-XXXX-XX" autoComplete="one-time-code" className={`${field} font-mono uppercase`} /></label>
        </div>
        <button type="submit" disabled={busy || !supported}
          className="w-full rounded-[14px] border border-[#d4af37]/40 py-2.5 text-sm font-semibold text-[#f1d488] transition-colors hover:bg-[#d4af37]/10 disabled:opacity-50">
          Activate and register passkey
        </button>
      </form>

      {demo && (
        <details className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-amber-200">Demo fallback: date-of-birth sign-in <span className="ml-1 rounded bg-amber-500/20 px-1">MOCK · DEMO_MODE</span></summary>
          <p className="mt-2 text-xs text-amber-100/80">Not authentication: a date of birth isn't a secret. Enabled only because the server runs in DEMO_MODE.</p>
          <form onSubmit={dobSignIn} className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block"><span className={label}>APAAR ID</span>
              <input value={apaar} onChange={(e) => setApaar(e.target.value)} required inputMode="numeric" placeholder="12 digits" className={`${field} font-mono`} /></label>
            <label className="block"><span className={label}>Date of birth</span>
              <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required className={field} /></label>
            <button type="submit" disabled={busy} className="rounded-[14px] border border-amber-500/40 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/10 disabled:opacity-50 sm:col-span-2">
              {busy ? "Signing in…" : "Sign in (MOCK)"}
            </button>
          </form>
        </details>
      )}

      <div aria-live="polite">
        {note && <p className="text-sm text-emerald-300" role="status">{note}</p>}
        {error && <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs font-semibold text-rose-300">{error}</div>}
      </div>
    </div>
  );
}
