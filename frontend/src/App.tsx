import { useEffect, useState } from "react";
import { loadSession, saveSession, setUnauthorizedHandler, type Role, type Session } from "./api/client";
import { VerifyTool } from "./credentials";
import AicteHome from "./pages/Aicte";
import BatchDetail from "./pages/Batch";
import Certificate from "./pages/Certificate";
import InstitutionHome from "./pages/Institution";
import Login from "./pages/Login";
import RegistrarHome from "./pages/Registrar";
import StudentHome from "./pages/Student";
import VerifierHome from "./pages/Verifier";
import { go } from "./ui";

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
  verifier: "/verifier", university_registrar: "/registrar", student: "/student", guardian: "/student",
};
const CAN_VERIFY: Role[] = ["institution_admin", "aicte_officer", "auditor", "university_registrar"];
const ROLE_LABEL: Record<Role, string> = {
  institution_admin: "Institution", aicte_officer: "AICTE officer", auditor: "Auditor (read-only)",
  verifier: "Verifier", university_registrar: "University registrar", student: "Student", guardian: "Guardian",
};

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const hash = useHash();

  const logout = () => { saveSession(null); setSession(null); go("/"); };
  useEffect(() => setUnauthorizedHandler(logout), []);

  if (!session) return <Shell><Login onLogin={(s) => { setSession(s); go(HOME[s.role]); }} /></Shell>;

  const batch = hash.match(/^\/inst\/batch\/(\d+)$/);
  const cert = hash.match(/^\/certificate\?id=(.+)$/);
  const r = session.role;
  let page;
  if (cert && ["student", "guardian", "institution_admin", "university_registrar"].includes(r)) page = <Certificate id={decodeURIComponent(cert[1])} />;
  else if (hash === "/verify" && CAN_VERIFY.includes(r)) page = <VerifyTool allowForgedDemo={r === "aicte_officer" || r === "auditor"} />;
  else if (r === "institution_admin" && batch) page = <BatchDetail id={Number(batch[1])} />;
  else if (r === "institution_admin") page = <InstitutionHome />;
  else if (r === "aicte_officer" || r === "auditor") page = <AicteHome role={r} />;
  else if (r === "verifier") page = <VerifierHome />;
  else if (r === "university_registrar") page = <RegistrarHome />;
  else page = <StudentHome />;

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
              {CAN_VERIFY.includes(session.role) && (
                <a href="#/verify" className="rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-white/10">Verify a credential</a>
              )}
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
