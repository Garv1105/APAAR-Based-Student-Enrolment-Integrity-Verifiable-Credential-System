import { useState } from "react";
import { Check, ShieldCheck, UserCheck, X } from "lucide-react";
import { ApiError, login, studentLogin, type Session } from "../api/client";

interface Persona {
  id: string;
  title: string;
  role: string;
  tag: string;
  tagTone: "blue" | "amber" | "cyan" | "rose" | "emerald";
  group: "INSTITUTIONS" | "REGULATORS" | "VERIFICATION";
  waveColor?: string;
  hasSeal?: boolean;
  statusBadge?: string;
  badgeTone?: "blue" | "emerald" | "rose";
}

const PERSONAS: Persona[] = [
  // INSTITUTIONS
  {
    id: "inst-a",
    title: "Demo Institute of Technology",
    role: "Institution",
    tag: "clean data",
    tagTone: "blue",
    group: "INSTITUTIONS",
    waveColor: "#60a5fa",
  },
  {
    id: "inst-b",
    title: "Sample College of Engineering",
    role: "Institution",
    tag: "messy data",
    tagTone: "amber",
    group: "INSTITUTIONS",
    waveColor: "#f59e0b",
  },
  {
    id: "inst-c",
    title: "Example School of Management",
    role: "Institution",
    tag: "enrolment spike",
    tagTone: "cyan",
    group: "INSTITUTIONS",
    waveColor: "#06b6d4",
  },
  {
    id: "inst-d",
    title: "Closed Polytechnic",
    role: "Institution",
    tag: "not approved",
    tagTone: "rose",
    group: "INSTITUTIONS",
    waveColor: "#f43f5e",
  },
  // REGULATORS
  {
    id: "aicte",
    title: "AICTE Monitoring Officer",
    role: "National monitoring · aicte",
    tag: "audit ready",
    tagTone: "blue",
    group: "REGULATORS",
    hasSeal: true,
    statusBadge: "audit ready",
    badgeTone: "blue",
  },
  {
    id: "auditor",
    title: "Auditor",
    role: "Read-only · auditor",
    tag: "audit ready",
    tagTone: "emerald",
    group: "REGULATORS",
    statusBadge: "audit ready",
    badgeTone: "emerald",
  },
  // VERIFICATION
  {
    id: "employer",
    title: "Acme Hiring (verifier)",
    role: "Employer · consent-based checks · employer",
    tag: "trusted",
    tagTone: "emerald",
    group: "VERIFICATION",
    statusBadge: "verified",
    badgeTone: "emerald",
  },
  {
    id: "univ",
    title: "Demo Technological University",
    role: "Registrar · awards degrees · univ",
    tag: "restricted",
    tagTone: "rose",
    group: "VERIFICATION",
    statusBadge: "restricted",
    badgeTone: "rose",
  },
];

function MiniWave({ color }: { color: string }) {
  return (
    <svg className="h-6 w-16 shrink-0 opacity-80" viewBox="0 0 70 24" fill="none">
      <path
        d="M2 16 C 14 16, 18 4, 30 10 C 42 16, 48 2, 68 8"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AicteEmblem() {
  return (
    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-amber-600 via-orange-500 to-amber-300 p-0.5 shadow-md ring-1 ring-amber-400/40">
      <div className="flex h-full w-full items-center justify-center rounded-full bg-[#0d1424] text-[8px] font-black uppercase tracking-tighter text-amber-300">
        AICTE
      </div>
    </div>
  );
}

export default function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [selectedId, setSelectedId] = useState("inst-a");
  const [password, setPassword] = useState("demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Student Modal state
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

  const institutions = PERSONAS.filter((p) => p.group === "INSTITUTIONS");
  const regulators = PERSONAS.filter((p) => p.group === "REGULATORS");
  const verification = PERSONAS.filter((p) => p.group === "VERIFICATION");

  return (
    <div className="relative mx-auto w-full max-w-7xl animate-fade-in py-2">
      {/* Top Banner & Status Row */}
      <div className="mb-6 flex flex-col items-center justify-between gap-3 text-xs sm:flex-row">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600/30 text-[11px] font-bold text-indigo-300 border border-indigo-500/40">
            AP
          </div>
          <span className="font-bold text-sm text-white tracking-tight">APAAR Seat Integrity</span>
          <span className="text-slate-600">·</span>
          <span className="text-xs font-semibold text-slate-400">SIH26263</span>
          <span className="relative flex h-2 w-2 ml-1">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        </div>

        {/* Centered Prototype Disclaimer Badge */}
        <div className="rounded-full border border-slate-800 bg-[#0E1422] px-4 py-1 text-[10px] font-bold tracking-widest text-slate-400 shadow-inner text-center">
          PROTOTYPE · SYNTHETIC DATA ONLY · APAAR REGISTRY, AICTE APPROVAL REGISTRY, OTP AND LOGINS ARE MOCK
        </div>

        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <span>Live Network Integrity System</span>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs font-semibold text-rose-300">
          {error}
        </div>
      )}

      {/* Main Two-Column Gateway Layout */}
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* ================= LEFT COLUMN ================= */}
        <div className="space-y-4">
          {/* Main "Choose Your Identity" Container */}
          <div className="rounded-3xl border border-slate-800/90 bg-[#111726]/90 p-7 shadow-premium backdrop-blur-md">
            <h2 className="text-2xl font-extrabold tracking-tight text-white">Choose Your Identity</h2>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed font-medium">
              Select an institution, regulator, or verifier portal to access the secure ledger.
            </p>

            <form onSubmit={handlePortalLogin} className="mt-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-slate-700/80 bg-[#0B0F19] px-4 py-2.5 font-mono text-sm text-white tracking-widest shadow-inner focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
              >
                {busy ? "Connecting to Ledger…" : "Access Portal"}
              </button>
            </form>
          </div>

          {/* "Students" Card */}
          <div
            onClick={() => setShowStudentModal(true)}
            className="group relative cursor-pointer overflow-hidden rounded-3xl border border-slate-800/80 bg-[#111726]/90 p-5 shadow-premium transition-all hover:border-indigo-500/50 hover:bg-[#141c2e]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Students</span>
                <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                  Student Login with APAAR ID
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed max-w-[210px]">
                  Elegant login with your APAAR ID and date of birth with DigiLocker workflow with digital ID mockup highlights.
                </p>
              </div>

              {/* Graphic Mockup Badge */}
              <div className="relative shrink-0 rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950 via-slate-900 to-blue-950 p-2.5 shadow-md">
                <div className="flex items-center gap-1.5 border-b border-white/10 pb-1">
                  <div className="h-2 w-2 rounded-full bg-blue-400" />
                  <span className="font-mono text-[7px] font-extrabold uppercase text-white">APAAR</span>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <div className="h-5 w-5 rounded-full bg-indigo-500/30 border border-indigo-400/40" />
                  <div className="space-y-1">
                    <div className="h-1 w-6 rounded bg-slate-500" />
                    <div className="h-1 w-8 rounded bg-slate-600" />
                  </div>
                </div>
                <div className="mt-2 h-1.5 w-full rounded bg-indigo-500/20" />
              </div>
            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: PORTAL GRID OPTIONS ================= */}
        <div className="space-y-6">
          {/* Category 1: INSTITUTIONS */}
          <div>
            <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">
              INSTITUTIONS
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {institutions.map((p) => {
                const isSelected = selectedId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`group relative flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-4 transition-all ${
                      isSelected
                        ? "border-blue-500 bg-blue-950/25 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/40"
                        : "border-slate-800/80 bg-[#111726]/80 hover:border-slate-700 hover:bg-[#131a2b]"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Radio Circle */}
                      <div
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all ${
                          isSelected
                            ? "border-blue-400 bg-blue-500/20 ring-2 ring-blue-500/40"
                            : "border-slate-600 bg-transparent group-hover:border-slate-500"
                        }`}
                      >
                        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />}
                      </div>

                      <div className="min-w-0">
                        <div className="font-bold text-sm text-white truncate">{p.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                          <span>{p.role}</span>
                          <span>·</span>
                          <span
                            className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                              p.tagTone === "blue"
                                ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                : p.tagTone === "amber"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                : p.tagTone === "cyan"
                                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                                : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            }`}
                          >
                            {p.tag}
                          </span>
                          <span>·</span>
                          <span className="font-mono text-[11px] text-slate-500">{p.id}</span>
                        </div>
                      </div>
                    </div>

                    {/* Wave Graphic */}
                    {p.waveColor && <MiniWave color={p.waveColor} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Category 2: REGULATORS */}
          <div>
            <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">
              REGULATORS
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {regulators.map((p) => {
                const isSelected = selectedId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`group relative flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-4 transition-all ${
                      isSelected
                        ? "border-blue-500 bg-blue-950/25 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/40"
                        : "border-slate-800/80 bg-[#111726]/80 hover:border-slate-700 hover:bg-[#131a2b]"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {p.hasSeal ? (
                        <AicteEmblem />
                      ) : (
                        <div
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all ${
                            isSelected
                              ? "border-blue-400 bg-blue-500/20 ring-2 ring-blue-500/40"
                              : "border-slate-600 bg-transparent group-hover:border-slate-500"
                          }`}
                        >
                          {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />}
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="font-bold text-sm text-white truncate">{p.title}</div>
                        <div className="mt-0.5 text-xs text-slate-400">{p.role}</div>
                      </div>
                    </div>

                    {/* Status Pill */}
                    {p.statusBadge && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold shrink-0 ${
                          p.badgeTone === "emerald"
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            : "bg-blue-500/15 text-blue-300 border border-blue-500/30"
                        }`}
                      >
                        {p.statusBadge}
                        {p.badgeTone === "emerald" && <Check className="h-3 w-3" />}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Category 3: VERIFICATION */}
          <div>
            <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">
              VERIFICATION
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {verification.map((p) => {
                const isSelected = selectedId === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`group relative flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-4 transition-all ${
                      isSelected
                        ? "border-blue-500 bg-blue-950/25 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/40"
                        : "border-slate-800/80 bg-[#111726]/80 hover:border-slate-700 hover:bg-[#131a2b]"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all ${
                          isSelected
                            ? "border-blue-400 bg-blue-500/20 ring-2 ring-blue-500/40"
                            : "border-slate-600 bg-transparent group-hover:border-slate-500"
                        }`}
                      >
                        {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />}
                      </div>

                      <div className="min-w-0">
                        <div className="font-bold text-sm text-white truncate">{p.title}</div>
                        <div className="mt-0.5 text-xs text-slate-400">{p.role}</div>
                      </div>
                    </div>

                    {/* Trust check or restricted tag */}
                    {p.id === "employer" ? (
                      <div className="flex items-center gap-1.5 text-emerald-400 shrink-0">
                        <ShieldCheck className="h-4 w-4" />
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/30 shrink-0">
                        restricted
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Student Login Modal / Drawer */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-3xl border border-slate-700 bg-[#111726] p-6 shadow-2xl text-white">
            <button
              onClick={() => setShowStudentModal(false)}
              className="absolute right-4 top-4 rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/30">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Student Beneficiary Login</h3>
                <p className="text-xs text-slate-400">APAAR ID & DigiLocker Gateway</p>
              </div>
            </div>

            <form onSubmit={handleStudentLogin} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  APAAR ID (12 Digits)
                </label>
                <input
                  type="text"
                  value={apaar}
                  onChange={(e) => setApaar(e.target.value)}
                  required
                  placeholder="123456789012"
                  className="w-full rounded-xl border border-slate-700 bg-[#0B0F19] px-3.5 py-2 font-mono text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-700 bg-[#0B0F19] px-3.5 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              {studentError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300 font-semibold">
                  {studentError}
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={studentBusy}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-2.5 text-sm font-bold text-white shadow-md hover:from-blue-500 hover:to-indigo-500 cursor-pointer disabled:opacity-50"
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
