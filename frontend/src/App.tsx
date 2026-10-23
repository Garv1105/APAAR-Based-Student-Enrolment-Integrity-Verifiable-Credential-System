import { useEffect, useState } from "react";
import { loadSession, saveSession, setUnauthorizedHandler, type Role, type Session } from "./api/client";
import AicteHome from "./pages/Aicte";
import BatchDetail from "./pages/Batch";
import InstitutionHome from "./pages/Institution";
import Login from "./pages/Login";
import { Card, go } from "./ui";

/** Tiny hash router: #/inst, #/inst/batch/12, #/aicte. */
function useHash() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || "/");
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

const HOME: Record<Role, string> = {
  institution_admin: "/inst", aicte_officer: "/aicte", auditor: "/aicte",
  verifier: "/planned", university_registrar: "/planned", student: "/planned",
};
const ROLE_LABEL: Record<Role, string> = {
  institution_admin: "Institution", aicte_officer: "AICTE officer", auditor: "Auditor (read-only)",
  verifier: "Verifier", university_registrar: "University registrar", student: "Student",
};

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const hash = useHash();

  const logout = () => { saveSession(null); setSession(null); go("/"); };
  useEffect(() => setUnauthorizedHandler(logout), []);

  if (!session) return <Shell><Login onLogin={(s) => { setSession(s); go(HOME[s.role]); }} /></Shell>;

  const batch = hash.match(/^\/inst\/batch\/(\d+)$/);
  let page;
  if (session.role === "institution_admin" && batch) page = <BatchDetail id={Number(batch[1])} />;
  else if (session.role === "institution_admin") page = <InstitutionHome />;
  else if (session.role === "aicte_officer" || session.role === "auditor") page = <AicteHome role={session.role} />;
  else page = <Planned role={session.role} />;

  return (
    <Shell session={session} roleLabel={ROLE_LABEL[session.role]} onLogout={logout}>
      {page}
    </Shell>
  );
}

function Shell({ session, roleLabel, onLogout, children }: { session?: Session; roleLabel?: string; onLogout?: () => void; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900" role="note">
        Prototype · synthetic data only · APAAR registry, AICTE approval registry, OTP and logins are MOCK
      </div>
      <header className="bg-brand-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <a href={session ? `#${HOME[session.role]}` : "#/"} className="flex items-center gap-3">
            <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-sm font-bold">AP</span>
            <span>
              <span className="block text-sm font-semibold leading-tight">APAAR Seat Integrity</span>
              <span className="block text-xs text-white/70">Student data & verification · SIH26263</span>
            </span>
          </a>
          {session && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-right leading-tight">
                <span className="block font-medium">{session.display_name}</span>
                <span className="block text-xs text-white/70">{roleLabel}</span>
              </span>
              <button onClick={onLogout} className="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-medium hover:bg-white/10">Sign out</button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        Designed in line with the principles of the DPDP Act 2023 · not a compliance claim
      </footer>
    </div>
  );
}

function Planned({ role }: { role: Role }) {
  return (
    <Card title="Coming in the next phase">
      <p className="text-sm text-slate-600">
        The {ROLE_LABEL[role].toLowerCase()} view (W3C Verifiable Credential issue/verify, consent, certificate QR) is planned and not built yet.
        Sign in as an institution or AICTE user to see the working parts.
      </p>
    </Card>
  );
}
