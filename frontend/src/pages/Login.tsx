import { useEffect, useState } from "react";
import { Fingerprint, X } from "lucide-react";
import { activateAndRegister, ApiError, getJson, login, passkeyLogin, studentLogin, type S, type Session } from "../api/client";
import { passkeyError, passkeysSupported } from "../webauthn";
import Hero from "../components/Hero";
import IdentityPanel from "../components/IdentityPanel";
import IndiaMap from "../components/IndiaMap";
import Starfield from "../components/Starfield";
import Navbar from "../components/Navbar";

export default function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [selectedId, setSelectedId] = useState("inst-a");
  const [password, setPassword] = useState("demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showStudentModal, setShowStudentModal] = useState(false);

  async function handlePortalLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await login(selectedId, password));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 401
            ? "Authentication rejected: invalid credentials."
            : err.text
          : "Backend API unavailable on :8000. Start uvicorn backend service."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#040816] font-inter text-white selection:bg-[#3b6bff]/60 selection:text-white">
      {/* living background: base light, drifting aurora bands, faint grid, particles */}
      <div aria-hidden className="ambient-blue pointer-events-none fixed inset-0 z-0" />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="aurora-1 absolute -left-[10%] top-[-20%] h-[70vh] w-[70vw] rounded-full bg-[radial-gradient(closest-side,rgba(30,58,138,0.26),transparent)] blur-3xl" />
        <div className="aurora-2 absolute -right-[15%] bottom-[-25%] h-[75vh] w-[65vw] rounded-full bg-[radial-gradient(closest-side,rgba(49,46,129,0.28),transparent)] blur-3xl" />
        <div className="aurora-1 absolute left-[35%] top-[30%] h-[45vh] w-[40vw] rounded-full bg-[radial-gradient(closest-side,rgba(37,99,235,0.05),transparent)] blur-3xl" style={{ animationDelay: "-9s" }} />
      </div>
      <div aria-hidden className="ambient-grid pointer-events-none fixed inset-0 z-0 opacity-60" />
      <Starfield />

      <Navbar />

      <main className="relative z-10 mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-12 px-5 pb-14 pt-4 sm:px-8 lg:min-h-[calc(100vh-80px)] lg:grid-cols-[minmax(0,1fr)_450px] lg:gap-10 xl:grid-cols-[400px_minmax(0,1fr)_450px] xl:gap-4">
        <div className="relative min-w-0">
          <Hero onOpenStudentModal={() => setShowStudentModal(true)} />
        </div>
        {/* map gets its own column on wide screens */}
        <div className="pointer-events-none relative hidden min-w-0 xl:block">
          <IndiaMap className="mx-auto w-full max-w-[600px] scale-[1.14]" />
        </div>
        <div className="relative">
          <IdentityPanel selectedId={selectedId} onSelectId={setSelectedId} password={password} onPasswordChange={setPassword}
            onSubmit={handlePortalLogin} busy={busy} error={error} />
        </div>
      </main>
      <p className="relative z-10 mx-auto max-w-[1440px] px-5 pb-6 text-[10.5px] text-[#55607e] sm:px-8">
        Map: India boundaries by <a className="underline decoration-white/20 underline-offset-2 hover:text-[#8b9bbd]" href="https://github.com/datameet/maps" target="_blank" rel="noreferrer">DataMeet</a> (CC BY 4.0), simplified. Illustration only.
      </p>

      {/* Student Login Modal */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#02040b]/75 p-4 backdrop-blur-md"
          onKeyDown={(e) => e.key === "Escape" && setShowStudentModal(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="student-signin-title"
            className="rise relative max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-[22px] border border-white/[0.09] bg-[#0a1024]/85 p-6 text-white shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:p-7">
            <button
              autoFocus
              onClick={() => setShowStudentModal(false)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-[#8b9bbd] transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>

            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#8ea8ff]">Passkey sign-in</p>
            <h3 id="student-signin-title" className="mt-2 font-manrope text-[28px] font-extrabold tracking-[-0.03em] text-white">Students and guardians</h3>
            <p className="mt-2 text-[13px] text-[#8b9bbd]">Fingerprint, face or device PIN. No password.</p>

            <StudentSignIn onLogin={onLogin} />
          </div>
        </div>
      )}
    </div>
  );
}

const field = "w-full rounded-xl border border-white/[0.09] bg-[#060b1c]/70 px-3.5 py-2.5 text-sm text-white focus:border-[#7aa2ff]/60 focus:outline-none focus:ring-2 focus:ring-[#7aa2ff]/20";
const label = "mb-1.5 block text-[10.5px] font-medium uppercase tracking-[0.18em] text-[#6f7fa3]";

/** Students and guardians: passkey sign-in, first-time activation, and (DEMO_MODE only) the MOCK date-of-birth fallback. */
function StudentSignIn({ onLogin }: { onLogin: (s: Session) => void }) {
  const [demo, setDemo] = useState(false);
  const [apaar, setApaar] = useState("");
  const [code, setCode] = useState("");
  const [dob, setDob] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const supported = passkeysSupported();
  useEffect(() => { getJson<S["AuthConfig"]>("/v1/auth/config").then((c) => setDemo(c.demo_mode)).catch(() => {}); }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (err) {
      setError(passkeyError(err) ?? (err instanceof ApiError ? (err.status === 401 ? "Sign-in failed. Check the details and try again." : err.text) : "Cannot reach the API. Is the backend running on :8000?"));
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
    <div className="mt-5 space-y-5">
      {supported ? (
        <button type="button" disabled={busy} onClick={() => run(async () => onLogin(await passkeyLogin()))}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3b6bff] py-3 text-[14px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition-colors hover:bg-[#4a78ff] disabled:opacity-50">
          <Fingerprint className="h-4 w-4" aria-hidden /> {busy ? "Waiting for passkey…" : "Sign in with passkey"}
        </button>
      ) : <p className="text-xs text-rose-300">This browser doesn't support passkeys.</p>}
      <p className="text-xs text-[#9fb0d0]">Fingerprint, face or device PIN. Nothing to type.</p>

      <form onSubmit={activate} className="space-y-3 border-t border-slate-800 pt-4">
        <p className="text-xs text-slate-300">First time? Use the one-time activation code from your institution to register a passkey.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className={label}>APAAR ID</span>
            <input value={apaar} onChange={(e) => setApaar(e.target.value)} required inputMode="numeric" placeholder="12 digits" className={`${field} font-mono`} /></label>
          <label className="block"><span className={label}>Activation code</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="XXXX-XXXX-XX" autoComplete="one-time-code" className={`${field} font-mono uppercase`} /></label>
        </div>
        <button type="submit" disabled={busy || !supported}
          className="w-full rounded-[14px] border border-blue-500/40 py-2.5 text-sm font-semibold text-blue-200 transition-colors hover:bg-blue-500/10 disabled:opacity-50">
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
