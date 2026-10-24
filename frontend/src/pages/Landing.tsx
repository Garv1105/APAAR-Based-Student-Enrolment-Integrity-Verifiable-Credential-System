import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight, BarChart3, BadgeCheck, Building2, FileCheck2, Landmark, Network, PlayCircle, ShieldCheck, Upload, Users, UserRound,
} from "lucide-react";
import { getJson, type S } from "../api/client";
import IndiaMap from "../components/IndiaMap";

const fmt = (n: number) => n.toLocaleString("en-IN");
const d = (ms: number) => ({ ["--d" as string]: `${ms}ms` });
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

const FEATURES = [
  [ShieldCheck, "Trusted", "verification"],
  [BarChart3, "Real-time", "transparency"],
  [Users, "Unified national", "network"],
  [FileCheck2, "Better access", "for students"],
] as const;

const ROLES = [
  { icon: Landmark, title: "For institutions", body: "Submit, validate and manage student records. Universities award degree credentials.", href: "#/signin?as=institution" },
  { icon: ShieldCheck, title: "For regulators", body: "Monitor seat integrity and review anomalies and duplicate cases in real time.", href: "#/signin?as=aicte" },
  { icon: FileCheck2, title: "For verifiers", body: "Verify academic credentials with the student's consent. Accounts are approved by AICTE.", href: "#/request-access" },
  { icon: UserRound, title: "For students", body: "See your record, approve each request and share verified credentials, anytime.", href: "#/signin?as=student" },
] as const;

const STEPS = [
  [Upload, "Institutions upload", "Student-level records keyed by APAAR ID, through the portal or their ERP."],
  [BadgeCheck, "Every row is validated", "APAAR registry match, duplicates, dates and seats against AICTE-approved intake."],
  [Network, "AICTE monitors", "Excess admissions, cross-institution duplicates and anomalies, ranked for inspection."],
  [FileCheck2, "Credentials, with consent", "W3C verifiable credentials that students share only when they approve."],
] as const;

export default function Landing({ section }: { section?: string | null }) {
  const [stats, setStats] = useState<S["PublicStats"] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { getJson<S["PublicStats"]>("/v1/public/stats").then(setStats).catch(() => setFailed(true)); }, []);
  useEffect(() => { if (section) setTimeout(() => scrollTo(section), 60); }, [section]);

  const values = stats ? Object.fromEntries(stats.states.filter((s) => s.reporting > 0).map((s) => [s.state, s.students ?? null])) : undefined;

  return (
    <div className="space-y-24">
      {/* ---------- hero ---------- */}
      <section className="relative isolate -mx-5 grid grid-cols-1 items-center gap-12 overflow-hidden px-5 pb-10 pt-6 sm:-mx-8 sm:px-8 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:pt-14">
        <div aria-hidden className="horizon pointer-events-none absolute -right-[38%] top-[58%] -z-10 hidden h-[900px] w-[1300px] lg:block" />
        <div className="relative">
          <p className="rise flex items-center gap-4 text-[12px] font-medium tracking-[0.24em] text-[#d5d9de]" style={d(40)}>
            <span aria-hidden className="h-px w-8 bg-[#d4af37]" />A TRUSTED ACADEMIC ECOSYSTEM FOR A STRONGER INDIA
          </p>
          <h1 className="rise mt-7 font-manrope text-[44px] font-bold leading-[1.06] tracking-[-0.035em] text-white sm:text-[54px] xl:text-[60px]" style={d(110)}>
            Verified education<br /><span className="gold-text">for a stronger, fairer India.</span>
          </h1>
          <p className="rise mt-7 max-w-[560px] text-[17px] leading-[1.7] text-[#b8bec8]" style={d(190)}>
            VidyaPramaan gives AICTE student-level, APAAR-keyed records from every approved institution: each row validated,
            every seat checked against approved intake, and credentials students share only when they choose to.
          </p>
          <div className="rise mt-9 flex flex-wrap items-center gap-4" style={d(260)}>
            <button type="button" onClick={() => scrollTo("roles")}
              className="btn-gold group inline-flex items-center gap-2.5 rounded-xl px-7 py-4 font-manrope text-[15.5px] font-bold">
              Explore the platform <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </button>
            <button type="button" onClick={() => scrollTo("how")}
              className="inline-flex items-center gap-2.5 rounded-xl border border-white/25 px-6 py-4 font-manrope text-[15.5px] font-semibold text-white transition-colors hover:border-[#d4af37]/60 hover:bg-white/[0.04]">
              <PlayCircle className="h-5 w-5" aria-hidden />See how it works
            </button>
          </div>
          <ul className="rise mt-12 grid max-w-[640px] grid-cols-2 gap-y-5 sm:grid-cols-4" style={d(330)}>
            {FEATURES.map(([Icon, a, b], i) => (
              <li key={a} className={`flex items-center gap-3 pr-3 text-[13.5px] leading-tight text-[#d5d9de] ${i ? "sm:border-l sm:border-white/10 sm:pl-4" : ""}`}>
                <Icon className="h-6 w-6 shrink-0 text-[#e3c05a]" strokeWidth={1.6} aria-hidden /><span>{a}<br />{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <figure className="rise relative" style={d(200)}>
          <IndiaMap tone="gold" className="mx-auto w-full max-w-[640px]" values={values} />
          {stats && <>
            <Callout className="right-0 top-[8%]" title={`${fmt(stats.institutions_reporting)} institutions`} sub="reporting this year" />
            <Callout className="left-0 top-[30%]" title={`${stats.states_covered} states and UTs`} sub="One academic network" />
            <Callout className="-right-2 top-[56%]" title="Real-time" sub="verification and monitoring" />
            <Callout className="right-[12%] bottom-[10%]" title={`${fmt(stats.students_recorded)} students`} sub="recorded, each by APAAR ID" />
          </>}
          <figcaption className="mt-3 text-center text-[12px] text-[#8f959f]">
            {stats ? <>States shaded by students recorded, {stats.academic_year}. Hover a state for its count.</>
              : failed ? "Live figures are unavailable right now." : "Loading live figures…"}
          </figcaption>
        </figure>
      </section>

      {/* ---------- live numbers ---------- */}
      <section id="data" aria-labelledby="data-heading" className="scroll-mt-28">
        <h2 id="data-heading" className="flex items-center justify-center gap-4 text-center text-[12px] font-medium tracking-[0.26em] text-[#e3c05a]">
          <span aria-hidden className="h-px w-16 bg-gradient-to-r from-transparent to-[#d4af37]/70" />EMPOWERING INDIA'S EDUCATION ECOSYSTEM
          <span aria-hidden className="h-px w-16 bg-gradient-to-l from-transparent to-[#d4af37]/70" />
        </h2>
        <div className="mt-6 grid grid-cols-1 overflow-hidden rounded-2xl border border-[#d4af37]/20 bg-gradient-to-b from-white/[0.05] to-white/[0.015] shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={<Building2 />} value={stats && fmt(stats.institutions_reporting)} label="Institutions reporting" note={stats && `of ${fmt(stats.institutions_approved)} AICTE-approved`} />
          <Stat icon={<Users />} value={stats && fmt(stats.students_recorded)} label="Student records" note="active enrolments, keyed by APAAR ID" />
          <Stat icon={<ShieldCheck />} value={stats && fmt(stats.states_covered)} label="States covered" note="with a reporting institution" />
          <Stat icon={<FileCheck2 />} value={stats && fmt(stats.credentials_issued)} label="Credentials issued" note="W3C verifiable credentials" />
        </div>
        <p className="mt-3 flex items-center justify-center gap-2 text-[12px] text-[#8f959f]">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />Live from submitted records{stats ? `, academic year ${stats.academic_year}` : ""}
        </p>
      </section>

      {/* ---------- who it's for ---------- */}
      <section id="roles" aria-labelledby="roles-heading" className="scroll-mt-28">
        <h2 id="roles-heading" className="font-manrope text-[30px] font-bold tracking-[-0.025em] text-white">One platform, <span className="gold-text">four roles</span></h2>
        <ul className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {ROLES.map(({ icon: Icon, title, body, href }) => (
            <li key={title}>
              <a href={href} className="group flex h-full items-start gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-[#d4af37]/40 hover:bg-white/[0.05]">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[#d4af37]/20 bg-[#d4af37]/[0.07] text-[#e3c05a]" aria-hidden>
                  <Icon className="h-6 w-6" strokeWidth={1.6} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-manrope text-[17px] font-bold text-white">{title}</span>
                  <span className="mt-1.5 block text-[13.5px] leading-relaxed text-[#a3a9b3]">{body}</span>
                </span>
                <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/20 text-white transition-colors group-hover:border-[#d4af37] group-hover:text-[#e3c05a]" aria-hidden>
                  <ArrowRight className="h-4 w-4" /></span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[13.5px] text-[#a3a9b3]">
          New institution, university or verifier account? <a href="#/activate" className="font-semibold text-[#f1d488] underline decoration-[#d4af37]/40 underline-offset-2 hover:text-white">Activate it with your AICTE code</a>.
        </p>
      </section>

      {/* ---------- how it works ---------- */}
      <section id="how" aria-labelledby="how-heading" className="scroll-mt-28 pb-6">
        <h2 id="how-heading" className="font-manrope text-[30px] font-bold tracking-[-0.025em] text-white">How it <span className="gold-text">works</span></h2>
        <ol className="mt-7 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map(([Icon, title, body], i) => (
            <li key={title} className="bg-[#0d1218]/90 p-6">
              <span className="flex items-center gap-3">
                <span className="font-mono text-[13px] tracking-[0.18em] text-[#d4af37]">0{i + 1}</span>
                <Icon className="h-5 w-5 text-[#e3c05a]" strokeWidth={1.6} aria-hidden />
              </span>
              <span className="mt-4 block font-manrope text-[17px] font-bold text-white">{title}</span>
              <span className="mt-1.5 block text-[13.5px] leading-relaxed text-[#a3a9b3]">{body}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Callout({ className, title, sub }: { className: string; title: string; sub: string }) {
  return (
    <div className={`pointer-events-none absolute hidden rounded-lg border border-white/15 bg-[#0b0f14]/75 px-3.5 py-2 backdrop-blur-md lg:block ${className}`}>
      <p className="text-[13px] font-semibold text-white">{title}</p>
      <p className="text-[11.5px] text-[#b8bec8]">{sub}</p>
    </div>
  );
}

function Stat({ icon, value, label, note }: { icon: ReactNode; value: string | null | false; label: string; note?: string | null | false }) {
  return (
    <div className="flex items-start gap-4 border-white/[0.08] p-7 sm:[&:nth-child(n+2)]:border-l">
      <span className="mt-1 text-[#e3c05a] [&>svg]:h-8 [&>svg]:w-8 [&>svg]:stroke-[1.5]" aria-hidden>{icon}</span>
      <div>
        <p className="font-manrope text-[36px] font-bold leading-none tracking-[-0.02em] text-white tabular-nums">
          {value || <span className="inline-block h-9 w-24 animate-pulse rounded-lg bg-white/[0.06]" aria-label="loading" />}
        </p>
        <p className="mt-2 text-[14.5px] text-[#d5d9de]">{label}</p>
        {note && <p className="mt-0.5 text-[12px] text-[#8f959f]">{note}</p>}
      </div>
    </div>
  );
}
