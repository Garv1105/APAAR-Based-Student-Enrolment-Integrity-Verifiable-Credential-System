import React, { useEffect, useState } from "react";
import { Fingerprint, X } from "lucide-react";
import {
  activateAndRegister,
  ApiError,
  getJson,
  login,
  passkeyLogin,
  studentLogin,
  type S,
  type Session,
} from "../api/client";
import { passkeyError, passkeysSupported } from "../webauthn";
import Starfield from "../components/Starfield";
import LandingNavbar, { LotusBookEmblem } from "../components/LandingNavbar";
import LandingHero from "../components/LandingHero";
import LandingRoleCards from "../components/LandingRoleCards";
import LandingImpactBand from "../components/LandingImpactBand";
import LandingHowItWorks from "../components/LandingHowItWorks";
import IdentitySlideOver from "../components/IdentitySlideOver";

export default function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [selectedId, setSelectedId] = useState("inst-a");
  const [password, setPassword] = useState("demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal and Slide-over states
  const [showSlideOver, setShowSlideOver] = useState(false);
  const [slideOverGroup, setSlideOverGroup] = useState<0 | 1 | 2 | undefined>(undefined);
  const [showStudentModal, setShowStudentModal] = useState(false);

  async function handlePortalLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await login(selectedId, password);
      onLogin(session);
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

  const handleOpenPortal = (group?: 0 | 1 | 2) => {
    setSlideOverGroup(group);
    setShowSlideOver(true);
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#0b0f14] font-inter text-[#f5f5f5] selection:bg-[#d4af37]/35 selection:text-white">
      {/* Living background: .ambient-gold base, subtle warm orbs, faint grid, gold starfield */}
      <div aria-hidden className="ambient-gold pointer-events-none fixed inset-0 z-0" />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="orb orb-a -left-[10%] -top-[10%] h-[55vh] w-[55vw] bg-[radial-gradient(closest-side,rgba(212,175,55,0.14),transparent)]" />
        <div className="orb orb-b -right-[10%] bottom-[-10%] h-[60vh] w-[60vw] bg-[radial-gradient(closest-side,rgba(116,91,24,0.12),transparent)]" />
      </div>
      <div aria-hidden className="ambient-grid pointer-events-none fixed inset-0 z-0 opacity-45" />
      <Starfield count={36} />

      {/* Top Navbar */}
      <LandingNavbar onOpenPortal={handleOpenPortal} />

      {/* Main Landing Page Sections */}
      <main className="relative z-10 w-full pb-16">
        <LandingHero onOpenPortal={handleOpenPortal} />
        <LandingRoleCards
          onOpenPortal={handleOpenPortal}
          onOpenStudentModal={() => setShowStudentModal(true)}
        />
        <LandingImpactBand />
        <LandingHowItWorks />
      </main>

      {/* Footer */}
      <footer id="about" className="relative z-10 border-t border-[#222c37] bg-[#0c1219]/90 py-12">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col items-center justify-between gap-6 px-5 sm:flex-row sm:px-8">
          <div className="flex items-center gap-3">
            <LotusBookEmblem className="h-8 w-8 text-[#d4af37]" />
            <span className="font-manrope text-[16px] font-bold tracking-tight text-[#f5f5f5]">
              Vidya<span className="text-[#d4af37]">Pramaan</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-[13px] text-[#b3b9c2]">
            <a href="#home" className="transition-colors hover:text-[#f7e08a]">Home</a>
            <a href="#portals" className="transition-colors hover:text-[#f7e08a]">Portals</a>
            <a href="#how" className="transition-colors hover:text-[#f7e08a]">Architecture</a>
            <a href="#impact" className="transition-colors hover:text-[#f7e08a]">Ecosystem Impact</a>
          </div>

          <p className="text-center font-inter text-[11px] text-[#b3b9c2]/70 sm:text-right">
            India boundaries by{" "}
            <a
              className="underline decoration-[#d4af37]/40 underline-offset-2 hover:text-[#f7e08a]"
              href="https://github.com/datameet/maps"
              target="_blank"
              rel="noreferrer"
            >
              DataMeet
            </a>{" "}
            (CC BY 4.0), simplified. Illustration only.
          </p>
        </div>

        <div className="mx-auto mt-6 max-w-[1440px] border-t border-white/[0.04] px-5 pt-6 text-center sm:px-8">
          <p className="font-inter text-[11px] leading-relaxed text-[#b3b9c2]/50">
            SIH26263 prototype · synthetic data only · APAAR registry, AICTE approval registry, OTP and logins are MOCK.
            Not an official Government of India or AICTE website.
          </p>
        </div>
      </footer>

      {/* Right Slide-over Authentication Drawer */}
      <IdentitySlideOver
        open={showSlideOver}
        onClose={() => setShowSlideOver(false)}
        selectedId={selectedId}
        onSelectId={setSelectedId}
        password={password}
        onPasswordChange={setPassword}
        onSubmit={handlePortalLogin}
        busy={busy}
        error={error}
        focusGroup={slideOverGroup}
      />

      {/* Student Passkey Login Modal */}
      {showStudentModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#020408]/80 p-4 backdrop-blur-md"
          onKeyDown={(e) => e.key === "Escape" && setShowStudentModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-signin-title"
            className="glass rise relative max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-[24px] border border-white/[0.1] bg-[#0c1219]/95 p-6 text-[#f5f5f5] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.95)] backdrop-blur-2xl sm:p-7"
          >
            <button
              autoFocus
              onClick={() => setShowStudentModal(false)}
              className="absolute right-4 top-4 rounded-full border border-white/[0.08] bg-white/[0.04] p-1.5 text-[#b3b9c2] transition-colors hover:border-[#d4af37]/40 hover:bg-white/[0.08] hover:text-[#f7e08a] focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>

            <p className="text-[11.5px] font-semibold uppercase tracking-[0.2em] text-[#d4af37]">
              Passkey Sign-In
            </p>
            <h3
              id="student-signin-title"
              className="mt-2 font-manrope text-[26px] font-extrabold tracking-[-0.03em] text-[#f5f5f5]"
            >
              Students & Guardians
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#b3b9c2]">
              Fingerprint, face recognition or device PIN. Cryptographically secure with no shared password.
            </p>

            <StudentSignIn onLogin={onLogin} />
          </div>
        </div>
      )}
    </div>
  );
}

const field =
  "w-full rounded-xl border border-white/[0.1] bg-black/40 px-3.5 py-2.5 text-sm text-[#f5f5f5] placeholder:text-[#64748b] focus:border-[#d4af37]/60 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/25";
const label = "mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#b3b9c2]";

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

  useEffect(() => {
    getJson<S["AuthConfig"]>("/v1/auth/config")
      .then((c) => setDemo(c.demo_mode))
      .catch(() => {});
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(
        passkeyError(err) ??
          (err instanceof ApiError
            ? err.status === 401
              ? "Sign-in failed. Check the details and try again."
              : err.text
            : "Cannot reach the API. Is the backend running on :8000?")
      );
    } finally {
      setBusy(false);
    }
  }

  const activate = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const setup = await activateAndRegister(apaar.replace(/[\s-]/g, ""), code);
      setNote(
        `Passkey registered for the ${setup.kind}.` +
          (setup.reissue ? " It can approve consent after 24 hours (reissued code)." : "") +
          " Now sign in with it."
      );
      setCode("");
    });
  };

  const dobSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => onLogin(await studentLogin(apaar.replace(/[\s-]/g, ""), dob)));
  };

  return (
    <div className="mt-5 space-y-5">
      {supported ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(async () => onLogin(await passkeyLogin()))}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#c4a032] via-[#d4af37] to-[#f7e08a] py-3 text-[14px] font-bold text-[#0b0f14] shadow-[0_8px_20px_-6px_rgba(212,175,55,0.6)] transition-all duration-300 hover:shadow-[0_12px_28px_-6px_rgba(212,175,55,0.85)] disabled:opacity-50"
        >
          <Fingerprint className="h-4 w-4" aria-hidden />
          {busy ? "Waiting for passkey…" : "Sign in with passkey"}
        </button>
      ) : (
        <p className="text-xs text-[#e5534b]">This browser doesn't support passkeys.</p>
      )}
      <p className="text-xs text-[#b3b9c2]">Fingerprint, face or device PIN. Nothing to type.</p>

      <form onSubmit={activate} className="space-y-3 border-t border-[#222c37] pt-4">
        <p className="text-xs text-[#b3b9c2]">
          First time? Use the one-time activation code from your institution to register a passkey.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>APAAR ID</span>
            <input
              value={apaar}
              onChange={(e) => setApaar(e.target.value)}
              required
              inputMode="numeric"
              placeholder="12 digits"
              className={`${field} font-mono`}
            />
          </label>
          <label className="block">
            <span className={label}>Activation code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              placeholder="XXXX-XXXX-XX"
              autoComplete="one-time-code"
              className={`${field} font-mono uppercase`}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy || !supported}
          className="w-full rounded-xl border border-[#d4af37]/40 py-2.5 text-sm font-semibold text-[#f7e08a] transition-colors hover:bg-[#d4af37]/10 disabled:opacity-50"
        >
          Activate and register passkey
        </button>
      </form>

      {demo && (
        <details className="rounded-xl border border-[#e8913a]/30 bg-[#e8913a]/10 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-[#f7e08a]">
            Demo fallback: date-of-birth sign-in{" "}
            <span className="ml-1 rounded bg-[#e8913a]/20 px-1 text-[10px] text-[#f7e08a]">
              MOCK · DEMO_MODE
            </span>
          </summary>
          <p className="mt-2 text-xs text-[#b3b9c2]">
            Not authentication: a date of birth isn't a secret. Enabled only because the server runs in DEMO_MODE.
          </p>
          <form onSubmit={dobSignIn} className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={label}>APAAR ID</span>
              <input
                value={apaar}
                onChange={(e) => setApaar(e.target.value)}
                required
                inputMode="numeric"
                placeholder="12 digits"
                className={`${field} font-mono`}
              />
            </label>
            <label className="block">
              <span className={label}>Date of birth</span>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                required
                className={field}
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl border border-[#e8913a]/40 py-2 text-sm font-semibold text-[#f7e08a] hover:bg-[#e8913a]/15 disabled:opacity-50 sm:col-span-2"
            >
              {busy ? "Signing in…" : "Sign in (MOCK)"}
            </button>
          </form>
        </details>
      )}

      <div aria-live="polite">
        {note && <p className="text-sm text-[#22c983]" role="status">{note}</p>}
        {error && (
          <div role="alert" className="rounded-xl border border-[#e5534b]/30 bg-[#e5534b]/10 p-3 text-xs font-semibold text-[#f39a94]">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
