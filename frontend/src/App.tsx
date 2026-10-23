import { useEffect, useState } from "react";
import { loadSession, saveSession, setUnauthorizedHandler, type Role, type Session } from "./api/client";
import AppLayout from "./components/AppLayout";
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
  institution_admin: "/inst",
  aicte_officer: "/aicte",
  auditor: "/aicte",
  verifier: "/verifier",
  university_registrar: "/registrar",
  student: "/student",
};

const CAN_VERIFY: Role[] = ["institution_admin", "aicte_officer", "auditor", "university_registrar"];

const ROLE_LABEL: Record<Role, string> = {
  institution_admin: "Institution Admin",
  aicte_officer: "AICTE Officer",
  auditor: "National Auditor (Read-only)",
  verifier: "Credential Verifier",
  university_registrar: "University Registrar",
  student: "Student Beneficiary",
};

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const hash = useHash();

  const logout = () => {
    saveSession(null);
    setSession(null);
    go("/");
  };

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, []);

  if (!session) {
    return (
      <AppLayout currentHash="/login">
        <Login
          onLogin={(s) => {
            setSession(s);
            go(HOME[s.role]);
          }}
        />
      </AppLayout>
    );
  }

  const batch = hash.match(/^\/inst\/batch\/(\d+)$/);
  const cert = hash.match(/^\/certificate\?id=(.+)$/);
  const r = session.role;
  let page;

  if (cert && ["student", "institution_admin", "university_registrar"].includes(r)) {
    page = <Certificate id={decodeURIComponent(cert[1])} />;
  } else if (hash === "/verify" && CAN_VERIFY.includes(r)) {
    page = <VerifyTool allowForgedDemo={r === "aicte_officer" || r === "auditor"} />;
  } else if (r === "institution_admin" && batch) {
    page = <BatchDetail id={Number(batch[1])} />;
  } else if (r === "institution_admin") {
    page = <InstitutionHome />;
  } else if (r === "aicte_officer" || r === "auditor") {
    page = <AicteHome role={r} />;
  } else if (r === "verifier") {
    page = <VerifierHome />;
  } else if (r === "university_registrar") {
    page = <RegistrarHome />;
  } else {
    page = <StudentHome />;
  }

  return (
    <AppLayout
      session={session}
      roleLabel={ROLE_LABEL[session.role]}
      onLogout={logout}
      canVerify={CAN_VERIFY.includes(session.role)}
      currentHash={hash}
    >
      {page}
    </AppLayout>
  );
}
