import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  CheckCircle2,
  Filter,
  Layers,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { ApiError, download, getJson, type S } from "../api/client";
import { Badge, Button, Card, Empty, ErrorNote, fmtTime, go, Loading, PageHeader, SEVERITY_TONE, Stat, Table, Td } from "../ui";

type Sev = "all" | "error" | "warning" | "flag";

export default function BatchDetail({ id }: { id: number }) {
  const [batch, setBatch] = useState<S["BatchOut"] | null>(null);
  const [issues, setIssues] = useState<S["Issue"][]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sev, setSev] = useState<Sev>("all");
  const [code, setCode] = useState("all");

  async function loadPage(after: number) {
    const page = await getJson<S["IssuesPage"]>(`/v1/batches/${id}/issues?cursor=${after}&limit=500`);
    setIssues((prev) => (after === 0 ? page.items : [...prev, ...page.items]));
    setCursor(page.next_cursor);
  }

  useEffect(() => {
    (async () => {
      try {
        setBatch(await getJson<S["BatchOut"]>(`/v1/batches/${id}`));
        await loadPage(0);
      } catch (e) {
        setError(e instanceof ApiError ? (e.status === 404 ? "Batch submission record not found." : e.text) : "Cannot reach the API server.");
      }
    })();
  }, [id]);

  const codes = useMemo(() => [...new Set(issues.map((i) => i.code))].sort(), [issues]);
  const shown = issues.filter((i) => (sev === "all" || i.severity === sev) && (code === "all" || i.code === code));
  const bySev = (s: string) => issues.filter((i) => i.severity === s).length;

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!batch) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<button onClick={() => go("/inst")} className="inline-flex items-center gap-1.5 hover:text-champagne"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />Institution dashboard</button>}
        title={`Batch #${batch.batch_id}`}
        meta={<>
          <span>Uploaded {fmtTime(batch.created_at)}</span><span aria-hidden className="text-slate-300">·</span>
          <span>{batch.channel === "portal_csv" ? "CSV upload" : "API"}</span><span aria-hidden className="text-slate-300">·</span>
          <span>Checked against the APAAR registry (MOCK) and AICTE intake</span>
        </>}
        actions={<Button variant="secondary" onClick={() => download(`/v1/batches/${id}/report.csv`, `batch-${id}-issues.csv`)}>
          <ArrowDownToLine className="h-4 w-4" aria-hidden />Error report (CSV)</Button>}
      />

      {/* KPI Breakdown */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label="Total Rows"
          value={batch.counts.rows}
          tone="neutral"
          icon={<Layers className="h-4 w-4" />}
        />
        <Stat
          label="Accepted"
          value={batch.counts.accepted}
          tone="ok"
          icon={<CheckCircle2 className="h-4 w-4" />}
          hint="Enrolment valid"
        />
        <Stat
          label="Rejected"
          value={batch.counts.rejected}
          tone={batch.counts.rejected > 0 ? "error" : "ok"}
          icon={<XCircle className="h-4 w-4" />}
          hint="Blocked rows"
        />
        <Stat
          label="With Warnings"
          value={batch.counts.warnings}
          tone={batch.counts.warnings > 0 ? "warning" : "neutral"}
          icon={<AlertTriangle className="h-4 w-4" />}
          hint="Accepted with notes"
        />
        <Stat
          label="Flagged for AICTE"
          value={batch.counts.flags}
          tone={batch.counts.flags > 0 ? "flag" : "neutral"}
          icon={<ShieldAlert className="h-4 w-4" />}
          hint="Under regulator review"
        />
      </div>

      {/* Row-Level Issues Explorer */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-accent-600" />
            <span>Row-level issues</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {issues.length} total events
            </span>
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "error", "warning", "flag"] as Sev[]).map((s) => (
              <button
                key={s}
                onClick={() => setSev(s)}
                aria-pressed={sev === s}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                  sev === s
                    ? "bg-gold/15 text-champagne ring-1 ring-gold/40"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {s === "all" ? `All (${issues.length})` : `${s[0].toUpperCase()}${s.slice(1)}s (${bySev(s)})`}
              </button>
            ))}
            <label className="text-xs text-slate-600">
              <span className="sr-only">Filter by validation code</span>
              <select
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="rounded-xl border border-slate-300 bg-surface px-2.5 py-1 text-xs font-medium text-gov-900 shadow-xs focus:border-accent-600"
              >
                <option value="all">All validation codes</option>
                {codes.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
        }
      >
        {issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-sm font-semibold text-success">
            <CheckCircle2 className="h-8 w-8 text-success mb-2" />
            <span>Zero Validation Issues Detected</span>
            <p className="text-xs text-slate-500 font-normal mt-1">Every submitted row conformed to AICTE and APAAR standards.</p>
          </div>
        ) : shown.length === 0 ? (
          <Empty>No issues match the selected severity and code filters.</Empty>
        ) : (
          <Table head={["Row #", "Code", "Severity", "Target Field", "Diagnostic Message", "Remediation Guidance"]}>
            {shown.map((i, n) => (
              <tr key={`${i.row_no}-${i.code}-${n}`} className="align-top transition-colors hover:bg-slate-50/70">
                <Td className="tabular-nums font-mono font-bold text-slate-500">{i.row_no || "Batch"}</Td>
                <Td>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-gov-900 border border-slate-200">
                    {i.code}
                  </span>
                </Td>
                <Td>
                  <Badge tone={SEVERITY_TONE[i.severity]} dot>
                    {i.severity.toUpperCase()}
                  </Badge>
                </Td>
                <Td className="font-mono text-xs text-slate-600">{i.field ?? "—"}</Td>
                <Td wrap className="min-w-64 font-medium text-slate-800 text-xs">{i.message}</Td>
                <Td wrap className="min-w-56 text-xs text-slate-600 font-medium">{i.fix_hint}</Td>
              </tr>
            ))}
          </Table>
        )}

        {cursor !== null && (
          <div className="mt-6 text-center">
            <Button variant="secondary" onClick={() => loadPage(cursor)}>
              Load Next Page of Diagnostic Telemetry
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
