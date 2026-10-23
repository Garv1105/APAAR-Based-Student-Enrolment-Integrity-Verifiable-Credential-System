import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ApiError, getJson, sendJson, type Role, type S } from "../api/client";
import { CaseQueueCard } from "../cases";
import { InspectionQueueCard } from "../risk";
import { Badge, Button, CATEGORY_LABEL, Card, Empty, ErrorNote, fmtTime, Loading, ReportsCard, Stat, Table, Td, Updated, usePoll } from "../ui";

export default function AicteHome({ role }: { role: Role }) {
  const { data, error, updatedAt, refresh } = usePoll(() => getJson<S["AicteDashboard"]>("/v1/dashboard/aicte"));
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  const t = data.totals;
  const fill = t.approved_intake ? Math.round((100 * t.active_enrolments) / t.approved_intake) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">National monitoring</h1>
          <p className="text-sm text-slate-500">All AICTE-approved institutions in this prototype · student-level data, not declared totals</p>
        </div>
        <Updated at={updatedAt} />
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Institutions" value={t.institutions} />
        <Stat label="Approved intake" value={t.approved_intake} />
        <Stat label="Active enrolments" value={t.active_enrolments} hint={`${fill}% of approved intake`} />
        <Stat label="Seats over cap" value={t.excess_seats} tone={t.excess_seats ? "error" : "ok"} />
        <Stat label="Open duplicate cases" value={data.open_cases} tone={data.open_cases ? "flag" : "ok"} />
        <Stat label="Post-deadline changes" value={t.post_deadline_mutations} tone={t.post_deadline_mutations ? "warning" : "ok"} hint="E501" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Fill by state" className="lg:col-span-2">
          {data.by_state.length === 0 ? <Empty>No data.</Empty> : (
            <div className="h-72" role="img" aria-label={`Approved intake vs filled by state: ${data.by_state.map((s) => `${s.state} ${s.filled} of ${s.approved}`).join("; ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.by_state} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="state" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip formatter={(v, n) => [v, n === "approved" ? "Approved intake" : "Filled"]} />
                  <Legend formatter={(v) => (v === "approved" ? "Approved intake" : "Filled (active)")} />
                  {/* no animation: polling replaces the data every 3s and would replay it each time */}
                  <Bar dataKey="approved" fill="#cbd5e1" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="filled" fill="#2c4fb8" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Ledger ok={data.ledger_ok} canSign={role === "aicte_officer"} onChange={refresh} />
      </div>

      <Card title={<span className="flex items-center gap-2">Excess admissions <Badge tone={data.excess_ranking.length ? "error" : "ok"}>{data.excess_ranking.length}</Badge></span>}
        actions={<span className="text-xs text-slate-500">Risk indicator for review, not proof of misconduct</span>}>
        {data.excess_ranking.length === 0 ? <Empty>No programme is over its approved intake or category cap.</Empty> : (
          <Table head={["Institution", "State", "Programme", "Category", "Filled", "Cap", "Excess"]}>
            {data.excess_ranking.map((r) => (
              <tr key={`${r.programme_id}-${r.category_code}`} className="hover:bg-slate-50">
                <Td className="font-medium">{r.institution}</Td>
                <Td>{r.state}</Td>
                <Td>{r.name}</Td>
                <Td className="text-slate-600">{CATEGORY_LABEL[r.category_code] ?? r.category_code}</Td>
                <Td className="tabular-nums">{r.filled}</Td>
                <Td className="tabular-nums">{r.cap}</Td>
                <Td className="tabular-nums font-semibold text-err">+{r.excess}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Category mix (active enrolments)">
          <dl className="space-y-2 text-sm">
            {([["Regular seats", data.category_mix.regular], ["NRI", data.category_mix.nri], ["OCI", data.category_mix.oci],
              ["Foreign national (FN)", data.category_mix.fn], ["CIWG", data.category_mix.ciwg], ["No APAAR (with reason code)", data.category_mix.no_apaar]] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-slate-100 pb-1.5 last:border-0">
                <dt className="text-slate-600">{k}</dt><dd className="font-medium tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title="Upload compliance" className="lg:col-span-2">
          <Table head={["Institution", "State", "Approval", "Batches", "Last upload"]}>
            {data.upload_compliance.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td className="font-medium">{c.name}</Td>
                <Td>{c.state}</Td>
                <Td><Badge tone={c.status === "approved" ? "ok" : "error"}>{c.status}</Badge></Td>
                <Td className="tabular-nums">{c.batches}</Td>
                <Td>{c.batches ? fmtTime(c.last_upload) : <Badge tone="warning">not submitted</Badge>}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      <CaseQueueCard canResolve={role === "aicte_officer"} />

      <InspectionQueueCard />

      <ReportsCard institutions={data.upload_compliance.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
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
    <Card title="Seat ledger">
      <div className="flex items-center gap-2">
        <span className={`grid h-9 w-9 place-items-center rounded-full text-lg ${ok ? "bg-ok-bg text-ok" : "bg-err-bg text-err"}`} aria-hidden>{ok ? "✓" : "!"}</span>
        <div>
          <p className="text-sm font-semibold">{ok ? "Consistent" : "Tampering detected"}</p>
          <p className="text-xs text-slate-500">Hash-chained enrolment events, AICTE-signed checkpoints</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => run(async () => setReport(await getJson("/v1/ledger/verify")))}>Verify now</Button>
        {canSign && <Button disabled={busy} onClick={() => run(async () => setCp(await sendJson("/v1/ledger/checkpoints", "POST")))}>Sign checkpoint</Button>}
      </div>
      <div aria-live="polite" className="mt-3 space-y-2 text-xs">
        {error && <ErrorNote>{error}</ErrorNote>}
        {cp && <p className="text-ok">Checkpoint #{cp.id} signed at entry {cp.upto_seq} · root <code>{cp.root_hash.slice(0, 16)}…</code></p>}
        {report && (
          <div className={`rounded-lg p-3 ${report.ok ? "bg-ok-bg text-ok" : "bg-err-bg text-err"}`}>
            <p className="font-medium">{report.ok ? `Verified ${report.entries} entries: chain, checkpoint and live rows match.` : `${report.problems.length} problem(s) found`}</p>
            {!report.ok && <ul className="mt-1 list-disc pl-4">{report.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          </div>
        )}
      </div>
    </Card>
  );
}
