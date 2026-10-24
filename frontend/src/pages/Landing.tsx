import { useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, Building2, GraduationCap, Landmark, ShieldCheck, UserRound } from "lucide-react";
import { getJson, type S } from "../api/client";
import Hero from "../components/Hero";
import IndiaMap from "../components/IndiaMap";

const fmt = (n: number) => n.toLocaleString("en-IN");

const ROLES = [
  { icon: Building2, title: "Institutions", body: "Upload student records, fix row-level issues, issue enrolment credentials.", href: "#/signin?as=institution", cta: "Sign in" },
  { icon: GraduationCap, title: "Universities", body: "Award degrees as verifiable credentials for affiliated colleges.", href: "#/signin?as=university", cta: "Sign in" },
  { icon: Landmark, title: "AICTE and regulators", body: "Monitor seats nationally, review duplicate cases and the inspection queue.", href: "#/signin?as=aicte", cta: "Sign in" },
  { icon: ShieldCheck, title: "Employers and verifiers", body: "Check credentials with the student's consent. Accounts are approved by AICTE.", href: "#/request-access", cta: "Request access" },
  { icon: UserRound, title: "Students and guardians", body: "See your record, approve or refuse each request, share your credentials.", href: "#/signin?as=student", cta: "Use passkey" },
] as const;

export default function Landing() {
  const [stats, setStats] = useState<S["PublicStats"] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { getJson<S["PublicStats"]>("/v1/public/stats").then(setStats).catch(() => setFailed(true)); }, []);

  const values = stats ? Object.fromEntries(stats.states.filter((s) => s.reporting > 0).map((s) => [s.state, s.students ?? null])) : undefined;
  const top = stats ? [...stats.states].filter((s) => s.students).sort((a, b) => (b.students ?? 0) - (a.students ?? 0)).slice(0, 5) : [];
  const topMax = top[0]?.students ?? 1;

  return (
    <div className="space-y-16">
      <section className="grid grid-cols-1 items-center gap-10 pt-4 lg:pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <Hero />
        <figure className="rise relative" style={{ ["--d" as string]: "200ms" }}>
          <IndiaMap className="mx-auto w-full max-w-[620px]" values={values} />
          <figcaption className="mx-auto mt-2 max-w-[620px]">
            <p className="text-center text-[12px] text-[#8b9bbd]">
              {stats ? <>Students recorded by state, academic year {stats.academic_year}. Hover a state for its count.</>
                : failed ? "Live figures are unavailable right now." : "Loading live figures…"}
            </p>
            {top.length > 0 && (
              <ol className="mx-auto mt-4 max-w-[420px] space-y-2" aria-label="States with the most students recorded">
                {top.map((s) => (
                  <li key={s.state} className="grid grid-cols-[120px_1fr_64px] items-center gap-3 text-[12.5px]">
                    <span className="truncate text-[#c3cfe8]">{s.state}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
                      <span className="block h-full rounded-full bg-gradient-to-r from-[#3b6bff] to-[#8ea8ff]" style={{ width: `${(100 * (s.students ?? 0)) / topMax}%` }} />
                    </span>
                    <span className="text-right font-mono tabular-nums text-[#dbe4ff]">{fmt(s.students ?? 0)}</span>
                  </li>
                ))}
              </ol>
            )}
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="live-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="live-heading" className="font-manrope text-[22px] font-extrabold tracking-[-0.02em] text-white">This academic year so far</h2>
          <p className="flex items-center gap-2 text-[12px] text-[#8b9bbd]"><span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
            Live from submitted records{stats ? ` · ${stats.academic_year}` : ""}</p>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[22px] border border-white/[0.08] bg-white/[0.06] lg:grid-cols-4">
          <Tile label="Institutions reporting" value={stats && fmt(stats.institutions_reporting)} note={stats && `of ${fmt(stats.institutions_approved)} AICTE-approved`} />
          <Tile label="Students recorded" value={stats && fmt(stats.students_recorded)} note="active enrolments, each keyed by APAAR ID" />
          <Tile label="States covered" value={stats && fmt(stats.states_covered)} note="with at least one reporting institution" />
          <Tile label="Credentials issued" value={stats && fmt(stats.credentials_issued)} note="W3C verifiable credentials" />
        </dl>
      </section>

      <section aria-labelledby="roles-heading">
        <h2 id="roles-heading" className="font-manrope text-[22px] font-extrabold tracking-[-0.02em] text-white">Who signs in here</h2>
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {ROLES.map(({ icon: Icon, title, body, href, cta }) => (
            <li key={title}>
              <a href={href} className="group flex h-full flex-col rounded-[20px] border border-white/[0.08] bg-[#0a1024]/55 p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-[#7aa2ff]/40">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] text-[#b9caff]" aria-hidden><Icon className="h-5 w-5" /></span>
                <span className="mt-4 font-manrope text-[16px] font-bold text-white">{title}</span>
                <span className="mt-1.5 flex-1 text-[13.5px] leading-relaxed text-[#8b9bbd]">{body}</span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#9db4ff]">
                  {cta}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-5 flex items-center gap-2 text-[13px] text-[#8b9bbd]">
          <BadgeCheck className="h-4 w-4 text-[#8ea8ff]" aria-hidden />
          New institution or university account? <a href="#/activate" className="font-semibold text-[#c3d2ff] underline decoration-white/20 underline-offset-2 hover:text-white">Activate it with your AICTE code</a>.
        </p>
      </section>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string | null | undefined | false; note?: string | null | false }) {
  return (
    <div className="bg-[#070c20]/85 p-6">
      <dt className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-[#8b9bbd]">{label}</dt>
      <dd className="mt-3 font-manrope text-[38px] font-extrabold leading-none tracking-[-0.03em] text-white tabular-nums">
        {value || <span className="inline-block h-9 w-24 animate-pulse rounded-lg bg-white/[0.06]" aria-label="loading" />}
      </dd>
      {note && <dd className="mt-2 text-[12.5px] text-[#7d8bab]">{note}</dd>}
    </div>
  );
}
