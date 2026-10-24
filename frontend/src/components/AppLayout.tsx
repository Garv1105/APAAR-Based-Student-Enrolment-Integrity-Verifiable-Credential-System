import React, { useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  AlertOctagon, BadgeCheck, BarChart3, ClipboardList, FileSpreadsheet, FileText, Fingerprint, GraduationCap, History,
  Inbox, LayoutDashboard, LogOut, Map, ScrollText, Send, ShieldCheck, UploadCloud, Users, Wallet,
} from "lucide-react";
import type { Role, Session } from "../api/client";
import { go } from "../ui";
import { BrandLogo } from "./BrandMark";

interface AppLayoutProps {
  session?: Session | null;
  roleLabel?: string;
  onLogout?: () => void;
  canVerify?: boolean;
  currentHash?: string;
  home?: string;
  children: React.ReactNode;
}

type Item = { label: string; icon: React.ElementType; section?: string; route?: string };
type Group = { title?: string; items: Item[] };

/** Navigation per role. `section` scrolls to an element id on the role's home page; `route` changes page. */
function navFor(role: Role, canVerify: boolean): Group[] {
  const verify: Group[] = canVerify ? [{ title: "Verification", items: [{ label: "Verify a credential", icon: BadgeCheck, route: "/verify" }] }] : [];
  switch (role) {
    case "institution_admin":
      return [{ items: [
        { label: "Overview", icon: LayoutDashboard, section: "top" },
        { label: "Upload & validate", icon: UploadCloud, section: "upload" },
        { label: "Seat utilisation", icon: BarChart3, section: "seats" },
        { label: "Data quality", icon: ShieldCheck, section: "quality" },
        { label: "Upload batches", icon: History, section: "batches" },
        { label: "Students & credentials", icon: GraduationCap, section: "students" },
      ] }, ...verify];
    case "aicte_officer":
    case "auditor":
      return [{ items: [
        { label: "National overview", icon: LayoutDashboard, section: "top" },
        { label: "State map", icon: Map, section: "map" },
        { label: "Excess admissions", icon: AlertOctagon, section: "excess" },
        { label: "Duplicate cases", icon: Users, section: "cases" },
        { label: "Inspection queue", icon: ClipboardList, section: "inspection" },
        { label: "Upload compliance", icon: FileText, section: "compliance" },
        { label: "Reports", icon: FileSpreadsheet, section: "reports" },
      ] }, ...verify];
    case "verifier":
      return [{ items: [
        { label: "Request consent", icon: Send, section: "top" },
        { label: "My requests", icon: Inbox, section: "requests" },
        { label: "Verify a credential", icon: BadgeCheck, section: "verify-tool" },
      ] }];
    case "university_registrar":
      return [{ items: [{ label: "Award degrees", icon: GraduationCap, section: "top" }] }, ...verify];
    default:
      return [{ items: [
        { label: "My record", icon: LayoutDashboard, section: "top" },
        { label: "Consent requests", icon: Fingerprint, section: "consents" },
        { label: "Credential wallet", icon: Wallet, section: "wallet" },
        { label: "Who accessed my data", icon: ScrollText, section: "access-log" },
      ] }];
  }
}

function scrollToSection(id: string) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (id === "top") window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  else document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

function Brand() {
  return <BrandLogo size="md" />;
}

const PAGE_LABEL = (hash: string, home: string) =>
  hash === home ? "Dashboard" : hash.startsWith("/inst/batch") ? "Batch detail" : hash === "/verify" ? "Verify a credential"
    : hash.startsWith("/certificate") ? "Certificate" : "Dashboard";

export default function AppLayout({ session, roleLabel, onLogout, canVerify = false, currentHash = "/", home = "/", children }: AppLayoutProps) {
  const [active, setActive] = useState("top");

  if (!session) {
    return <div className="min-h-screen bg-[#050816] text-white antialiased selection:bg-blue-600 selection:text-white">{children}</div>;
  }

  const groups = navFor(session.role, canVerify);
  const onHome = currentHash === home;
  const isActive = (it: Item) => (it.route ? currentHash === it.route : onHome && active === it.section);
  const open = (it: Item) => {
    if (it.route) { go(it.route); return; }
    setActive(it.section!);
    if (onHome) scrollToSection(it.section!);
    else { go(home); setTimeout(() => scrollToSection(it.section!), 300); }
  };

  const navButton = (it: Item, compact = false) => {
    const on = isActive(it);
    const Icon = it.icon;
    return (
      <button key={it.label} type="button" onClick={() => open(it)} aria-current={on ? "page" : undefined}
        className={`group relative flex items-center gap-3 rounded-xl font-display text-[16px] font-semibold tracking-[-0.01em] transition-colors duration-200 ${compact ? "shrink-0 px-3 py-1.5" : "w-full px-4 py-3"} ${on ? "bg-gold/[0.08] text-champagne" : "text-mute hover:bg-white/[0.03] hover:text-ink"}`}>
        {!compact && <span aria-hidden className={`absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-gold transition-opacity duration-200 ${on ? "opacity-100" : "opacity-0"}`} />}
        <Icon className={`h-5 w-5 shrink-0 ${on ? "text-gold" : "text-slate-400 group-hover:text-slate-600"}`} aria-hidden />
        <span className="whitespace-nowrap">{it.label}</span>
      </button>
    );
  };

  const initials = session.display_name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <MotionConfig reducedMotion="user">
      <div className="theme-gold min-h-screen antialiased lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ambient light behind the glass: a static base plus two slowly drifting lights */}
        <div aria-hidden className="ambient-gold no-print pointer-events-none fixed inset-0" />
        <div aria-hidden className="no-print pointer-events-none fixed inset-0 overflow-hidden">
          <div className="orb orb-a right-[-8%] top-[-10%] h-[55vh] w-[45vw] bg-[radial-gradient(closest-side,rgba(212,175,55,0.22),transparent)]" />
          <div className="orb orb-b bottom-[-15%] left-[10%] h-[60vh] w-[50vw] bg-[radial-gradient(closest-side,rgba(80,112,165,0.26),transparent)]" />
        </div>
        <div aria-hidden className="ambient-grid no-print pointer-events-none fixed inset-0 opacity-60" />
        {/* Sidebar (desktop) */}
        <aside className="no-print sticky top-0 z-20 hidden h-screen flex-col border-r border-white/[0.06] bg-[#0b0f14]/55 backdrop-blur-xl lg:flex">
          <div className="px-6 pb-7 pt-6"><a href={`#${home}`} onClick={() => setActive("top")} aria-label="Dashboard home"><Brand /></a></div>
          <nav aria-label="Main" className="flex-1 space-y-7 overflow-y-auto px-4">
            {groups.map((g, i) => (
              <div key={i}>
                {g.title && <p className="mb-2.5 px-4 font-display text-[12.5px] font-bold uppercase tracking-[0.14em] text-slate-500">{g.title}</p>}
                <div className="space-y-0.5">{g.items.map((it) => navButton(it))}</div>
              </div>
            ))}
          </nav>
          <div className="space-y-3 border-t border-line p-4">
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-raised font-display text-[13px] font-bold text-champagne ring-1 ring-gold/30">{initials}</span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate font-display text-[16px] font-bold text-ink">{session.display_name}</span>
                <span className="block truncate text-[13.5px] text-mute">{roleLabel}</span>
              </span>
              {onLogout && (
                <button type="button" onClick={onLogout} title="Sign out" aria-label="Sign out"
                  className="grid h-8 w-8 place-items-center rounded-lg text-mute transition-colors hover:bg-white/[0.04] hover:text-critical-text">
                  <LogOut className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          </div>
        </aside>

        <div className="relative flex min-w-0 flex-col">
          {/* Top bar: mobile shows brand + nav strip + MOCK note; desktop shows a thin context bar */}
          <header className="no-print sticky top-0 z-30 border-b border-white/[0.06] bg-[#0b0f14]/60 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 px-4 py-3 lg:hidden">
              <a href={`#${home}`} aria-label="Dashboard home"><Brand /></a>
              {onLogout && (
                <button type="button" onClick={onLogout} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-mute hover:text-ink">
                  <LogOut className="h-4 w-4" aria-hidden /> Sign out
                </button>
              )}
            </div>
            <nav aria-label="Sections" className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">
              {groups.flatMap((g) => g.items).map((it) => navButton(it, true))}
            </nav>
            <p className="border-t border-line px-4 py-1.5 text-[11px] text-warning-text lg:hidden" role="note">Prototype · synthetic data · registries, OTP and logins are MOCK</p>
            <div className="hidden items-center justify-between gap-4 px-8 py-4 lg:flex">
              <div className="flex items-center gap-4 text-[15px] text-mute">
                <span className="flex items-center gap-2">
                  <span>{roleLabel}</span>
                  <span className="text-slate-300" aria-hidden>/</span>
                  <span className="font-display font-semibold text-slate-800">{PAGE_LABEL(currentHash, home)}</span>
                </span>
                <span aria-hidden className="h-4 w-px bg-white/10" />
                <span className="hidden text-[13.5px] text-slate-500 xl:inline">SIH26263 prototype · not an official Government of India or AICTE website</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[14.5px] text-mute">
                  {new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                </span>
                <span aria-hidden className="h-4 w-px bg-white/10" />
                <span className="flex items-center gap-2.5">
                  <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.05] font-display text-[13px] font-bold text-champagne ring-1 ring-gold/30">{initials}</span>
                  <span className="max-w-[240px] truncate text-[15px] font-semibold text-slate-800">{session.display_name}</span>
                </span>
                {onLogout && (
                  <button type="button" onClick={onLogout}
                    className="group inline-flex items-center gap-1.5 rounded-lg border border-white/[0.09] bg-white/[0.03] px-4 py-2 text-[15px] font-semibold text-slate-800 transition-colors hover:border-critical-border hover:bg-critical-bg hover:text-critical-text">
                    <LogOut className="h-4 w-4" aria-hidden /> Sign out
                  </button>
                )}
              </div>
            </div>
          </header>

          <AnimatePresence mode="wait">
            <motion.main key={currentHash || "default"}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {children}
            </motion.main>
          </AnimatePresence>

          <footer className="no-print border-t border-line px-4 py-5 text-[11px] text-slate-400 sm:px-8">
            <div className="flex flex-col justify-between gap-2 sm:flex-row">
              <span>Designed in line with the principles of the DPDP Act 2023 · not a compliance claim</span>
              <span>SIH26263 prototype · W3C Verifiable Credentials (eddsa-jcs-2022) · hash-chained seat ledger</span>
            </div>
          </footer>
        </div>
      </div>
    </MotionConfig>
  );
}
