import { useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  AlertTriangle, ArrowRight, BadgeCheck, BarChart3, CheckCircle2, ChevronRight, FileDown, FileSpreadsheet, History, Megaphone,
  PieChart as PieIcon, ShieldCheck, Siren, UploadCloud, UserCheck, Users, XCircle,
} from "lucide-react";
import { ApiError, download, getJson, uploadCsv, type S } from "../api/client";
import { EnrolmentLookup } from "./Registrar";
import { useMounted } from "../components/motion";
import { FLAG_LABEL, COMPONENT_LABEL } from "../risk";
import {
  Badge, Button, Card, Empty, ErrorNote, go, Loading, Meter, PageHeader, Ring, SparkBars, Stat, Table, Td, Updated, usePoll,
} from "../ui";

const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

export default function InstitutionHome() {
  const { data, error, updatedAt, refresh } = usePoll(() => getJson<S["InstitutionDashboard"]>("/v1/dashboard/institution"));
  const risk = usePoll(() => getJson<S["InstitutionRisk"]>("/v1/dqs"), 10000);

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;

  const cov = data.apaar_coverage;
  const active = Object.values(cov).reduce((a, b) => a + b, 0);
  const verified = cov.VERIFIED ?? 0;
  const withoutApaar = (cov.REFUSED ?? 0) + (cov.NOT_GENERATED ?? 0) + (cov.PENDING ?? 0);
  const chrono = [...data.batches].reverse(); // API returns newest first
  const year = data.programmes[0]?.academic_year;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Institution dashboard"
        title={data.name}
        meta={<>
          <span>AICTE ID <span className="font-mono text-slate-700">{data.institution_id}</span></span>
          {year && <><span aria-hidden className="text-slate-300">·</span><span>Academic year {year}</span></>}
          <span aria-hidden className="text-slate-300">·</span>
          <span>Approved intake from AICTE registry <Badge tone="warning">MOCK</Badge></span>
        </>}
        actions={<Updated at={updatedAt} />}
      />
      {error && <ErrorNote>{error}</ErrorNote>}

      {data.open_notices.length > 0 && (
        <section className="rounded-xl border border-flag-border bg-flag-bg px-5 py-4" aria-labelledby="notices-h">
          <h2 id="notices-h" className="flex items-center gap-2 text-[13px] font-semibold text-flag-text">
            <Megaphone className="h-4 w-4" aria-hidden /> Notices from AICTE <Badge tone="flag">{data.open_notices.length}</Badge>
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-800">
            {data.open_notices.map((n, i) => <li key={i} className="flex gap-2"><span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-flag" />{n}</li>)}
          </ul>
          <p className="mt-2 text-xs text-mute">Notices never reveal another institution's data. AICTE reviews each case.</p>
        </section>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat delay={80} label="Active enrolments" value={active} icon={<Users />}
          hint="All count toward intake, with or without APAAR"
          visual={<SparkBars values={chrono.map((b) => b.counts.accepted)} label="Accepted rows per upload batch, oldest to newest" />} />
        <Stat delay={140} label="APAAR verified" value={verified} icon={<UserCheck />}
          hint={`${pct(verified, active)}% of active enrolments`}
          visual={<Ring value={active ? verified / active : 0} size={60} label={`${pct(verified, active)}% verified`}>
            <span className="text-xs font-semibold text-champagne">{pct(verified, active)}%</span></Ring>} />
        <Stat delay={200} label="Without APAAR" value={withoutApaar} tone={withoutApaar ? "warning" : "neutral"} icon={<AlertTriangle />}
          hint={`Refused ${cov.REFUSED ?? 0} · Not generated ${cov.NOT_GENERATED ?? 0} · Pending ${cov.PENDING ?? 0}`} />
        <Stat delay={260} label="Rows rejected" value={data.rejected_rows_total} tone={data.rejected_rows_total ? "error" : "neutral"} icon={<XCircle />}
          hint="All batches · not counted until corrected"
          visual={<SparkBars values={chrono.map((b) => b.counts.rejected)} color="var(--color-critical)" label="Rejected rows per upload batch, oldest to newest" />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Upload onDone={refresh} />
        <QuickActions />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
        <SeatsCard programmes={data.programmes} />
        <CategoryCard programmes={data.programmes} />
        <QualityCard risk={risk.data} error={risk.error} />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <BatchesCard batches={data.batches} />
        <AnomalyCard risk={risk.data} />
      </div>

      <div id="students" className="scroll-mt-28"><EnrolmentLookup mode="institution" /></div>
    </div>
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
    <Card id="upload" delay={320} title="Upload student records" icon={<UploadCloud />} className="xl:col-span-2"
      actions={<span>CSV · validated row by row</span>}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files[0]); }}
          className={`flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors duration-200 ${drag ? "border-gold/70 bg-gold/[0.06]" : "border-white/[0.18] bg-white/[0.015] hover:border-gold/40"}`}
        >
          <span className={`grid h-11 w-11 place-items-center rounded-full border transition-colors duration-200 ${drag ? "border-gold text-gold" : "border-slate-300 text-slate-500"}`} aria-hidden>
            <UploadCloud className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-medium text-ink">Drag and drop a CSV file here</p>
          <p className="mt-1 text-xs text-mute">or</p>
          <Button className="mt-3" onClick={() => input.current?.click()} disabled={busy}>{busy ? "Validating…" : "Choose file"}</Button>
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file" onChange={(e) => send(e.target.files?.[0])} />
          <p className="mt-4 max-w-md text-[11px] leading-relaxed text-slate-400">
            Use the template's 18 columns (apaar_id, institution_student_id, student_name, dob, programme_code, seat_category…).
            Re-uploading the same file is safe: it returns the original batch.
          </p>
        </div>
        <ul className="space-y-2.5 self-center text-[13px] text-slate-700" aria-label="Checks run on every row">
          {CHECKS.map((c) => (
            <li key={c} className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />{c}</li>
          ))}
        </ul>
      </div>

      <div aria-live="polite" className="space-y-3">
        {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
        {result && (
          <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                Batch #{result.batch_id}
                {result.replayed ? <Badge tone="brand">Already uploaded · original batch returned</Badge> : <Badge tone="ok" dot>Validated</Badge>}
              </p>
              <Button variant="ghost" onClick={() => go(`/inst/batch/${result.batch_id}`)}>Row-level issues <ArrowRight className="h-3.5 w-3.5" /></Button>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {([["Rows", result.counts.rows, "text-ink"], ["Accepted", result.counts.accepted, "text-success-text"],
                ["Rejected", result.counts.rejected, "text-critical-text"], ["Warnings", result.counts.warnings, "text-warning-text"],
                ["Flagged for AICTE", result.counts.flags, "text-flag-text"]] as const).map(([k, v, c]) => (
                <div key={k}><dt className="text-[11px] text-mute">{k}</dt><dd className={`mt-0.5 text-xl font-semibold tabular-nums ${c}`}>{v.toLocaleString()}</dd></div>
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
    <Card id="reports" delay={380} title="Quick actions" icon={<ChevronRight />} actions={<span>Exports are audited</span>}>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {actions.map((a) => (
          <button key={a.title} type="button" onClick={a.on}
            className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 text-left transition-colors duration-300 hover:border-gold/35 hover:bg-gold/[0.045]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-gold ring-1 ring-white/[0.05]" aria-hidden><a.icon className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-ink">{a.title}</span>
              <span className="block truncate text-[11px] text-mute">{a.sub}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-gold" aria-hidden />
          </button>
        ))}
      </div>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </Card>
  );
}

/* ---------- seats ---------- */

function SeatsCard({ programmes }: { programmes: S["ProgrammeSeats"][] }) {
  return (
    <Card id="seats" delay={440} title="Seats: approved intake vs filled" icon={<BarChart3 />} className="lg:col-span-2 xl:col-span-5"
      actions={<span>Limits from AICTE registry (MOCK), never from uploads</span>}>
      {programmes.length === 0 ? <Empty>No approved programmes for this year.</Empty> : (
        <ul className="space-y-5">
          {programmes.map((p) => {
            const reg = p.lines.find((l) => l.category_code === "REGULAR");
            const sn = p.lines.find((l) => l.category_code === "SN_FN_OCI_CIWG");
            const ciwg = p.lines.find((l) => l.category_code === "SN_FN_OCI_CIWG:CIWG");
            const filled = reg?.filled ?? 0, cap = reg?.cap ?? p.approved_intake;
            const over = p.lines.some((l) => l.excess > 0);
            return (
              <li key={p.programme_id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[13px] font-medium text-ink" title={p.name}>{p.name}</span>
                  <span className="shrink-0 text-[13px] tabular-nums text-slate-700">
                    <strong className="font-semibold text-ink">{filled}</strong><span className="text-slate-400"> / {cap}</span>
                    <span className="ml-3 inline-block w-10 text-right text-mute">{pct(filled, cap)}%</span>
                  </span>
                </div>
                <SeatBar line={reg ?? { category_code: "REGULAR", filled, cap, excess: 0 }} />
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-mute">
                  {sn && <span>Supernumerary <span className="tabular-nums text-slate-700">{sn.filled} / {sn.cap}</span></span>}
                  {ciwg && <span>of which CIWG <span className="tabular-nums text-slate-700">{ciwg.filled} / {ciwg.cap}</span></span>}
                  {over && p.lines.filter((l) => l.excess > 0).map((l) => (
                    <Badge key={l.category_code} tone="error">+{l.excess} over {l.category_code === "REGULAR" ? "intake" : "quota"}</Badge>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {programmes.length > 1 && (() => {
        const f = programmes.reduce((a, p) => a + (p.lines.find((l) => l.category_code === "REGULAR")?.filled ?? 0), 0);
        const c = programmes.reduce((a, p) => a + p.approved_intake, 0);
        return (
          <div className="mt-6 flex items-center justify-between border-t border-line pt-4 text-[13px]">
            <span className="text-mute">All programmes · regular seats</span>
            <span className="tabular-nums text-ink"><strong className="font-semibold">{f}</strong><span className="text-slate-400"> / {c}</span>
              <span className="ml-3 inline-block w-10 text-right text-gold">{pct(f, c)}%</span></span>
          </div>
        );
      })()}
    </Card>
  );
}

/** One category line: gold fill within the cap, red for seats beyond it. */
export function SeatBar({ line }: { line: S["SeatLine"] }) {
  const on = useMounted(); // bars grow in from zero on first paint
  const max = Math.max(line.cap, line.filled, 1);
  const within = on ? Math.min(line.filled, line.cap) : 0;
  return (
    <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]" role="meter" aria-valuemin={0} aria-valuemax={line.cap} aria-valuenow={line.filled}
      aria-label={`${line.category_code}: ${line.filled} of ${line.cap} seats${line.excess > 0 ? `, ${line.excess} over` : ""}`}>
      <div className="h-full bg-gradient-to-r from-accent-500 to-accent-700 transition-[width] duration-1000 ease-out" style={{ width: `${(within / max) * 100}%` }} />
      {line.excess > 0 && <div className="h-full bg-critical transition-[width] duration-1000 ease-out" style={{ width: `${((on ? line.excess : 0) / max) * 100}%` }} />}
    </div>
  );
}

function CategoryCard({ programmes }: { programmes: S["ProgrammeSeats"][] }) {
  const sum = (code: string) => programmes.reduce((a, p) => a + (p.lines.find((l) => l.category_code === code)?.filled ?? 0), 0);
  const regular = sum("REGULAR"), sn = sum("SN_FN_OCI_CIWG"), ciwg = sum("SN_FN_OCI_CIWG:CIWG");
  const total = regular + sn;
  const parts = [
    { name: "Regular", value: regular, color: "#d4af37" },
    { name: "Supernumerary FN / OCI", value: Math.max(sn - ciwg, 0), color: "#f7e08a" },
    { name: "CIWG", value: ciwg, color: "#6b7480" },
  ];
  return (
    <Card delay={500} title="Category utilisation" icon={<PieIcon />} className="xl:col-span-3">
      {total === 0 ? <Empty>No enrolments yet.</Empty> : (<>
        <div className="relative mx-auto h-44 w-44" role="img"
          aria-label={`Filled seats by category: ${parts.map((p) => `${p.name} ${p.value}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              {/* no animation: the dashboard polls every 3s and would replay it */}
              <Pie data={parts.filter((p) => p.value > 0)} dataKey="value" innerRadius="74%" outerRadius="100%" paddingAngle={2}
                stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
                {parts.filter((p) => p.value > 0).map((p) => <Cell key={p.name} fill={p.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div><div className="text-3xl font-semibold tabular-nums text-ink">{total}</div><div className="text-[11px] text-mute">seats filled</div></div>
          </div>
        </div>
        <ul className="mt-5 space-y-2.5 text-[13px]">
          {parts.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-slate-700"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
                <span className="truncate">{p.name}</span></span>
              <span className="shrink-0 tabular-nums text-ink">{p.value} <span className="text-mute">({pct(p.value, total)}%)</span></span>
            </li>
          ))}
        </ul>
      </>)}
    </Card>
  );
}

/* ---------- data quality + anomalies ---------- */

const scoreTone = (s: number) => (s >= 85 ? { c: "var(--color-success)", t: "text-success-text", w: "Good" } : s >= 65
  ? { c: "var(--color-warning)", t: "text-warning-text", w: "Fair" } : { c: "var(--color-critical)", t: "text-critical-text", w: "Needs attention" });
const barColor = (v: number) => (v >= 0.9 ? "bg-success" : v >= 0.6 ? "bg-warning" : "bg-critical");

function QualityCard({ risk, error }: { risk: S["InstitutionRisk"] | null; error: string | null }) {
  const d = risk?.dqs;
  return (
    <Card id="quality" delay={560} title="Data quality score" icon={<ShieldCheck />} className="xl:col-span-4" actions={<span>What AICTE's inspection queue sees</span>}>
      {error ? <ErrorNote>{error}</ErrorNote> : !risk ? <p className="py-8 text-center text-sm text-mute">Loading…</p> : !d ? <Empty>Upload student records to get a score.</Empty> : (
        <div className="grid items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="flex flex-col items-center">
            <Ring value={d.score / 100} size={112} stroke={7} color={scoreTone(d.score).c} label={`Data quality score ${Math.round(d.score)} of 100`}>
              <div><div className="text-3xl font-semibold tabular-nums text-ink">{Math.round(d.score)}</div><div className="text-[11px] text-mute">/ 100</div></div>
            </Ring>
            <span className={`mt-2 text-xs font-medium ${scoreTone(d.score).t}`}>{scoreTone(d.score).w}</span>
          </div>
          <ul className="space-y-2.5">
            {Object.entries(d.components).map(([k, v]) => (
              <li key={k} className="text-[11.5px]">
                <div className="flex justify-between gap-2">
                  <span className="truncate text-slate-700">{COMPONENT_LABEL[k] ?? k} <span className="text-slate-400">· {Math.round(d.weights[k] * 100)}%</span></span>
                  <span className="tabular-nums text-ink">{Math.round(v * 100)}%</span>
                </div>
                <Meter value={v} color={barColor(v)} className="mt-1" />
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
    <Card delay={680} title="Anomaly flags" icon={<Siren />} className="xl:col-span-3" actions={risk && <Badge tone={flags.length ? "warning" : "ok"} dot>{flags.length} active</Badge>}>
      {!risk ? <p className="py-8 text-center text-sm text-mute">Loading…</p> : flags.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-success-border bg-success-bg p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success-text" aria-hidden />
          <div>
            <p className="text-[13px] font-medium text-success-text">No anomaly flags</p>
            <p className="mt-0.5 text-xs text-mute">Nothing from your uploads is in AICTE's risk-based inspection queue for anomalies.</p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {flags.map((f, i) => (
            <li key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warning">{FLAG_LABEL[f.type] ?? f.type}</Badge>
                {f.programme && <span className="text-xs text-mute">{f.programme}</span>}
              </div>
              <p className="mt-1.5 text-[13px] text-slate-700">{f.explanation}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-slate-400">Risk indicators for review, not proof of misconduct.</p>
    </Card>
  );
}

/* ---------- batches ---------- */

const STATUS_TONE = { completed: "ok", processing: "warning", failed: "error" } as const;

function BatchesCard({ batches }: { batches: S["BatchOut"][] }) {
  return (
    <Card id="batches" delay={620} title="Recent upload batches" icon={<History />} className="xl:col-span-9" actions={<span>Last {Math.min(batches.length, 20)} · newest first · open a batch for row-level issues</span>}>
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
