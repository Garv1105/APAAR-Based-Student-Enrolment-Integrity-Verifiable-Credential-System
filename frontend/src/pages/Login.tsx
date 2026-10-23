import { useState } from "react";
import { UserCheck, X } from "lucide-react";
import { ApiError, login, studentLogin, type Session } from "../api/client";
import Hero from "../components/Hero";
import IdentityPanel from "../components/IdentityPanel";
import IndiaMap from "../components/IndiaMap";
import Navbar from "../components/Navbar";

function LightStreaks() {
  return (
    <div
      className="pointer-events-none absolute bottom-0 left-0 h-[460px] w-[560px] select-none overflow-hidden z-0"
      aria-hidden="true"
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 600 500"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="streakGrad1" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2563ff" stopOpacity="0" />
            <stop offset="25%" stopColor="#2563ff" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="streakGrad2" x1="0%" y1="100%" x2="80%" y2="20%">
            <stop offset="0%" stopColor="#7c5cff" stopOpacity="0" />
            <stop offset="35%" stopColor="#2563ff" stopOpacity="0.6" />
            <stop offset="75%" stopColor="#38bdf8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
          </linearGradient>
          <filter id="streakGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient Corner Glow */}
        <circle cx="50" cy="450" r="160" fill="#2563ff" fillOpacity="0.2" filter="blur(60px)" />
        <circle cx="150" cy="400" r="110" fill="#38bdf8" fillOpacity="0.16" filter="blur(50px)" />

        {/* Swooping Curved Light Streaks */}
        <path
          d="M -50 480 C 100 480, 220 400, 340 280 C 420 200, 480 120, 520 40"
          stroke="url(#streakGrad1)"
          strokeWidth="3.5"
          strokeLinecap="round"
          filter="url(#streakGlow)"
          className="animate-streak"
        />
        <path
          d="M -30 520 C 130 510, 240 430, 380 320 C 470 240, 530 160, 570 80"
          stroke="url(#streakGrad2)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.6"
        />
        <path
          d="M 10 500 C 120 470, 200 420, 290 350 C 370 290, 430 210, 470 150"
          stroke="url(#streakGrad1)"
          strokeWidth="1.2"
          strokeDasharray="4 6"
          opacity="0.4"
        />
      </svg>
    </div>
  );
}

export default function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [selectedId, setSelectedId] = useState("inst-a");
  const [password, setPassword] = useState("demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Student Login Modal State
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [apaar, setApaar] = useState("123456789012");
  const [dob, setDob] = useState("2003-05-15");
  const [studentBusy, setStudentBusy] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);

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

  async function handleStudentLogin(e: React.FormEvent) {
    e.preventDefault();
    setStudentBusy(true);
    setStudentError(null);
    try {
      onLogin(await studentLogin(apaar.replace(/[\s-]/g, ""), dob));
    } catch (err) {
      setStudentError(
        err instanceof ApiError
          ? err.status === 401
            ? "APAAR ID and Date of Birth do not match registry records."
            : err.text
          : "Backend API unavailable on :8000."
      );
    } finally {
      setStudentBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-[#050816] text-white selection:bg-[#2563ff] selection:text-white overflow-x-hidden">
      {/* Background Layer: Deep navy with layered electric blue & violet radial glows */}
      <div
        className="pointer-events-none fixed inset-0 z-0 select-none overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute -left-48 -top-48 h-[650px] w-[650px] rounded-full bg-[#2563ff]/15 blur-[140px]" />
        <div className="absolute right-0 top-1/4 h-[700px] w-[700px] rounded-full bg-[#7c5cff]/12 blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 h-[500px] w-[500px] rounded-full bg-[#2563ff]/10 blur-[120px]" />
      </div>

      {/* Swooping light streaks in the bottom-left corner */}
      <LightStreaks />

      {/* Top Navbar */}
      <Navbar />

      {/* Main Container */}
      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col justify-center px-4 py-8 sm:px-6 lg:px-8 min-h-[calc(100vh-64px)]">
        {/* Full-Page Hero & Identity Gateway Layout */}
        <div className="relative grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-12 xl:gap-16">
          {/* Glowing Digital India Map Mesh (placed behind/between hero and panel) */}
          <div className="pointer-events-none absolute left-[45%] top-[50%] -translate-x-1/2 -translate-y-1/2 z-0 hidden lg:block opacity-65 xl:opacity-85 max-w-[500px] xl:max-w-[580px]">
            <IndiaMap />
          </div>

          {/* Left Column (~45%): Hero Section */}
          <div className="relative z-10 w-full">
            <Hero onOpenStudentModal={() => setShowStudentModal(true)} />
          </div>

          {/* Right Column (~50%): Choose Your Identity Panel */}
          <div className="relative z-10 w-full">
            <IdentityPanel
              selectedId={selectedId}
              onSelectId={(id) => setSelectedId(id)}
              password={password}
              onPasswordChange={(pwd) => setPassword(pwd)}
              onSubmit={handlePortalLogin}
              busy={busy}
              error={error}
            />
          </div>
        </div>
      </main>

      {/* Student Login Modal */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl">
          <div className="relative w-full max-w-md rounded-[24px] border border-blue-500/30 bg-[#080f24] p-6 sm:p-7 shadow-2xl text-white ring-1 ring-white/10 animate-fade-in">
            <button
              onClick={() => setShowStudentModal(false)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/40 shadow-sm">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Student Beneficiary Login</h3>
                <p className="text-xs text-[#9fb0d0]">APAAR ID &amp; DigiLocker Gateway</p>
              </div>
            </div>

            <form onSubmit={handleStudentLogin} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  APAAR ID (12 Digits)
                </label>
                <input
                  type="text"
                  value={apaar}
                  onChange={(e) => setApaar(e.target.value)}
                  required
                  placeholder="123456789012"
                  className="w-full rounded-xl border border-slate-700 bg-[#060a16] px-3.5 py-2.5 font-mono text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-inner"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-[#060a16] px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-inner"
                />
              </div>

              {studentError && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300 font-semibold">
                  {studentError}
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={studentBusy}
                  className="w-full rounded-[14px] bg-gradient-to-r from-[#2563ff] via-[#4f46e5] to-[#7c5cff] py-3 text-sm font-bold text-white shadow-[0_4px_20px_rgba(37,99,255,0.4)] hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
                >
                  {studentBusy ? "Verifying APAAR…" : "Access Student Wallet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
