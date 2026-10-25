import { useEffect, useState, type ReactNode } from "react";
import { getJson, type S, type Session } from "../api/client";
import Backdrop from "../components/landing/Backdrop";
import Navbar from "../components/Navbar";
import Landing from "./Landing";
import SignIn from "./SignIn";
import { Activate, RequestAccess } from "./Onboarding";

/** Signed-out site: #/ landing, #/signin, #/activate, #/request-access (hash router, query after "?"). */
export default function PublicSite({ hash, onLogin }: { hash: string; onLogin: (s: Session) => void }) {
  const [path, query] = hash.split("?");
  const params = new URLSearchParams(query ?? "");
  const demo = useDemoMode();
  const page = path === "/signin" ? <SignIn onLogin={onLogin} demo={demo} initialRole={params.get("as")} />
    : path === "/activate" ? <Activate />
    : path === "/request-access" ? <RequestAccess />
    : <Landing section={params.get("s")} />;
  useEffect(() => { window.scrollTo(0, 0); }, [path]);
  return <PublicShell demo={demo} current={path === "/" ? params.get("s") ?? "/" : path}>{page}</PublicShell>;
}

export function useDemoMode() {
  const [demo, setDemo] = useState(false);
  useEffect(() => { getJson<S["AuthConfig"]>("/v1/auth/config").then((c) => setDemo(c.demo_mode)).catch(() => {}); }, []);
  return demo;
}

function PublicShell({ demo, current, children }: { demo: boolean; current: string; children: ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#121316] font-inter text-white selection:bg-[#d4af37]/40 selection:text-white">
      {/* quiet obsidian backdrop: one faint static warm light, vignette, grain, faint grid */}
      <Backdrop />
      <div aria-hidden className="ambient-grid pointer-events-none fixed inset-0 z-0 opacity-35" />
      <Navbar demo={demo} current={current} />
      <main className="relative z-10 mx-auto w-full max-w-[1440px] px-5 pb-14 pt-6 sm:px-8">{children}</main>
      <footer className="relative z-10 mx-auto max-w-[1440px] space-y-1 border-t border-white/[0.06] px-5 py-6 text-[11.5px] text-[#7d838d] sm:px-8">
        <p>Prototype for the AICTE problem statement SIH26263. Not an official Government of India or AICTE website.</p>
        <p>Synthetic data. The APAAR registry, AICTE approval registry and identity provider are simulated (MOCK). No real students or institutions.</p>
        <p>Map: India boundaries by <a className="underline decoration-white/20 underline-offset-2 hover:text-[#d5d9de]" href="https://github.com/datameet/maps" target="_blank" rel="noreferrer">DataMeet</a> (CC BY 4.0), simplified.</p>
      </footer>
    </div>
  );
}
