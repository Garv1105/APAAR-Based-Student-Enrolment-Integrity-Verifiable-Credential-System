import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, FileCheck, LogOut, ShieldCheck, User } from "lucide-react";
import type { Session } from "../api/client";

interface AppLayoutProps {
  session?: Session | null;
  roleLabel?: string;
  onLogout?: () => void;
  canVerify?: boolean;
  currentHash?: string;
  children: React.ReactNode;
}

const ROLE_BADGE_STYLE: Record<string, string> = {
  aicte_officer: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
  auditor: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  institution_admin: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  verifier: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  university_registrar: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  student: "bg-teal-500/20 text-teal-300 border-teal-500/40",
};

export default function AppLayout({
  session,
  roleLabel,
  onLogout,
  canVerify = false,
  currentHash = "/",
  children,
}: AppLayoutProps) {
  if (!session) {
    return (
      <div className="min-h-screen bg-[#050816] text-white antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </div>
    );
  }

  const roleStyle = session?.role ? (ROLE_BADGE_STYLE[session.role] ?? "bg-slate-700 text-slate-200 border-slate-600") : "";

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased selection:bg-accent-600 selection:text-white">
      {/* Official Gov of India Tricolor Micro Accent */}
      <div className="h-1 w-full bg-gradient-to-r from-orange-500 via-white to-emerald-600" aria-hidden="true" />

      {/* Official Bilingual National Portal Bar */}
      <div className="border-b border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-700">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-2 sm:px-4">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-slate-900 tracking-tight">भारत सरकार</span>
            <span className="text-slate-300">|</span>
            <span className="font-medium text-slate-600">Government of India</span>
            <span className="hidden text-slate-300 md:inline">|</span>
            <span className="hidden font-medium text-slate-600 md:inline">शिक्षा मंत्रालय · Ministry of Education</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-accent-700">
            <span className="rounded bg-accent-50 px-2 py-0.5 border border-accent-200/60">
              SIH26263 Prototype
            </span>
          </div>
        </div>
      </div>

      {/* Synthetic Prototype Notice Banner */}
      <div className="border-b border-amber-200/80 bg-amber-50/90 px-4 py-1.5 text-xs text-amber-900" role="note">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-2 sm:px-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-amber-200/80 px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider text-amber-950">
              Sandbox
            </span>
            <span className="font-medium text-amber-900/90">
              Synthetic Demonstration Data · APAAR registry, AICTE sanction limit registry, OTP, and logins are MOCK simulations.
            </span>
          </div>
          <span className="hidden font-mono text-[11px] text-amber-800/80 sm:inline-block">
            DPDP Act 2023 Principles
          </span>
        </div>
      </div>

      {/* Persistent Dark Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-gov-950/95 text-white shadow-premium backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {/* Brand & Portal Identity */}
          <a
            href={session ? "#/" : "#/"}
            className="group flex items-center gap-3 transition-opacity hover:opacity-95"
            title="Return to Dashboard Home"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-600 to-indigo-800 text-white shadow-md ring-1 ring-white/20 transition-transform group-hover:scale-105">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-tight text-white sm:text-lg">
                  APAAR SEAT INTEGRITY
                </span>
                <span className="rounded bg-accent-500/20 px-1.5 py-0.2 text-[10px] font-bold text-accent-300 ring-1 ring-accent-400/30">
                  AICTE
                </span>
              </div>
              <span className="block text-[11px] font-medium text-slate-400">
                National Student Enrolment & Verifiable Credential Platform
              </span>
            </div>
          </a>

          {/* User Session & Role Controls */}
          {session ? (
            <div className="flex items-center gap-3">
              {/* Quick Verification Link */}
              {canVerify && (
                <a
                  href="#/verify"
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                    currentHash === "/verify"
                      ? "bg-accent-600 text-white shadow-xs"
                      : "bg-white/10 text-slate-200 hover:bg-white/15 hover:text-white"
                  }`}
                >
                  <FileCheck className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Verify Credential</span>
                </a>
              )}

              {/* User Identity Chip */}
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5 shadow-inner">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-600/30 text-accent-300">
                  <User className="h-4 w-4" />
                </div>
                <div className="text-left leading-tight">
                  <div className="text-xs font-bold text-white">{session.display_name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`inline-block rounded px-1.5 py-0.2 text-[10px] font-semibold border ${roleStyle}`}>
                      {roleLabel ?? session.role}
                    </span>
                  </div>
                </div>
              </div>

              {/* Explicit Sign Out Button */}
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:border-critical/60 hover:bg-critical/20 hover:text-critical-text focus:outline-none focus:ring-2 focus:ring-critical cursor-pointer"
                  title="Sign out of current session"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Sign out</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] font-medium text-slate-300">
                National Academic Depository & W3C VC Node
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area with Framer Motion Page Transition */}
      <div className="flex-1">
        <AnimatePresence mode="wait">
          <motion.main
            key={currentHash || "default"}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6"
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>

      {/* Enterprise GovTech Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-xs text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2 text-slate-600">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="font-semibold text-slate-700">
              Architected in accordance with the Digital Personal Data Protection (DPDP) Act 2023
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-slate-500 font-medium">
            <span>W3C Verifiable Credentials (eddsa-jcs-2022)</span>
            <span className="hidden sm:inline">·</span>
            <span>Cryptographic Merkle/Hash Ledger</span>
            <span className="hidden sm:inline">·</span>
            <span>SIH26263 Prototype</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
