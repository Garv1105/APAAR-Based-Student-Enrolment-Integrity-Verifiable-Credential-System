import { useState } from "react";
import {
  AlertOctagon, Building2, CalendarClock, CheckCircle2, FileText, Fingerprint, Landmark, Link2, Map as MapIcon, PieChart, ShieldAlert, Users,
} from "lucide-react";
import { ApiError, getJson, sendJson, type Role, type S } from "../api/client";
import { CaseQueueCard } from "../cases";
import GoldIndiaMap from "../components/GoldIndiaMap";
import { NetworkCard } from "../network";
import { InspectionQueueCard, RulePerformanceCard } from "../risk";
import {
  Badge, Button, CATEGORY_LABEL, Card, Empty, ErrorNote, fmtTime, Loading, Meter, PageHeader, ReportsCard, Ring, Stat, Table, Td, usePoll,
} from "../ui";

const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

export default function AicteHome({ role }: { role: Role }) {
  const { data, error, refresh } = usePoll(() => getJson<S["AicteDashboard"]>("/v1/dashboard/aicte"));
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  const t = data.totals;
  const fill = pct(t.active_enrolments, t.approved_intake);
  const excessStates = new Set(data.excess_ranking.map((r) => r.state));
  const mapStates = data.by_state.map((s) => ({ state: s.state, filled: s.filled, approved: s.approved, excess: excessStates.has(s.state) }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={role === "auditor" ? "National monitoring · read-only" : "National monitoring"}
        title="Seat integrity across institutions"
        meta={<>
          <span>{t.institutions} institutions · {data.by_state.length} states</span>
          <span aria-hidden className="text-slate-300">·</span>
          <span>Student-level data, not declared totals</span>
          <span aria-hidden className="text-slate-300">·</span>
          <span>Approval registry <Badge tone="warning">MOCK</Badge></span>
        </>}

      />
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Stat label="Institutions" value={t.institutions} icon={<Building2 />} hint={`${t.batches} upload batches`} />
        <Stat label="Approved intake" value={t.approved_intake} icon={<Landmark />} hint="AICTE registry (MOCK)" />
        <Stat label="Active enrolments" value={t.active_enrolments} icon={<Users />} hint={`${fill}% of approved intake`}
          visual={<Ring value={t.approved_intake ? t.active_enrolments / t.approved_intake : 0} size={52} stroke={4} label={`${fill}% of intake filled`}>
            <span className="text-[11px] font-semibold text-champagne">{fill}%</span></Ring>} />
        <Stat label="Seats over cap" value={t.excess_seats} tone={t.excess_seats ? "error" : "ok"} icon={<AlertOctagon />} hint="Intake or category quota" />
        <Stat label="Open duplicate cases" value={data.open_cases} tone={data.open_cases ? "flag" : "ok"} icon={<Fingerprint />} hint="Same APAAR, more than one seat" />
        <Stat label="Post-deadline changes" value={t.post_deadline_mutations} tone={t.post_deadline_mutations ? "warning" : "ok"} icon={<CalendarClock />} hint="E501 · after the cut-off" />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card id="map" title="Reporting states" icon={<MapIcon />} className="xl:col-span-7"
          actions={<span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gold" aria-hidden />Filled seats</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border-2 border-critical" aria-hidden />Excess admissions</span>
          </span>}>
          {data.by_state.length === 0 ? <Empty>No institutions have reported yet.</Empty> : (
            <div className="mx-auto max-w-[540px]"><GoldIndiaMap states={mapStates} /></div>
          )}
          <p className="mt-2 text-[11px] text-slate-400">Nodes appear only for states with approved institutions in this prototype. Node size follows filled seats.</p>
        </Card>

        <div className="space-y-4 xl:col-span-5">
        <Card title="Fill by state" icon={<PieChart />} actions={<span>Filled / approved intake</span>}>
          {data.by_state.length === 0 ? <Empty>No data.</Empty> : (
            <ul className="space-y-4">
              {[...data.by_state].sort((a, b) => b.filled - a.filled).map((s) => {
                const p = s.approved ? s.filled / s.approved : 0;
                return (
                  <li key={s.state}>
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="flex items-center gap-2 text-ink">{s.state}{excessStates.has(s.state) && <Badge tone="error">excess</Badge>}</span>
                      <span className="tabular-nums text-slate-700">{s.filled.toLocaleString()} <span className="text-slate-400">/ {s.approved.toLocaleString()}</span>
                        <span className="ml-3 inline-block w-11 text-right text-mute">{s.fill_pct == null ? "—" : `${Math.round(s.fill_pct)}%`}</span></span>
                    </div>
                    <Meter value={p} color={p > 1 ? "bg-critical" : "bg-gradient-to-r from-accent-500 to-accent-700"} className="mt-2" />
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-line pt-4 text-center">
            <Mini label="Approved" value={t.approved_intake} />
            <Mini label="Filled" value={t.active_enrolments} />
            <Mini label="Fill rate" value={`${fill}%`} gold />
          </div>
        </Card>
        <CategoryMix mix={data.category_mix} total={t.active_enrolments} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card id="excess" title="Excess admissions" icon={<ShieldAlert />} className="xl:col-span-8"
          actions={<><Badge tone={data.excess_ranking.length ? "error" : "ok"} dot>{data.excess_ranking.length}</Badge><span>Risk indicator for review, not proof of misconduct</span></>}>
          {data.excess_ranking.length === 0 ? <Empty>No programme is over its approved intake or category cap.</Empty> : (
            <Table head={["Institution", "State", "Programme", "Category", "Filled", "Cap", "Excess"]}>
              {data.excess_ranking.map((r) => (
                <tr key={`${r.programme_id}-${r.category_code}`} className="transition-colors hover:bg-white/[0.02]">
                  <Td className="font-medium text-ink">{r.institution}</Td>
                  <Td>{r.state}</Td>
                  <Td wrap className="min-w-48">{r.name}</Td>
                  <Td className="text-mute">{CATEGORY_LABEL[r.category_code] ?? r.category_code}</Td>
                  <Td className="tabular-nums">{r.filled}</Td>
                  <Td className="tabular-nums">{r.cap}</Td>
                  <Td className="tabular-nums font-semibold text-critical-text">+{r.excess}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Ledger ok={data.ledger_ok} canSign={role === "aicte_officer"} onChange={refresh} />
      </div>

      <div id="cases" className="scroll-mt-28"><CaseQueueCard canResolve={role === "aicte_officer"} /></div>

      <div id="inspection" className="scroll-mt-28"><InspectionQueueCard canReview={role === "aicte_officer"} /></div>

      <div id="rule-performance" className="scroll-mt-28"><RulePerformanceCard /></div>

      <div id="network" className="scroll-mt-28"><NetworkCard /></div>

      <div>
        <Card id="compliance" title="Upload compliance" icon={<FileText />}>
          <Table head={["Institution", "State", "Approval", "Batches", "Last upload", "Code reissues"]}>
            {data.upload_compliance.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-white/[0.02]">
                <Td className="font-medium text-ink">{c.name}</Td>
                <Td>{c.state}</Td>
                <Td><Badge tone={c.status === "approved" ? "ok" : "error"} dot>{c.status}</Badge></Td>
                <Td className="tabular-nums">{c.batches}</Td>
                <Td>{c.batches ? <span className="text-mute">{fmtTime(c.last_upload)}</span> : <Badge tone="warning">not submitted</Badge>}</Td>
                <Td className="tabular-nums">{c.activation_reissues ? <Badge tone="warning">{c.activation_reissues}</Badge> : <span className="text-slate-400">0</span>}</Td>
              </tr>
            ))}
          </Table>
          <p className="mt-3 text-[11px] text-slate-400">Code reissues: passkey activation codes an institution re-issued. A spike can signal impersonation.</p>
        </Card>
      </div>

      <ReportsCard id="reports" institutions={data.upload_compliance.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}

function Mini({ label, value, gold = false }: { label: string; value: number | string; gold?: boolean }) {
  return (
    <div>
      <div className={`text-lg font-semibold tabular-nums ${gold ? "text-gold" : "text-ink"}`}>{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="text-[11px] text-mute">{label}</div>
    </div>
  );
}

function CategoryMix({ mix, total }: { mix: S["CategoryMix"]; total: number }) {
  const rows = [
    ["Regular seats", mix.regular], ["NRI", mix.nri], ["OCI", mix.oci], ["Foreign national (FN)", mix.fn], ["CIWG", mix.ciwg],
  ] as const;
  return (
    <Card title="Category mix" icon={<PieChart />} actions={<span>Active enrolments</span>}>
      <ul className="space-y-3">
        {rows.map(([k, v]) => (
          <li key={k}>
            <div className="flex justify-between text-[13px]"><span className="text-slate-700">{k}</span>
              <span className="tabular-nums text-ink">{v.toLocaleString()} <span className="text-mute">({pct(v, total)}%)</span></span></div>
            <Meter value={total ? v / total : 0} className="mt-1.5" />
          </li>
        ))}
      </ul>
      <div className="mt-5 flex items-center justify-between rounded-lg border border-warning-border bg-warning-bg px-3 py-2.5 text-[13px]">
        <span className="text-warning-text">Without APAAR (with reason code)</span>
        <span className="tabular-nums font-semibold text-warning-text">{mix.no_apaar.toLocaleString()}</span>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Counted toward intake like every other accepted row.</p>
    </Card>
  );
}

function Ledger({ ok, canSign, onChange }: { ok: boolean; canSign: boolean; onChange: () => void }) {
  const [report, setReport] = useState<S["LedgerVerifyOut"] | null>(null);
  const [cp, setCp] = useState<S["CheckpointOut"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); onChange(); } catch (e) { setError(e instanceof ApiError ? e.text : "Cannot reach the API."); } finally { setBusy(false); }
  }

  return (
    <Card title="Seat ledger" icon={<Link2 />} className="xl:col-span-4">
      <div className={`flex items-center gap-3 rounded-lg border p-4 ${ok ? "border-success-border bg-success-bg" : "border-critical-border bg-critical-bg"}`}>
        {ok ? <CheckCircle2 className="h-6 w-6 shrink-0 text-success-text" aria-hidden /> : <ShieldAlert className="h-6 w-6 shrink-0 text-critical-text" aria-hidden />}
        <div>
          <p className={`text-sm font-semibold ${ok ? "text-success-text" : "text-critical-text"}`}>{ok ? "Consistent" : "Tampering detected"}</p>
          <p className="text-xs text-mute">Hash-chained enrolment events · AICTE-signed checkpoints</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => run(async () => setReport(await getJson("/v1/ledger/verify")))}>Verify now</Button>
        {canSign && <Button disabled={busy} onClick={() => run(async () => setCp(await sendJson("/v1/ledger/checkpoints", "POST")))}>Sign checkpoint</Button>}
      </div>
      <div aria-live="polite" className="mt-3 space-y-2 text-xs">
        {error && <ErrorNote>{error}</ErrorNote>}
        {cp && <p className="text-success-text">Checkpoint #{cp.id} signed at entry {cp.upto_seq} · root <code className="text-mute">{cp.root_hash.slice(0, 16)}…</code></p>}
        {report && (
          <div className={`rounded-lg border p-3 ${report.ok ? "border-success-border bg-success-bg text-success-text" : "border-critical-border bg-critical-bg text-critical-text"}`}>
            <p className="font-medium">{report.ok ? `Verified ${report.entries} entries: chain, checkpoint and live rows match.` : `${report.problems.length} problem(s) found`}</p>
            {!report.ok && <ul className="mt-1 list-disc pl-4">{report.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          </div>
        )}
      </div>
    </Card>
  );
}
