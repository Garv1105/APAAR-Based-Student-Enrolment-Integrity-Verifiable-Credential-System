import { useRef, useState, type ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  AlertTriangle, Armchair, ArrowRight, ArrowUpRight, BadgeCheck, BarChart3, CalendarDays, CheckCircle2, FileDown, FileSpreadsheet,
  IdCard, Megaphone, ShieldCheck, UploadCloud, Users,
} from "lucide-react";
import { ApiError, download, getJson, uploadCsv, type S } from "../api/client";
import { ColumnMatcher } from "../ai";
import { EnrolmentLookup } from "./Registrar";
import IndiaMap from "../components/IndiaMap";
import { useMounted } from "../components/motion";
import { COMPONENT_HELP, COMPONENT_LABEL, FLAG_INFO, FLAG_LABEL } from "../risk";
import { AnimatedCounter, Badge, Button, Empty, ErrorNote, go, Loading, Ring, SparkBars, usePoll } from "../ui";

const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);
const GOLD_TEXT = "bg-gradient-to-b from-[#FBE7A1] via-[#E2BC4A] to-[#C9982A] bg-clip-text text-transparent";

/**
 * Institution dashboard, laid out as an editorial page rather than a grid of cards: an identity hero, one instrument
 * band of live figures, then numbered open sections. Only the upload console sits on a surface, because that is where
 * the user acts.
 */
export default function InstitutionHome() {
  const { data, error, refresh } = usePoll(() => getJson<S["InstitutionDashboard"]>("/v1/dashboard/institution"));
  const risk = usePoll(() => getJson<S["InstitutionRisk"]>("/v1/dqs"), 10000);

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;

  const cov = data.apaar_coverage;
  const active = Object.values(cov).reduce((a, b) => a + b, 0);
  const verified = cov.VERIFIED ?? 0;
  const withoutApaar = (cov.REFUSED ?? 0) + (cov.NOT_GENERATED ?? 0) + (cov.PENDING ?? 0);
  const chrono = [...data.batches].reverse(); // API returns newest first
  const year = data.programmes[0]?.academic_year;
  const regFilled = data.programmes.reduce((a, p) => a + (p.lines.find((l) => l.category_code === "REGULAR")?.filled ?? 0), 0);
  const intake = data.programmes.reduce((a, p) => a + p.approved_intake, 0);
  const why = ([[cov.REFUSED, "refused"], [cov.PENDING, "pending"], [cov.NOT_GENERATED, "not generated"]] as const)
    .filter(([n]) => n).map(([n, w]) => `${n} ${w}`).join(", ");

  return (
    <div className="pb-6">
      {/* ---------- hero ---------- */}
      <header className="relative grid gap-10 pt-2 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_250px_350px] xl:items-center">
        <div className="rise min-w-0">
          <p className="flex items-center gap-3 text-[12.5px] font-semibold uppercase tracking-[0.26em] text-slate-600">
            <span aria-hidden className="h-px w-10 bg-gold" />Institution dashboard
          </p>
          <h1 className="mt-5 font-display text-[42px] font-bold leading-[1.04] tracking-[-0.035em] text-ink sm:text-[54px] 2xl:text-[60px]">{data.name}</h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-slate-600">
            Student records keyed by APAAR ID, validated row by row and checked against AICTE-approved seats.
          </p>
          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-5">
            <Fact icon={IdCard} k="AICTE ID"><span className="font-mono text-[17px] tracking-tight">{data.institution_id}</span></Fact>
            <Fact icon={CalendarDays} k="Academic year">{year ?? "Not set"}</Fact>
            <Fact icon={Armchair} k="Approved intake"><span className="inline-flex items-center gap-2">{intake}<Badge tone="warning">MOCK</Badge></span></Fact>
          </dl>
        </div>
        <div aria-hidden className="pointer-events-none relative hidden xl:block">
          <div className="absolute inset-0 -m-12 rounded-full bg-[radial-gradient(closest-side,rgba(212,175,55,0.16),transparent)]" />
          <IndiaMap tone="gold" className="relative mx-auto w-[240px]" />
        </div>
        <Bulletin notices={data.open_notices} />
      </header>
      {error && <div className="mt-6"><ErrorNote>{error}</ErrorNote></div>}

      {/* ---------- instrument band ---------- */}
      <section aria-label="Key figures" className="relative mt-12 border-y border-white/[0.07] bg-gradient-to-r from-gold/[0.05] via-transparent to-gold/[0.05]">
        <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          <Figure n={0} icon={Users} k="Enrolments" v={<AnimatedCounter value={active} />}
            note={withoutApaar ? <><span className="text-warning-text">{withoutApaar} without APAAR</span>{why && ` (${why})`}. All count toward intake.</> : "All count toward intake."}
            visual={<SparkBars values={chrono.map((b) => b.counts.accepted)} label="Accepted rows per upload batch, oldest to newest" />} />
          <Figure n={1} icon={ShieldCheck} k="APAAR verified" v={<AnimatedCounter value={verified} />}
            note={<><span className="font-semibold text-success-text">{pct(verified, active)}%</span> of active enrolments.</>} />
          <Figure n={2} icon={AlertTriangle} k="Rows rejected" v={<AnimatedCounter value={data.rejected_rows_total} />} tone={data.rejected_rows_total ? "text-critical-text" : undefined}
            note="Not counted until corrected and re-uploaded."
            visual={<SparkBars values={chrono.map((b) => b.counts.rejected)} color="var(--color-critical)" label="Rejected rows per upload batch, oldest to newest" />} />
          <Figure n={3} icon={BarChart3} k="Seat utilisation" v={<>{pct(regFilled, intake)}<span className="text-[0.5em] text-slate-500">%</span></>}
            note={<><span className="tabular-nums text-ink">{regFilled} of {intake}</span> regular seats filled.</>}
            visual={<Ring value={intake ? regFilled / intake : 0} size={60} stroke={6} gradient={["#B8892A", "#FBE7A1"]} label={`${pct(regFilled, intake)}% of approved intake filled`} />} />
        </dl>
      </section>

      <div className="mt-16 space-y-24">
        <Section id="upload" n="01" title="Upload & validate"
          lede="Drop the term's student file. Every row runs through the same five checks, in order, before it can count toward your intake.">
          <Upload onDone={refresh} />
        </Section>

        <Section id="seats" n="02" title="Seats against approved intake" aside={<>Limits from the AICTE registry <Badge tone="warning">MOCK</Badge></>}>
          <div className="grid gap-14 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <Seats programmes={data.programmes} />
            <Categories programmes={data.programmes} />
          </div>
        </Section>

        <Section id="quality" n="03" title="Data quality & integrity" aside="What AICTE's inspection queue sees">
          <Quality risk={risk.data} error={risk.error} />
        </Section>

        <Section id="batches" n="04" title="Upload history" aside="Newest first · open a batch for row-level issues">
          <History batches={data.batches} />
        </Section>

        <Section id="students" n="05" title="Students & credentials"
          lede="Find a student to see their enrolment, issue a verifiable credential, or record that they completed or withdrew.">
          <div className="grid gap-14 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <EnrolmentLookup mode="institution" bare />
            <Tools />
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ---------- layout primitives ---------- */

function Section({ id, n, title, lede, aside, children }: { id: string; n: string; title: string; lede?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-28">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <div className="min-w-0 max-w-3xl">
          <p className="flex items-center gap-3 font-mono text-[13px] font-medium tracking-[0.18em] text-gold">
            {n}<span aria-hidden className="h-px w-10 bg-gradient-to-r from-gold/70 to-transparent" />
          </p>
          <h2 id={`${id}-h`} className="mt-3 font-display text-[30px] font-bold leading-tight tracking-[-0.025em] text-ink sm:text-[34px]">{title}</h2>
          {lede && <p className="mt-3 text-[16.5px] leading-relaxed text-slate-600">{lede}</p>}
        </div>
        {aside && <div className="flex items-center gap-2 pb-1 text-[14.5px] text-slate-600">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function Fact({ icon: Icon, k, children }: { icon: React.ElementType; k: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5">
      <Icon className="h-6 w-6 shrink-0 text-gold" strokeWidth={1.6} aria-hidden />
      <div>
        <dt className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">{k}</dt>
        <dd className="mt-0.5 font-display text-[20px] font-bold tabular-nums text-ink">{children}</dd>
      </div>
    </div>
  );
}

function Figure({ n, icon: Icon, k, v, note, visual, tone }: { n: number; icon: React.ElementType; k: string; v: ReactNode; note: ReactNode; visual?: ReactNode; tone?: string }) {
  return (
    <div style={{ ["--d" as string]: `${80 + n * 60}ms` }} className="rise relative flex min-w-0 items-start justify-between gap-4 px-6 py-7 xl:px-7">
      {n > 0 && <span aria-hidden className="absolute inset-y-8 left-0 hidden w-px bg-gradient-to-b from-transparent via-white/[0.09] to-transparent xl:block" />}
      <div className="min-w-0">
        <dt className="flex items-center gap-2 text-[14.5px] font-medium text-slate-700"><Icon className="h-[18px] w-[18px] text-gold" aria-hidden />{k}</dt>
        <dd className={`mt-3 font-display text-[54px] font-bold leading-none tracking-[-0.04em] tabular-nums ${tone ?? "text-ink"}`}>{v}</dd>
        <dd className="mt-3 text-[14.5px] leading-snug text-slate-600">{note}</dd>
      </div>
      {visual && <div className="shrink-0 self-center pt-6">{visual}</div>}
    </div>
  );
}

/* ---------- AICTE bulletin ---------- */

function Bulletin({ notices }: { notices: string[] }) {
  return (
    <aside aria-labelledby="bulletin-h" style={{ ["--d" as string]: "80ms" }} className="rise relative lg:pl-8">
      <span aria-hidden className="absolute inset-y-0 left-0 hidden w-px bg-gradient-to-b from-gold/0 via-gold/45 to-gold/0 lg:block" />
      <h2 id="bulletin-h" className="flex items-center gap-2.5 text-[12.5px] font-semibold uppercase tracking-[0.22em] text-gold">
        <Megaphone className="h-4 w-4" aria-hidden />Bulletin from AICTE
      </h2>
      {notices.length === 0 ? (
        <div className="mt-5">
          <p className="font-display text-[24px] font-bold leading-snug text-ink">All clear.</p>
          <p className="mt-2 flex items-start gap-2 text-[15.5px] leading-relaxed text-slate-600">
            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-success-text" aria-hidden />No open notices. AICTE has not raised any case on your uploads.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-5 font-display text-[24px] font-bold leading-snug text-ink">
            <span className={GOLD_TEXT}>{notices.length}</span> open {notices.length === 1 ? "notice" : "notices"}
          </p>
          <ol className="mt-4 max-h-[210px] space-y-3 overflow-y-auto pr-2">
            {notices.map((n, i) => (
              <li key={i} className="flex gap-3.5 text-[15.5px] leading-snug text-slate-800">
                <span className="mt-0.5 font-mono text-[13px] text-gold/80">{String(i + 1).padStart(2, "0")}</span>{n}
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="mt-5 text-[13.5px] leading-relaxed text-slate-500">Notices never reveal another institution's data. AICTE reviews each case.</p>
    </aside>
  );
}

/* ---------- 01 upload: drop zone + validation pipeline ---------- */

const PIPELINE = [
  ["Format & columns", "18-column template, field types and required values."],
  ["APAAR registry match", "Each ID is checked against the APAAR registry (MOCK)."],
  ["Duplicates", "Within your file and across institutions, without revealing the other institution."],
  ["Seat limits", "Accepted rows count toward AICTE-approved intake, with or without APAAR."],
  ["Row-level report", "Rejected rows are listed with the reason, ready to fix and re-upload."],
] as const;

function Upload({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<S["BatchOut"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<File | null>(null);

  async function send(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setMismatch(null);
    try {
      setResult(await uploadCsv(file));
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && e.title === "Missing required columns") setMismatch(file);
      setError(e instanceof ApiError ? e.text : "Upload failed: cannot reach the API.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="glass rise overflow-hidden rounded-3xl">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="p-3 sm:p-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files[0]); }}
            className={`relative flex h-full min-h-[300px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed px-8 py-10 text-center transition-colors duration-300 ${drag ? "border-gold/80 bg-gold/[0.07]" : "border-gold/25 bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.09),transparent_65%)] hover:border-gold/50"}`}
          >
            <span className={`grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-gold/30 to-gold/[0.05] text-champagne ring-1 ring-gold/35 shadow-[0_12px_32px_-12px_rgba(212,175,55,0.8)] transition-transform duration-300 ${drag ? "scale-110" : ""}`} aria-hidden>
              <UploadCloud className="h-7 w-7" />
            </span>
            <p className="mt-6 font-display text-[22px] font-bold text-ink">Drop your CSV file here</p>
            <p className="mt-2 text-[15.5px] text-slate-600">or pick it from your computer</p>
            <Button className="mt-6 rounded-full bg-gradient-to-b from-[#F3D573] to-[#C9982A] px-7 py-2.5 text-[15px] shadow-[0_10px_28px_-10px_rgba(212,175,55,0.7)]" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? "Validating…" : "Choose file"}
            </Button>
            <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file" onChange={(e) => send(e.target.files?.[0])} />
            <p className="mt-6 text-[14px] text-slate-500">CSV only · re-uploading the same file is safe, it returns the original batch</p>
          </div>
        </div>

        <ol className="relative px-7 py-8 sm:px-10" aria-label="Checks run on every row, in order">
          {PIPELINE.map(([t, d], i) => (
            <li key={t} className="relative flex gap-5 pb-6 last:pb-0">
              {i < PIPELINE.length - 1 && <span aria-hidden className="absolute bottom-0 left-[17px] top-10 w-px bg-gradient-to-b from-gold/50 to-gold/10" />}
              <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gold/45 bg-[#0e131a] font-mono text-[13px] font-semibold text-champagne">{i + 1}</span>
              <div className="pt-1">
                <p className="text-[16.5px] font-semibold text-ink">{t}</p>
                <p className="mt-1 text-[14.5px] leading-relaxed text-slate-600">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div aria-live="polite">
        {error && <div className="border-t border-white/[0.07] p-5"><ErrorNote>{error}</ErrorNote>
          {mismatch && <div className="mt-4"><ColumnMatcher file={mismatch} onUpload={(f) => send(f)} onCancel={() => setMismatch(null)} /></div>}</div>}
        {result && (
          <div className="border-t border-white/[0.07] bg-white/[0.02] px-7 py-6 sm:px-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex flex-wrap items-center gap-2.5 font-display text-[19px] font-bold text-ink">
                Batch #{result.batch_id}
                {result.replayed ? <Badge tone="brand">Already uploaded · original batch returned</Badge> : <Badge tone="ok" dot>Validated</Badge>}
              </p>
              <Button variant="ghost" onClick={() => go(`/inst/batch/${result.batch_id}`)}>Row-level issues <ArrowRight className="h-4 w-4" /></Button>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-5">
              {([["Rows", result.counts.rows, "text-ink"], ["Accepted", result.counts.accepted, "text-success-text"],
                ["Rejected", result.counts.rejected, "text-critical-text"], ["Warnings", result.counts.warnings, "text-warning-text"],
                ["Flagged for AICTE", result.counts.flags, "text-flag-text"]] as const).map(([k, v, c]) => (
                <div key={k}><dt className="text-[13.5px] text-slate-600">{k}</dt><dd className={`mt-1 font-display text-[30px] font-bold tabular-nums ${c}`}>{v.toLocaleString()}</dd></div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- 02 seats ---------- */

// Category colours. The base hues are validated with the dataviz palette checker (colour-blind safe on the dark
// surface, all pairs); each is drawn as a two-tone gradient around its base. Shared by the seat bars and the donut,
// so a colour means the same category everywhere on the page.
const CAT = { regular: "#7c6cff", sn: "#ec4899", ciwg: "#cf7a00" } as const;
const GRAD = {
  regular: ["#5b48ff", "#a99cff"],
  sn: ["#db2777", "#f472b6"],
  ciwg: ["#c2650a", "#f6b23c"],
} as const;
const lin = ([a, b]: readonly [string, string]) => `linear-gradient(90deg, ${a}, ${b})`;

function Seats({ programmes }: { programmes: S["ProgrammeSeats"][] }) {
  if (programmes.length === 0) return <Empty>No approved programmes for this year.</Empty>;
  const legend = [["Regular", lin(GRAD.regular)], ["Supernumerary FN / OCI", lin(GRAD.sn)], ["CIWG", lin(GRAD.ciwg)], ["Over limit", "var(--color-critical)"]] as const;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-slate-600">
        {legend.map(([k, c]) => <span key={k} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c }} aria-hidden />{k}</span>)}
      </div>
      <ul className="mt-8 divide-y divide-white/[0.06]">
        {programmes.map((p) => {
          const reg = p.lines.find((l) => l.category_code === "REGULAR");
          const sn = p.lines.find((l) => l.category_code === "SN_FN_OCI_CIWG");
          const ciwg = p.lines.find((l) => l.category_code === "SN_FN_OCI_CIWG:CIWG");
          const filled = reg?.filled ?? 0, cap = reg?.cap ?? p.approved_intake;
          return (
            <li key={p.programme_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-8 py-6 first:pt-0">
              <div className="min-w-0">
                <p className="truncate text-[17px] font-semibold text-ink" title={p.name}>{p.name}</p>
                <SeatBar line={reg ?? { category_code: "REGULAR", filled, cap, excess: 0 }} color={lin(GRAD.regular)} thick />
                {sn && <SnBar sn={sn} ciwg={ciwg} />}
                <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[14px] text-slate-600">
                  <span><span className="font-semibold tabular-nums text-ink">{filled}</span> of {cap} regular</span>
                  {sn && <span>Supernumerary <span className="font-semibold tabular-nums text-ink">{sn.filled} / {sn.cap}</span></span>}
                  {ciwg && <span>CIWG <span className="font-semibold tabular-nums text-ink">{ciwg.filled} / {ciwg.cap}</span></span>}
                  {p.lines.filter((l) => l.excess > 0).map((l) => (
                    <Badge key={l.category_code} tone="error">+{l.excess} over {l.category_code === "REGULAR" ? "intake" : "quota"}</Badge>
                  ))}
                </p>
              </div>
              <p className="font-display text-[40px] font-bold leading-none tracking-[-0.04em] tabular-nums text-ink">
                {pct(filled, cap)}<span className="text-[20px] text-slate-500">%</span>
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One category line: coloured fill within the cap, red for seats beyond it. */
export function SeatBar({ line, color = "var(--color-gold)", thick = false }: { line: S["SeatLine"]; color?: string; thick?: boolean }) {
  const on = useMounted(); // bars grow in from zero on first paint
  const max = Math.max(line.cap, line.filled, 1);
  const within = on ? Math.min(line.filled, line.cap) : 0;
  return (
    <div className={`mt-3 flex overflow-hidden rounded-full bg-white/[0.07] ${thick ? "h-3" : "h-1.5"}`} role="meter" aria-valuemin={0} aria-valuemax={line.cap} aria-valuenow={line.filled}
      aria-label={`${line.category_code}: ${line.filled} of ${line.cap} seats${line.excess > 0 ? `, ${line.excess} over` : ""}`}>
      <div className="h-full rounded-full transition-[width] duration-1000 ease-out" style={{ width: `${(within / max) * 100}%`, background: color, boxShadow: `0 0 14px -1px ${CAT.regular}aa` }} />
      {line.excess > 0 && <div className="h-full bg-critical transition-[width] duration-1000 ease-out" style={{ width: `${((on ? line.excess : 0) / max) * 100}%` }} />}
    </div>
  );
}

/** Supernumerary quota: FN/OCI part in magenta, CIWG part in amber, over-quota in red. */
function SnBar({ sn, ciwg }: { sn: S["SeatLine"]; ciwg?: S["SeatLine"] }) {
  const on = useMounted();
  const max = Math.max(sn.cap, sn.filled, 1);
  const c = on ? Math.min(ciwg?.filled ?? 0, sn.cap) : 0;
  const fn = on ? Math.max(Math.min(sn.filled, sn.cap) - c, 0) : 0;
  const w = (n: number) => `${(n / max) * 100}%`;
  return (
    <div className="mt-2 flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-white/[0.07]" role="meter" aria-valuemin={0} aria-valuemax={sn.cap} aria-valuenow={sn.filled}
      aria-label={`Supernumerary: ${sn.filled} of ${sn.cap}${ciwg ? `, of which CIWG ${ciwg.filled}` : ""}${sn.excess > 0 ? `, ${sn.excess} over` : ""}`}>
      <div className="h-full rounded-full transition-[width] duration-1000 ease-out" style={{ width: w(fn), background: lin(GRAD.sn), boxShadow: `0 0 12px -1px ${CAT.sn}aa` }} />
      <div className="h-full rounded-full transition-[width] duration-1000 ease-out" style={{ width: w(c), background: lin(GRAD.ciwg), boxShadow: `0 0 12px -1px ${CAT.ciwg}aa` }} />
      {sn.excess > 0 && <div className="h-full bg-critical" style={{ width: w(on ? sn.excess : 0) }} />}
    </div>
  );
}

function Categories({ programmes }: { programmes: S["ProgrammeSeats"][] }) {
  const sum = (code: string) => programmes.reduce((a, p) => a + (p.lines.find((l) => l.category_code === code)?.filled ?? 0), 0);
  const regular = sum("REGULAR"), sn = sum("SN_FN_OCI_CIWG"), ciwg = sum("SN_FN_OCI_CIWG:CIWG");
  const intake = programmes.reduce((a, p) => a + p.approved_intake, 0);
  const total = regular + sn;
  const parts = [
    { name: "Regular", key: "regular", value: regular, color: CAT.regular },
    { name: "Supernumerary FN / OCI", key: "sn", value: Math.max(sn - ciwg, 0), color: CAT.sn },
    { name: "CIWG", key: "ciwg", value: ciwg, color: CAT.ciwg },
  ];
  if (total === 0) return <Empty>No enrolments yet.</Empty>;
  return (
    <div className="grid items-center gap-8 sm:grid-cols-[auto_minmax(0,1fr)] xl:grid-cols-1 2xl:grid-cols-[auto_minmax(0,1fr)]">
      <div className="relative mx-auto h-52 w-52" role="img" aria-label={`Filled seats by category: ${parts.map((p) => `${p.name} ${p.value}`).join(", ")}`}>
        <div aria-hidden className="absolute inset-6 rounded-full blur-2xl" style={{ background: `radial-gradient(${CAT.regular}33, transparent 70%)` }} />
        <ResponsiveContainer width="100%" height="100%">
          <PieChart style={{ filter: `drop-shadow(0 0 10px ${CAT.regular}55)` }}>
            <defs>
              {(Object.keys(GRAD) as (keyof typeof GRAD)[]).map((k) => (
                <linearGradient key={k} id={`cat-${k}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={GRAD[k][1]} /><stop offset="100%" stopColor={GRAD[k][0]} />
                </linearGradient>
              ))}
            </defs>
            {/* no animation: the dashboard polls every 3s and would replay it */}
            <Pie data={parts.filter((p) => p.value > 0)} dataKey="value" innerRadius="78%" outerRadius="100%" paddingAngle={3} cornerRadius={4}
              stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
              {parts.filter((p) => p.value > 0).map((p) => <Cell key={p.name} fill={`url(#cat-${p.key})`} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div><div className="font-display text-[42px] font-bold leading-none tabular-nums text-ink">{total}</div><div className="mt-1.5 text-[14px] text-slate-600">seats filled</div></div>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold uppercase tracking-[0.18em] text-slate-500">By category · all programmes</p>
        <ul className="mt-4 space-y-4">
          {parts.map((p) => (
            <li key={p.name} className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] pb-3.5 text-[15.5px]">
              <span className="flex min-w-0 items-center gap-3 text-slate-700">
                <span className="h-3 w-3 shrink-0 translate-y-[1px] rounded-full" style={{ background: lin(GRAD[p.key as keyof typeof GRAD]), boxShadow: `0 0 10px ${p.color}99` }} aria-hidden />{p.name}
              </span>
              <span className="shrink-0 tabular-nums"><span className="font-display text-[19px] font-bold text-ink">{p.value}</span> <span className="text-slate-500">{pct(p.value, total)}%</span></span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[14px] text-slate-600">Regular seats: <span className="font-semibold tabular-nums text-ink">{regular} of {intake}</span> approved.</p>
      </div>
    </div>
  );
}

/* ---------- 03 data quality + anomalies ---------- */

const EMERALD = "#1fe39a";
const scoreTone = (s: number) => (s >= 85 ? { c: EMERALD, t: "text-success-text", w: "Good" } : s >= 65
  ? { c: "var(--color-warning)", t: "text-warning-text", w: "Fair" } : { c: "var(--color-critical)", t: "text-critical-text", w: "Needs attention" });
const barColor = (v: number) => (v >= 0.9 ? "from-[#059669] to-[#5cf5b8]" : v >= 0.6 ? "from-[#c2650a] to-[#f6b23c]" : "from-[#b91c1c] to-[#f87171]");

function Quality({ risk, error }: { risk: S["InstitutionRisk"] | null; error: string | null }) {
  const on = useMounted();
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!risk) return <p className="py-8 text-[15.5px] text-slate-600">Loading…</p>;
  const d = risk.dqs;
  const flags = risk.flags ?? [];
  const tone = d ? scoreTone(d.score) : null;
  return (
    <div className="space-y-12">
      {!d || !tone ? <Empty>Upload student records to get a score.</Empty> : (
        <div className="grid gap-12 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div>
            <p className="flex items-end gap-2">
              <span className="font-display text-[112px] font-extrabold leading-[0.8] tracking-[-0.06em] tabular-nums" style={{ color: tone.c, textShadow: `0 0 40px ${tone.c}40` }}>{Math.round(d.score)}</span>
              <span className="pb-1 text-[20px] font-semibold text-slate-500">/ 100</span>
            </p>
            <p className={`mt-4 font-display text-[22px] font-bold ${tone.t}`}>{tone.w}</p>
            {/* scale with the same thresholds as the tone: <65 needs attention, 65-84 fair, 85+ good */}
            <div className="relative mt-6" role="img" aria-label={`Score ${Math.round(d.score)} on a 0 to 100 scale; 85 and above is good, 65 to 84 fair`}>
              <div className="flex h-2 gap-[3px] overflow-hidden rounded-full">
                <span className="h-full w-[65%] bg-critical/45" /><span className="h-full w-[20%] bg-warning/50" /><span className="h-full w-[15%] bg-success/60" />
              </div>
              <span aria-hidden className="absolute -top-1.5 h-5 w-[3px] -translate-x-1/2 rounded-full bg-ink shadow-[0_0_10px_rgba(255,255,255,0.7)] transition-[left] duration-1000"
                style={{ left: `${on ? d.score : 0}%` }} />
              <div className="relative mt-2 h-4 text-[12.5px] tabular-nums text-slate-500">
                <span className="absolute left-0">0</span><span className="absolute left-[65%] -translate-x-1/2">65</span>
                <span className="absolute left-[85%] -translate-x-1/2">85</span><span className="absolute right-0">100</span>
              </div>
            </div>
          </div>
          <ul className="grid content-start gap-x-12 gap-y-7 sm:grid-cols-2">
            {Object.entries(d.components).map(([k, v]) => (
              <li key={k} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5 text-[15.5px] text-slate-800">
                    {v >= 0.9 ? <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-success-text" aria-hidden />
                      : <AlertTriangle className={`h-[18px] w-[18px] shrink-0 ${v >= 0.6 ? "text-warning-text" : "text-critical-text"}`} aria-hidden />}
                    {COMPONENT_LABEL[k] ?? k}
                  </span>
                  <span className="shrink-0 font-display text-[18px] font-bold tabular-nums text-ink">{Math.round(v * 100)}%</span>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                  <div className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-1000 ease-out ${barColor(v)}`} style={{ width: `${on ? v * 100 : 0}%` }} />
                </div>
                <p className="mt-1.5 text-[13.5px] leading-snug text-slate-500">{COMPONENT_HELP[k] ? `${COMPONENT_HELP[k]} ` : ""}Counts for {Math.round(d.weights[k] * 100)}% of the score.</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-white/[0.07] pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-display text-[20px] font-bold text-ink">Warning signs in your data</h3>
          <p className="text-[14px] text-slate-500">Patterns AICTE looks into. A warning sign is not proof of wrongdoing.</p>
        </div>
        {flags.length === 0 ? (
          <p className="mt-4 flex items-start gap-3 text-[16px] leading-relaxed text-slate-700">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success-text" aria-hidden />
            <span><span className="font-semibold text-success-text">None.</span> Nothing unusual was found in your uploads.</span>
          </p>
        ) : (
          <ul className="mt-5 grid gap-x-10 gap-y-5 md:grid-cols-2">
            {flags.map((f, i) => (
              <li key={i} className="border-l-2 border-warning/60 pl-4">
                <p className="flex flex-wrap items-center gap-2"><Badge tone="warning">{FLAG_LABEL[f.type] ?? f.type}</Badge>{f.programme && <span className="text-[14px] text-slate-600">{f.programme}</span>}</p>
                <p className="mt-2 text-[15.5px] leading-relaxed text-slate-700">{f.explanation}</p>
                {FLAG_INFO[f.type] && <p className="mt-1 text-[14px] leading-relaxed text-slate-500">Why AICTE checks this: {FLAG_INFO[f.type].why}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------- 04 upload history: a timeline instead of a table ---------- */

const STATUS_TONE = { completed: "ok", processing: "warning", failed: "error" } as const;

function History({ batches }: { batches: S["BatchOut"][] }) {
  if (batches.length === 0) return <Empty>No uploads yet.</Empty>;
  return (
    <ol className="relative">
      {batches.slice(0, 20).map((b, i, all) => {
        const c = b.counts;
        return (
          <li key={b.batch_id} className="relative pl-10">
            {i < all.length - 1 && <span aria-hidden className="absolute bottom-0 left-[7px] top-7 w-px bg-white/[0.09]" />}
            <span aria-hidden className={`absolute left-0 top-[26px] h-[15px] w-[15px] rounded-full border-2 ${i === 0 ? "border-gold bg-gold/30 shadow-[0_0_12px_rgba(212,175,55,0.7)]" : "border-white/25 bg-[#0e131a]"}`} />
            <button type="button" onClick={() => go(`/inst/batch/${b.batch_id}`)} title="Open row-level issues"
              className="group grid w-full grid-cols-1 items-center gap-x-8 gap-y-3 rounded-2xl px-4 py-4 text-left transition-colors duration-300 hover:bg-white/[0.03] md:grid-cols-[210px_minmax(0,1fr)_auto]">
              <span>
                <span className="block font-display text-[19px] font-bold text-ink">Batch #{b.batch_id}</span>
                <span className="mt-0.5 block text-[14px] text-slate-600">
                  {new Date(b.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {b.channel === "portal_csv" ? "CSV upload" : "API"}
                </span>
              </span>
              <span className="min-w-0">
                <span className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={`${c.accepted} of ${c.rows} rows accepted, ${c.rejected} rejected`}>
                  <span className="h-full rounded-full bg-gradient-to-r from-[#059669] to-[#5cf5b8]" style={{ width: `${pct(c.accepted, c.rows)}%` }} />
                  {c.rejected > 0 && <span className="h-full rounded-full bg-critical" style={{ width: `${pct(c.rejected, c.rows)}%` }} />}
                </span>
                <span className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[14.5px] text-slate-600">
                  <span><span className="font-semibold tabular-nums text-ink">{c.rows}</span> rows</span>
                  <span><span className="font-semibold tabular-nums text-success-text">{c.accepted}</span> accepted</span>
                  <span><span className={`font-semibold tabular-nums ${c.rejected ? "text-critical-text" : "text-ink"}`}>{c.rejected}</span> rejected</span>
                  <span><span className={`font-semibold tabular-nums ${c.warnings ? "text-warning-text" : "text-ink"}`}>{c.warnings}</span> warnings</span>
                  <span><span className={`font-semibold tabular-nums ${c.flags ? "text-flag-text" : "text-ink"}`}>{c.flags}</span> flagged</span>
                </span>
              </span>
              <span className="flex items-center gap-4">
                <Badge tone={STATUS_TONE[b.status]} dot>{b.status}</Badge>
                <ArrowUpRight className="h-5 w-5 text-slate-500 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-gold" aria-hidden />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- 05 reports & tools ---------- */

function Tools() {
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.text : "Download failed"); }
  };
  const actions = [
    { icon: FileDown, title: "CSV template", sub: "Header row of the data dictionary", on: () => run(() => download("/v1/batches/template.csv", "apaar-upload-template.csv")) },
    { icon: FileSpreadsheet, title: "Accreditation pack", sub: "Intake, seats, APAAR coverage, quality", on: () => run(() => download("/v1/reports/accreditation.csv", "accreditation.csv")) },
    { icon: BarChart3, title: "Category utilisation", sub: "Quota use per programme", on: () => run(() => download("/v1/reports/category-utilisation.csv", "category-utilisation.csv")) },
    { icon: BadgeCheck, title: "Verify a credential", sub: "Paste JSON or QR text", on: () => go("/verify") },
  ];
  return (
    <div id="reports" className="scroll-mt-28">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[20px] font-bold text-ink">Reports & tools</h3>
        <span className="text-[13.5px] text-slate-500">Every export is audited</span>
      </div>
      <ul className="mt-4 border-t border-white/[0.07]">
        {actions.map((a) => (
          <li key={a.title} className="border-b border-white/[0.07]">
            <button type="button" onClick={a.on} className="group flex w-full items-center gap-4 py-4 text-left">
              <a.icon className="h-6 w-6 shrink-0 text-gold transition-transform duration-300 group-hover:scale-110" strokeWidth={1.6} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[16.5px] font-semibold text-ink transition-colors group-hover:text-champagne">{a.title}</span>
                <span className="mt-0.5 block text-[14px] text-slate-600">{a.sub}</span>
              </span>
              <ArrowUpRight className="h-5 w-5 shrink-0 text-slate-500 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-gold" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </div>
  );
}
