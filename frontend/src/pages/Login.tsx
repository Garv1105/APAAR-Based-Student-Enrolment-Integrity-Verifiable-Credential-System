import { useEffect, useState } from "react";
import { activateAndRegister, ApiError, getJson, login, passkeyLogin, studentLogin, type S, type Session } from "../api/client";
import { passkeyError, passkeysSupported } from "../webauthn";
import { Button, ErrorNote } from "../ui";

// Seeded MOCK identities (backend/data/seed/registry.json). Shown so judges can switch roles quickly.
const DEMO_USERS = [
  { id: "inst-a", label: "Demo Institute of Technology", sub: "Institution · clean data", group: "Institutions" },
  { id: "inst-b", label: "Sample College of Engineering", sub: "Institution · messy data", group: "Institutions" },
  { id: "inst-c", label: "Example School of Management", sub: "Institution · enrolment spike", group: "Institutions" },
  { id: "inst-d", label: "Closed Polytechnic", sub: "Institution · not approved", group: "Institutions" },
  { id: "aicte", label: "AICTE Monitoring Officer", sub: "National monitoring", group: "Regulators" },
  { id: "auditor", label: "Regulator (auditor)", sub: "Read-only", group: "Regulators" },
  { id: "employer", label: "Acme Hiring (verifier)", sub: "Employer · consent-based checks", group: "Verification" },
  { id: "univ", label: "Demo Technological University", sub: "Registrar · awards degrees", group: "Verification" },
];

export default function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [userId, setUserId] = useState("inst-a");
  const [password, setPassword] = useState("demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await login(userId, password));
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 401 ? "Wrong user or password." : err.text) : "Cannot reach the API. Is the backend running on :8000?");
    } finally {
      setBusy(false);
    }
  }

  const groups = [...new Set(DEMO_USERS.map((u) => u.group))];
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-600">Choose a demo identity. Every account uses the password <code className="rounded bg-slate-100 px-1">demo</code>.</p>
      <form onSubmit={submit} className="mt-6 space-y-6">
        {groups.map((g) => (
          <fieldset key={g}>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {DEMO_USERS.filter((u) => u.group === g).map((u) => (
                <label key={u.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-3 shadow-sm transition-colors ${userId === u.id ? "border-brand-600 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300"}`}>
                  <input type="radio" name="user" value={u.id} checked={userId === u.id} onChange={() => setUserId(u.id)} className="mt-1 accent-brand-600" />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">{u.label}</span>
                    <span className="block text-xs text-slate-500">{u.sub} · <code>{u.id}</code></span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-sm font-medium text-slate-700">Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
              className="mt-1 w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          </label>
          <Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
      </form>
      <StudentSignIn onLogin={onLogin} />
    </div>
  );
}

function StudentSignIn({ onLogin }: { onLogin: (s: Session) => void }) {
  const [demo, setDemo] = useState(false);
  useEffect(() => { getJson<S["AuthConfig"]>("/v1/auth/config").then((c) => setDemo(c.demo_mode)).catch(() => {}); }, []);
  return (
    <div className="mt-8 space-y-4">
      <PasskeySignIn onLogin={onLogin} />
      {demo && <DobSignIn onLogin={onLogin} />}
    </div>
  );
}

function PasskeySignIn({ onLogin }: { onLogin: (s: Session) => void }) {
  const [apaar, setApaar] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (err) {
      setError(passkeyError(err) ?? (err instanceof ApiError ? err.text : "Cannot reach the API."));
    } finally { setBusy(false); }
  }
  const signIn = () => run(async () => onLogin(await passkeyLogin()));
  const activate = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const setup = await activateAndRegister(apaar.replace(/[\s-]/g, ""), code);
      setNote(`Passkey registered for the ${setup.kind}.` + (setup.reissue ? " It can approve consent after 24 hours (reissued code)." : "")
        + " Now sign in with it.");
      setCode("");
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold">Students and guardians</h2>
      <p className="mt-1 text-xs text-slate-500">Sign in with your passkey (fingerprint, face or device PIN). No password, nothing to type.</p>
      {passkeysSupported() ? (
        <Button className="mt-3" disabled={busy} onClick={signIn}>{busy ? "Waiting for passkey…" : "Sign in with passkey"}</Button>
      ) : <p className="mt-3 text-xs text-err">This browser doesn't support passkeys.</p>}
      <form onSubmit={activate} className="mt-4 border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-600">First time? Use the one-time activation code from your institution to register a passkey.</p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-slate-700">APAAR ID</span>
            <input value={apaar} onChange={(e) => setApaar(e.target.value)} required inputMode="numeric" placeholder="12 digits"
              className="mt-1 w-52 rounded-lg border border-slate-300 px-3 py-1.5 font-mono" />
          </label>
          <label className="text-sm">
            <span className="block text-slate-700">Activation code</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="XXXX-XXXX-XX" autoComplete="one-time-code"
              className="mt-1 w-40 rounded-lg border border-slate-300 px-3 py-1.5 font-mono uppercase" />
          </label>
          <Button type="submit" variant="secondary" disabled={busy || !passkeysSupported()}>Activate and register passkey</Button>
        </div>
      </form>
      {note && <p className="mt-3 text-sm text-ok" role="status">{note}</p>}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </div>
  );
}

/** DEMO_MODE only: the old MOCK APAAR + date-of-birth sign-in. */
function DobSignIn({ onLogin }: { onLogin: (s: Session) => void }) {
  const [apaar, setApaar] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await studentLogin(apaar.replace(/[\s-]/g, ""), dob));
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 401 ? "APAAR ID and date of birth don't match." : err.text) : "Cannot reach the API.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h2 className="text-sm font-semibold">Demo fallback: date-of-birth sign-in <span className="rounded bg-amber-200 px-1 text-xs">MOCK · DEMO_MODE</span></h2>
      <p className="mt-1 text-xs text-slate-600">Not authentication: a date of birth isn't a secret. Enabled only because the server runs in DEMO_MODE.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-slate-700">APAAR ID</span>
          <input value={apaar} onChange={(e) => setApaar(e.target.value)} required inputMode="numeric" placeholder="12 digits"
            className="mt-1 w-52 rounded-lg border border-slate-300 px-3 py-1.5 font-mono" />
        </label>
        <label className="text-sm">
          <span className="block text-slate-700">Date of birth</span>
          <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5" />
        </label>
        <Button type="submit" variant="secondary" disabled={busy}>{busy ? "Signing in…" : "Sign in (MOCK)"}</Button>
      </div>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </form>
  );
}
