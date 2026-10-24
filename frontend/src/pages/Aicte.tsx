import { useState } from "react";
import {
  AlertOctagon,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  FileCheck2,
  Layers,
  PieChart,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
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
    <div className="space-y-8 animate-fade-in">
      {/* Dashboard Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-700">
            <span>Regulator Workspace</span>
            <span>·</span>
            <span>National Dashboard</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gov-900 sm:text-3xl">National Monitoring & Allocation</h1>
          <p className="mt-1 text-sm text-slate-500">
            Real-time student seat audit across AICTE-approved institutions · Ground-truth enrolment data, not declared totals
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Updated at={updatedAt} />
          <Button variant="secondary" onClick={() => refresh()}>
            Refresh
          </Button>
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* KPI Stat Cards with Icons & Semantic Colors */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Institutions"
          value={t.institutions}
          tone="neutral"
          icon={<Building2 className="h-4 w-4" />}
          hint="Approved entities"
        />
        <Stat
          label="Approved Intake"
          value={t.approved_intake}
          tone="neutral"
          icon={<Layers className="h-4 w-4" />}
          hint="AICTE sanction limit"
        />
        <Stat
          label="Active Enrolments"
          value={t.active_enrolments}
          tone="ok"
          icon={<Users className="h-4 w-4" />}
          hint={`${fill}% of approved intake`}
        />
        <Stat
          label="Seats Over Cap"
          value={t.excess_seats}
          tone={t.excess_seats > 0 ? "error" : "ok"}
          icon={<ShieldAlert className="h-4 w-4" />}
          hint={t.excess_seats > 0 ? "Immediate review req." : "Zero violation"}
        />
        <Stat
          label="Open Duplicates"
          value={data.open_cases}
          tone={data.open_cases > 0 ? "flag" : "ok"}
          icon={<Copy className="h-4 w-4" />}
          hint={data.open_cases > 0 ? "Cross-institution flags" : "Clean registry"}
        />
        <Stat
          label="Post-Deadline Edits"
          value={t.post_deadline_mutations}
          tone={t.post_deadline_mutations > 0 ? "warning" : "ok"}
          icon={<Clock className="h-4 w-4" />}
          hint="Rule E501 audit flags"
        />
      </div>

      {/* State Fill & Cryptographic Ledger Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          title={
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-accent-600" />
              <span>Intake vs Filled by State</span>
            </div>
          }
          className="lg:col-span-2"
          actions={<span className="text-xs text-slate-500 font-medium">Approved quota vs active students</span>}
        >
          {data.by_state.length === 0 ? (
            <Empty>No state-level data available.</Empty>
          ) : (
            <div
              className="h-80 w-full"
              role="img"
              aria-label={`Approved intake vs filled by state: ${data.by_state.map((s) => `${s.state} ${s.filled} of ${s.approved}`).join("; ")}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.by_state} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="state" tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#64748b" }} allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      color: "#ffffff",
                      borderRadius: "0.75rem",
                      border: "1px solid rgba(255,255,255,0.1)",
                      fontSize: "12px",
                      boxShadow: "0 10px 25px -3px rgba(0, 0, 0, 0.3)",
                    }}
                    formatter={(v, n) => [v, n === "approved" ? "Approved intake" : "Filled (active)"]}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    formatter={(v) => (
                      <span className="text-xs font-semibold text-slate-600">
                        {v === "approved" ? "Approved Intake" : "Filled (Active)"}
                      </span>
                    )}
                  />
                  <Bar dataKey="approved" fill="#cbd5e1" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="filled" fill="#4f46e5" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Cryptographic Ledger Card */}
        <Ledger ok={data.ledger_ok} canSign={role === "aicte_officer"} onChange={refresh} />
      </div>

      {/* Excess Admissions Highlight Table */}
      <Card
        title={
          <div className="flex items-center gap-2.5">
            <AlertOctagon className="h-4 w-4 text-critical" />
            <span>Excess Admission Violations</span>
            <Badge tone={data.excess_ranking.length ? "error" : "ok"} dot>
              {data.excess_ranking.length} {data.excess_ranking.length === 1 ? "programme" : "programmes"}
            </Badge>
          </div>
        }
        actions={<span className="text-xs text-slate-500 font-medium">Statutory sanction breach indicator (E202)</span>}
      >
        {data.excess_ranking.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-center text-sm font-medium text-success">
            <CheckCircle2 className="mr-2 h-5 w-5 text-success" />
            <span>All programmes are operating strictly within sanctioned capacity limits.</span>
          </div>
        ) : (
          <Table head={["Institution", "State", "Programme", "Category Quota", "Filled", "Cap", "Excess Seats"]}>
            {data.excess_ranking.map((r) => (
              <tr key={`${r.programme_id}-${r.category_code}`} className="transition-colors hover:bg-critical-bg/30">
                <Td className="font-semibold text-gov-900">{r.institution}</Td>
                <Td>{r.state}</Td>
                <Td className="font-medium text-slate-700">{r.name}</Td>
                <Td className="text-slate-600 text-xs">
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">{CATEGORY_LABEL[r.category_code] ?? r.category_code}</span>
                </Td>
                <Td className="tabular-nums font-semibold">{r.filled}</Td>
                <Td className="tabular-nums text-slate-500">{r.cap}</Td>
                <Td className="tabular-nums font-bold text-critical">
                  <span className="inline-flex items-center gap-1 rounded-md bg-critical-bg px-2 py-0.5 text-xs text-critical-text border border-critical-border">
                    +{r.excess} seats over cap
                  </span>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* Category Mix & Compliance Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Category Mix Breakdown */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-accent-600" />
              <span>Category Mix (Active Enrolments)</span>
            </div>
          }
        >
          <dl className="space-y-3 text-sm">
            {(
              [
                ["Regular seats", data.category_mix.regular, "bg-accent-600"],
                ["NRI quota", data.category_mix.nri, "bg-sky-500"],
                ["OCI candidates", data.category_mix.oci, "bg-indigo-500"],
                ["Foreign National (FN)", data.category_mix.fn, "bg-purple-500"],
                ["CIWG reserved", data.category_mix.ciwg, "bg-amber-500"],
                ["No APAAR (with reason)", data.category_mix.no_apaar, "bg-slate-400"],
              ] as const
            ).map(([k, v, color]) => (
              <div key={k} className="flex flex-col gap-1 border-b border-slate-100 pb-2.5 last:border-0 last:pb-0">
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${color}`} />
                    <dt className="font-medium text-slate-700">{k}</dt>
                  </div>
                  <dd className="font-bold tabular-nums text-gov-900">{v.toLocaleString()}</dd>
                </div>
              </div>
            ))}
          </dl>
        </Card>

        {/* Upload Compliance Table */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-accent-600" />
              <span>Institutional Compliance Status</span>
            </div>
          }
          className="lg:col-span-2"
        >
          <Table head={["Institution", "State", "Approval Status", "Submitted Batches", "Last Upload Activity", "Code reissues"]}>
            {data.upload_compliance.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-slate-50/70">
                <Td className="font-semibold text-gov-900">{c.name}</Td>
                <Td>{c.state}</Td>
                <Td>
                  <Badge tone={c.status === "approved" ? "ok" : "error"} dot>
                    {c.status.toUpperCase()}
                  </Badge>
                </Td>
                <Td className="tabular-nums font-semibold">{c.batches}</Td>
                <Td>
                  {c.batches ? (
                    <span className="text-xs text-slate-600">{fmtTime(c.last_upload)}</span>
                  ) : (
                    <Badge tone="warning">Not submitted</Badge>
                  )}
                </Td>
                <Td className="tabular-nums">{c.activation_reissues ? <Badge tone="warning">{c.activation_reissues}</Badge> : 0}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      <CaseQueueCard canResolve={role === "aicte_officer"} />

      {/* Risk-based Inspection Queue (D3) */}
      <InspectionQueueCard />

      {/* Statutory CSV Reports */}
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
    try {
      await fn();
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.text : "Cannot reach the API.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-accent-600" />
          <span>Seat Ledger Cryptographic Chain</span>
        </div>
      }
    >
      <div className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-4">
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-bold text-lg ${
            ok ? "bg-success-bg text-success border border-success-border" : "bg-critical-bg text-critical border border-critical-border"
          }`}
          aria-hidden="true"
        >
          {ok ? "✓" : "!"}
        </div>
        <div>
          <p className="text-sm font-bold text-gov-900">{ok ? "Cryptographically Consistent" : "Tampering Detected"}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Hash-chained enrolment mutations with AICTE digital checkpoint signatures
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2.5">
        <Button variant="secondary" disabled={busy} onClick={() => run(async () => setReport(await getJson("/v1/ledger/verify")))}>
          {busy ? "Verifying…" : "Verify chain now"}
        </Button>
        {canSign && (
          <Button variant="primary" disabled={busy} onClick={() => run(async () => setCp(await sendJson("/v1/ledger/checkpoints", "POST")))}>
            {busy ? "Signing…" : "Sign checkpoint"}
          </Button>
        )}
      </div>

      <div aria-live="polite" className="mt-4 space-y-2.5 text-xs">
        {error && <ErrorNote>{error}</ErrorNote>}
        {cp && (
          <div className="rounded-xl border border-success-border bg-success-bg p-3 text-success-text">
            <p className="font-semibold">
              Checkpoint #{cp.id} signed at sequence #{cp.upto_seq}
            </p>
            <p className="mt-0.5 font-mono text-[11px] opacity-90">Root hash: {cp.root_hash.slice(0, 24)}…</p>
          </div>
        )}
        {report && (
          <div
            className={`rounded-xl border p-3.5 ${
              report.ok
                ? "border-success-border bg-success-bg text-success-text"
                : "border-critical-border bg-critical-bg text-critical-text"
            }`}
          >
            <p className="font-bold">
              {report.ok
                ? `Verified ${report.entries} entries: hash chain, checkpoint roots, and live database match.`
                : `${report.problems.length} integrity violation(s) discovered!`}
            </p>
            {!report.ok && (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs font-mono">
                {report.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
