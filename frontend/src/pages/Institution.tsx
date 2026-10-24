import { useRef, useState } from "react";
import IndiaMap from "../components/IndiaMap";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  AlertTriangle, Armchair, ArrowRight, BadgeCheck, BarChart3, CalendarDays, IdCard, UserX, CheckCircle2, ChevronRight, FileDown, FileSpreadsheet, History, Megaphone,
  PieChart as PieIcon, ShieldCheck, Siren, UploadCloud, Users,
} from "lucide-react";
import { ApiError, download, getJson, uploadCsv, type S } from "../api/client";
import { EnrolmentLookup } from "./Registrar";
import { useMounted } from "../components/motion";
import { FLAG_LABEL, COMPONENT_LABEL } from "../risk";
import {
  Badge, Button, Card, Empty, ErrorNote, go, Loading, Meter, Ring, SparkBars, Stat, Table, Td, usePoll,
} from "../ui";

const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

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
  const util = pct(regFilled, intake);

  return (
    <div className="space-y-6">
      {/* hero: institution identity, map, AICTE notices */}
      <section className="relative grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_220px_380px] 2xl:grid-cols-[minmax(0,1fr)_280px_420px]">
        <div className="rise relative z-10 min-w-0 py-2">
          <p className="flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.28em] text-mute">
            <span aria-hidden className="h-px w-10 bg-gold" />Institution dashboard
          </p>
          <h1 className="mt-4 font-display text-[40px] font-bold leading-[1.06] tracking-[-0.035em] text-ink sm:text-[48px] 2xl:text-[54px]">
            {data.name}
          </h1>
          <p className="mt-4 max-w-lg text-[16.5px] leading-relaxed text-slate-600">
            Student records keyed by APAAR ID, validated row by row and checked against AICTE-approved seats.
          </p>
        </div>
        <div aria-hidden className="pointer-events-none hidden xl:block">
          <div className="relative">
            <div className="absolute inset-0 -m-10 rounded-full bg-[radial-gradient(closest-side,rgba(212,175,55,0.14),transparent)]" />
            <IndiaMap tone="gold" className="relative mx-auto w-[220px] 2xl:w-[270px]" />
          </div>
        </div>
        <Notices notices={data.open_notices} />
      </section>
      {/* identity ribbon: one glass panel, each fact with its own gold icon tile */}
      <dl className="glass rise grid grid-cols-1 gap-1 rounded-2xl p-2 sm:grid-cols-2 xl:grid-cols-4">
        {([
          [IdCard, "AICTE ID", <span className="font-mono text-[15.5px] tracking-tight">{data.institution_id}</span>, null],
          [CalendarDays, "Academic year", year ?? "Not set", null],
          [Armchair, "Approved intake", <span className="inline-flex items-center gap-2">{intake}<Badge tone="warning">MOCK</Badge></span>, null],
          [UserX, "Without APAAR", withoutApaar, ([[cov.REFUSED, "refused"], [cov.PENDING, "pending"], [cov.NOT_GENERATED, "not generated"]] as const).filter(([n]) => n).map(([n, w]) => `${n} ${w}`).join(" · ") || null],
        ] as const).map(([Icon, k, v, sub]) => (
          <div key={k} className="group flex min-w-0 items-center gap-3.5 rounded-xl px-3.5 py-3 transition-colors duration-300 hover:bg-white/[0.035]">
            <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-gold/25 to-gold/[0.04] text-champagne ring-1 ring-gold/30 shadow-[0_6px_20px_-10px_rgba(212,175,55,0.8)]">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mute">{k}</dt>
              <dd className="mt-0.5 whitespace-nowrap font-display text-[18px] font-bold tabular-nums text-ink">{v}</dd>
              {sub && <dd className="text-[12px] leading-snug text-slate-500">{sub}</dd>}
            </div>
          </div>
        ))}
      </dl>
      {error && <ErrorNote>{error}</ErrorNote>}

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat delay={80} label="Enrolments" value={active} icon={<Users />}
          hint={withoutApaar ? <><span className="text-warning-text">{withoutApaar} without APAAR</span> · all count toward intake</> : "All count toward intake"}
          visual={<SparkBars values={chrono.map((b) => b.counts.accepted)} label="Accepted rows per upload batch, oldest to newest" />} />
        <Stat delay={140} label="APAAR verified" value={verified} icon={<ShieldCheck />}
          hint={<><span className="font-semibold text-success-text">{pct(verified, active)}%</span> of active enrolments</>} />
        <Stat delay={200} label="Rows rejected" value={data.rejected_rows_total} tone={data.rejected_rows_total ? "error" : "neutral"} icon={<AlertTriangle />}
          hint="Not counted until corrected"
          visual={<SparkBars values={chrono.map((b) => b.counts.rejected)} color="var(--color-critical)" label="Rejected rows per upload batch, oldest to newest" />} />
        <Stat delay={260} label="Seat utilisation" value={`${util}%`} icon={<BarChart3 />}
          hint={<><span className="tabular-nums text-ink">{regFilled} / {intake}</span> regular seats filled</>}
          visual={<Ring value={intake ? regFilled / intake : 0} size={56} stroke={6} gradient={["#B8892A", "#FBE7A1"]} label={`${util}% of approved intake filled`} />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Upload onDone={refresh} />
        <QualityCard risk={risk.data} error={risk.error} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
        <SeatsCard programmes={data.programmes} />
        <AnomalyCard risk={risk.data} />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <BatchesCard batches={data.batches} />
        <CategoryCard programmes={data.programmes} />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div id="students" className="scroll-mt-28 xl:col-span-8 [&>*]:h-full"><EnrolmentLookup mode="institution" /></div>
        <QuickActions />
      </div>
    </div>
  );
}

/* ---------- AICTE notices ---------- */

function Notices({ notices }: { notices: string[] }) {
  return (
    <section aria-labelledby="notices-h" style={{ ["--d" as string]: "60ms" }} className="glass rise flex flex-col rounded-2xl p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="notices-h" className="flex items-center gap-3 font-display text-[17px] font-bold text-ink">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold/[0.08] text-gold ring-1 ring-gold/25" aria-hidden><Megaphone className="h-5 w-5" /></span>
          Notices from AICTE
        </h2>
        {notices.length > 0 && <Badge tone="flag" dot>{notices.length} open</Badge>}
      </div>
      {notices.length === 0 ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-success-border bg-success-bg p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-text" aria-hidden />
          <p className="text-[14.5px] text-success-text">No open notices. AICTE has not raised any case on your uploads.</p>
        </div>
      ) : (
        <ul className="mt-5 max-h-[220px] space-y-2 overflow-y-auto pr-1">
          {notices.map((n, i) => (
            <li key={i} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-[14.5px] leading-snug text-slate-800">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-flag shadow-[0_0_8px_var(--color-flag)]" />{n}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 border-t border-line pt-3 text-[12.5px] leading-snug text-mute">Notices never reveal another institution's data. AICTE reviews each case.</p>
    </section>
  );
}

/* ---------- upload ---------- */

const CHECKS = [
  "Format and required columns",
  "APAAR registry match (MOCK)",
  "Duplicates, within and across institutions",
  "Seat limits from AICTE intake",
  "Row-level error report",
];

function Upload({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<S["BatchOut"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await uploadCsv(file));
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.text : "Upload failed: cannot reach the API.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <Card id="upload" delay={320} title="Upload & validation" icon={<UploadCloud />} className="xl:col-span-7"
      actions={<span>Validated row by row</span>}>
      <div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files[0]); }}
          className={`flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-9 text-center transition-colors duration-200 ${drag ? "border-gold/70 bg-gold/[0.06]" : "border-white/[0.18] bg-white/[0.015] hover:border-gold/40"}`}
        >
          <span className={`grid h-12 w-12 place-items-center rounded-full border bg-white/[0.03] transition-colors duration-200 ${drag ? "border-gold text-gold" : "border-white/20 text-ink"}`} aria-hidden>
            <UploadCloud className="h-5 w-5" />
          </span>
          <p className="mt-4 text-[16px] font-medium text-ink">Drag and drop your CSV file here</p>
          <p className="mt-1 text-[13px] text-mute">or</p>
          <Button className="mt-3 rounded-full bg-gradient-to-b from-[#F3D573] to-[#C9982A] px-6 shadow-[0_8px_24px_-8px_rgba(212,175,55,0.6)]" onClick={() => input.current?.click()} disabled={busy}>{busy ? "Validating…" : "Choose file"}</Button>
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file" onChange={(e) => send(e.target.files?.[0])} />
          <p className="mt-4 text-[13px] text-mute">Supports CSV <span aria-hidden>·</span> 18-column template <span aria-hidden>·</span> re-uploading the same file is safe</p>
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-slate-700" aria-label="Checks run on every row">
          {CHECKS.map((c) => (
            <li key={c} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-gold" aria-hidden />{c}</li>
          ))}
        </ul>
      </div>

      <div aria-live="polite" className="space-y-3">
        {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
        {result && (
          <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-ink">
                Batch #{result.batch_id}
                {result.replayed ? <Badge tone="brand">Already uploaded · original batch returned</Badge> : <Badge tone="ok" dot>Validated</Badge>}
              </p>
              <Button variant="ghost" onClick={() => go(`/inst/batch/${result.batch_id}`)}>Row-level issues <ArrowRight className="h-3.5 w-3.5" /></Button>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {([["Rows", result.counts.rows, "text-ink"], ["Accepted", result.counts.accepted, "text-success-text"],
                ["Rejected", result.counts.rejected, "text-critical-text"], ["Warnings", result.counts.warnings, "text-warning-text"],
                ["Flagged for AICTE", result.counts.flags, "text-flag-text"]] as const).map(([k, v, c]) => (
                <div key={k}><dt className="text-[12.5px] text-mute">{k}</dt><dd className={`mt-0.5 text-xl font-semibold tabular-nums ${c}`}>{v.toLocaleString()}</dd></div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </Card>
  );
}

function QuickActions() {
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
    <Card id="reports" title="Quick actions" delay={0} className="xl:col-span-4" actions={<span>Exports are audited</span>}>
      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-1">
        {actions.map((a) => (
          <button key={a.title} type="button" onClick={a.on}
            className="group flex w-full min-w-0 items-center gap-2.5 text-left">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-gold transition-colors duration-300 group-hover:border-gold/40" aria-hidden><a.icon className="h-5 w-5" /></span>
            <span className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2 transition-colors duration-300 group-hover:border-gold/35 group-hover:bg-gold/[0.045]">
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-medium text-ink">{a.title}</span>
              <span className="block truncate text-[12.5px] text-mute">{a.sub}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-gold" aria-hidden />
            </span>
          </button>
        ))}
      </div>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </Card>
  );
}

/* ---------- seats ---------- */

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

function Legend() {
  const items = [["Regular", lin(GRAD.regular)], ["Supernumerary FN / OCI", lin(GRAD.sn)], ["CIWG", lin(GRAD.ciwg)], ["Over limit", "var(--color-critical)"]] as const;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-slate-600">
      {items.map(([k, c]) => <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c }} aria-hidden />{k}</span>)}
    </div>
  );
}

function SeatsCard({ programmes }: { programmes: S["ProgrammeSeats"][] }) {
  return (
    <Card id="seats" delay={440} title="Seats: approved intake vs filled" icon={<BarChart3 />} className="xl:col-span-7"
      actions={<span>Limits from AICTE registry (MOCK)</span>}>
      {programmes.length === 0 ? <Empty>No approved programmes for this year.</Empty> : (<>
        <Legend />
        <ul className="mt-5 space-y-6">
          {programmes.map((p) => {
            const reg = p.lines.find((l) => l.category_code === "REGULAR");
            const sn = p.lines.find((l) => l.category_code === "SN_FN_OCI_CIWG");
            const ciwg = p.lines.find((l) => l.category_code === "SN_FN_OCI_CIWG:CIWG");
            const filled = reg?.filled ?? 0, cap = reg?.cap ?? p.approved_intake;
            return (
              <li key={p.programme_id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[15px] font-semibold text-ink" title={p.name}>{p.name}</span>
                  <span className="shrink-0 text-[15px] tabular-nums text-slate-700">
                    <strong className="font-bold text-ink">{filled}</strong><span className="text-slate-500"> / {cap}</span>
                    <span className="ml-3 inline-block w-11 text-right font-semibold" style={{ color: CAT.regular }}>{pct(filled, cap)}%</span>
                  </span>
                </div>
                <SeatBar line={reg ?? { category_code: "REGULAR", filled, cap, excess: 0 }} color={lin(GRAD.regular)} thick />
                {sn && <SnBar sn={sn} ciwg={ciwg} />}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-mute">
                  {sn && <span>Supernumerary <span className="font-semibold tabular-nums text-slate-700">{sn.filled} / {sn.cap}</span></span>}
                  {ciwg && <span>of which CIWG <span className="font-semibold tabular-nums text-slate-700">{ciwg.filled} / {ciwg.cap}</span></span>}
                  {p.lines.filter((l) => l.excess > 0).map((l) => (
                    <Badge key={l.category_code} tone="error">+{l.excess} over {l.category_code === "REGULAR" ? "intake" : "quota"}</Badge>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </>)}
      {programmes.length > 1 && (() => {
        const f = programmes.reduce((a, p) => a + (p.lines.find((l) => l.category_code === "REGULAR")?.filled ?? 0), 0);
        const c = programmes.reduce((a, p) => a + p.approved_intake, 0);
        return (
          <div className="mt-6 flex items-center justify-between border-t border-line pt-4 text-[15px]">
            <span className="text-slate-600">All programmes · regular seats</span>
            <span className="tabular-nums text-ink"><strong className="font-bold">{f}</strong><span className="text-slate-500"> / {c}</span>
              <span className="ml-3 inline-block w-11 text-right font-bold" style={{ color: CAT.regular }}>{pct(f, c)}%</span></span>
          </div>
        );
      })()}
    </Card>
  );
}

/** One category line: coloured fill within the cap, red for seats beyond it. */
export function SeatBar({ line, color = "var(--color-gold)", thick = false }: { line: S["SeatLine"]; color?: string; thick?: boolean }) {
  const on = useMounted(); // bars grow in from zero on first paint
  const max = Math.max(line.cap, line.filled, 1);
  const within = on ? Math.min(line.filled, line.cap) : 0;
  return (
    <div className={`mt-2.5 flex overflow-hidden rounded-full bg-white/[0.07] ${thick ? "h-2.5" : "h-1.5"}`} role="meter" aria-valuemin={0} aria-valuemax={line.cap} aria-valuenow={line.filled}
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
    <div className="mt-1.5 flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-white/[0.07]" role="meter" aria-valuemin={0} aria-valuemax={sn.cap} aria-valuenow={sn.filled}
      aria-label={`Supernumerary: ${sn.filled} of ${sn.cap}${ciwg ? `, of which CIWG ${ciwg.filled}` : ""}${sn.excess > 0 ? `, ${sn.excess} over` : ""}`}>
      <div className="h-full rounded-full transition-[width] duration-1000 ease-out" style={{ width: w(fn), background: lin(GRAD.sn), boxShadow: `0 0 12px -1px ${CAT.sn}aa` }} />
      <div className="h-full rounded-full transition-[width] duration-1000 ease-out" style={{ width: w(c), background: lin(GRAD.ciwg), boxShadow: `0 0 12px -1px ${CAT.ciwg}aa` }} />
      {sn.excess > 0 && <div className="h-full bg-critical" style={{ width: w(on ? sn.excess : 0) }} />}
    </div>
  );
}

function CategoryCard({ programmes }: { programmes: S["ProgrammeSeats"][] }) {
  const sum = (code: string) => programmes.reduce((a, p) => a + (p.lines.find((l) => l.category_code === code)?.filled ?? 0), 0);
  const regular = sum("REGULAR"), sn = sum("SN_FN_OCI_CIWG"), ciwg = sum("SN_FN_OCI_CIWG:CIWG");
  const total = regular + sn;
  const parts = [
    { name: "Regular", key: "regular", value: regular, color: CAT.regular },
    { name: "Supernumerary FN / OCI", key: "sn", value: Math.max(sn - ciwg, 0), color: CAT.sn },
    { name: "CIWG", key: "ciwg", value: ciwg, color: CAT.ciwg },
  ];
  return (
    <Card delay={500} title="Category utilisation" icon={<PieIcon />} className="xl:col-span-3">
      {total === 0 ? <Empty>No enrolments yet.</Empty> : (<>
        <div className="relative mx-auto h-48 w-48" role="img"
          aria-label={`Filled seats by category: ${parts.map((p) => `${p.name} ${p.value}`).join(", ")}`}>
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
              <Pie data={parts.filter((p) => p.value > 0)} dataKey="value" innerRadius="76%" outerRadius="100%" paddingAngle={3} cornerRadius={4}
                stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
                {parts.filter((p) => p.value > 0).map((p) => <Cell key={p.name} fill={`url(#cat-${p.key})`} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div><div className="font-display text-[38px] font-bold leading-none tabular-nums text-ink">{total}</div><div className="mt-1 text-[13px] text-mute">seats filled</div></div>
          </div>
        </div>
        <ul className="mt-6 space-y-3 text-[14.5px]">
          {parts.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2.5 text-slate-700"><span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: lin(GRAD[p.key as keyof typeof GRAD]), boxShadow: `0 0 8px ${p.color}88` }} aria-hidden />
                <span className="truncate">{p.name}</span></span>
              <span className="shrink-0 tabular-nums text-ink"><span className="font-semibold">{p.value}</span> <span className="text-mute">({pct(p.value, total)}%)</span></span>
            </li>
          ))}
        </ul>
      </>)}
    </Card>
  );
}

/* ---------- data quality + anomalies ---------- */

const EMERALD = "#1fe39a";
const EMERALD_GRAD: [string, string] = ["#059669", "#5cf5b8"];
const scoreTone = (s: number) => (s >= 85 ? { c: EMERALD, t: "text-success-text", w: "Good" } : s >= 65
  ? { c: "var(--color-warning)", t: "text-warning-text", w: "Fair" } : { c: "var(--color-critical)", t: "text-critical-text", w: "Needs attention" });
const barColor = (v: number) => (v >= 0.9 ? "bg-gradient-to-r from-[#059669] to-[#5cf5b8] shadow-[0_0_10px_-1px_rgba(31,227,154,0.6)]" : v >= 0.6 ? "bg-gradient-to-r from-[#c2650a] to-[#f6b23c]" : "bg-gradient-to-r from-[#b91c1c] to-[#f87171]");

function QualityCard({ risk, error }: { risk: S["InstitutionRisk"] | null; error: string | null }) {
  const d = risk?.dqs;
  const tone = d ? scoreTone(d.score) : null;
  return (
    <Card id="quality" delay={380} title="Data quality" icon={<ShieldCheck />} className="xl:col-span-5" actions={<span>Seen by AICTE's inspection queue</span>}>
      {error ? <ErrorNote>{error}</ErrorNote> : !risk ? <p className="py-8 text-center text-[15px] text-mute">Loading…</p> : !d || !tone ? <Empty>Upload student records to get a score.</Empty> : (
        <div className="grid items-center gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="flex flex-col items-center">
            <div style={{ filter: `drop-shadow(0 0 14px ${tone.c}55)` }}>
              <Ring value={d.score / 100} size={140} stroke={8} color={tone.c} gradient={d.score >= 85 ? EMERALD_GRAD : undefined} label={`Data quality score ${Math.round(d.score)} of 100, ${tone.w}`}>
                <div><div className="font-display text-[38px] font-bold leading-none tabular-nums text-ink">{Math.round(d.score)}<span className="text-[14px] font-semibold text-mute">/100</span></div>
                  <div className={`mt-1.5 text-[13.5px] font-semibold ${tone.t}`}>{tone.w}</div></div>
              </Ring>
            </div>
          </div>
          <ul className="space-y-3">
            {Object.entries(d.components).map(([k, v]) => (
              <li key={k} className="text-[14px]" title={`Weight ${Math.round(d.weights[k] * 100)}% of the score`}>
                <div className="flex items-center gap-2.5">
                  {v >= 0.9 ? <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-success-text" aria-hidden />
                    : <AlertTriangle className={`h-[18px] w-[18px] shrink-0 ${v >= 0.6 ? "text-warning-text" : "text-critical-text"}`} aria-hidden />}
                  <span className="min-w-0 flex-1 leading-snug text-slate-700">{COMPONENT_LABEL[k] ?? k}</span>
                  <span className="font-semibold tabular-nums text-ink">{Math.round(v * 100)}%</span>
                </div>
                <Meter value={v} color={barColor(v)} className="ml-7 mt-1.5" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function AnomalyCard({ risk }: { risk: S["InstitutionRisk"] | null }) {
  const flags = risk?.flags ?? [];
  return (
    <Card delay={680} title="Anomaly flags" icon={<Siren />} className="lg:col-span-2 xl:col-span-5" actions={risk && <Badge tone={flags.length ? "warning" : "ok"} dot>{flags.length} active</Badge>}>
      {!risk ? <p className="py-8 text-center text-[15px] text-mute">Loading…</p> : flags.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-success-border bg-success-bg p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success-text" aria-hidden />
          <div>
            <p className="text-[14.5px] font-medium text-success-text">No anomaly flags</p>
            <p className="mt-0.5 text-[13px] text-mute">Nothing from your uploads is in AICTE's risk-based inspection queue for anomalies.</p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {flags.map((f, i) => (
            <li key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warning">{FLAG_LABEL[f.type] ?? f.type}</Badge>
                {f.programme && <span className="text-[13px] text-mute">{f.programme}</span>}
              </div>
              <p className="mt-1.5 text-[14.5px] text-slate-700">{f.explanation}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[12.5px] text-slate-400">Risk indicators for review, not proof of misconduct.</p>
    </Card>
  );
}

/* ---------- batches ---------- */

const STATUS_TONE = { completed: "ok", processing: "warning", failed: "error" } as const;

function BatchesCard({ batches }: { batches: S["BatchOut"][] }) {
  return (
    <Card id="batches" delay={620} title="Recent upload batches" icon={<History />} className="xl:col-span-9 [&_td]:px-3 [&_th]:px-3" actions={<span>Last {Math.min(batches.length, 20)} · newest first · open a batch for row-level issues</span>}>
      {batches.length === 0 ? <Empty>No uploads yet.</Empty> : (
        <Table head={["Batch", "Uploaded", "Rows", "Accepted", "Rejected", "Warnings", "Flags", "Status"]}>
          {batches.map((b) => (
            <tr key={b.batch_id} className="transition-colors hover:bg-white/[0.02]">
              <Td><button type="button" onClick={() => go(`/inst/batch/${b.batch_id}`)} title="Row-level issues" className="inline-flex items-center gap-1 font-mono text-champagne underline-offset-4 hover:underline">#{b.batch_id}<ArrowRight className="h-3 w-3" aria-hidden /></button></Td>
              <Td className="text-mute">{new Date(b.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-400">{b.channel === "portal_csv" ? "CSV" : "API"}</span></Td>
              <Td className="tabular-nums">{b.counts.rows}</Td>
              <Td className="tabular-nums text-success-text">{b.counts.accepted}</Td>
              <Td className={`tabular-nums ${b.counts.rejected ? "text-critical-text" : "text-slate-400"}`}>{b.counts.rejected}</Td>
              <Td className={`tabular-nums ${b.counts.warnings ? "text-warning-text" : "text-slate-400"}`}>{b.counts.warnings}</Td>
              <Td className={`tabular-nums ${b.counts.flags ? "text-flag-text" : "text-slate-400"}`}>{b.counts.flags}</Td>
              <Td><Badge tone={STATUS_TONE[b.status]} dot>{b.status}</Badge></Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
