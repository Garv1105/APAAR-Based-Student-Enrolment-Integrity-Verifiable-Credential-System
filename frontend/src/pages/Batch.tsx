import { useEffect, useMemo, useState } from "react";
import { ApiError, download, getJson, type S } from "../api/client";
import { Badge, Button, Card, Empty, ErrorNote, fmtTime, go, Loading, SEVERITY_TONE, Stat, Table, Td } from "../ui";

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
        setError(e instanceof ApiError ? (e.status === 404 ? "Batch not found." : e.text) : "Cannot reach the API.");
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button onClick={() => go("/inst")} className="text-sm text-brand-700 hover:underline">← Back to dashboard</button>
          <h1 className="mt-1 text-2xl font-semibold">Batch #{batch.batch_id}</h1>
          <p className="text-sm text-slate-500">Uploaded {fmtTime(batch.created_at)} · {batch.channel === "portal_csv" ? "CSV upload" : "API"}</p>
        </div>
        <Button variant="secondary" onClick={() => download(`/v1/batches/${id}/report.csv`, `batch-${id}-issues.csv`)}>Download error report (CSV)</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Rows" value={batch.counts.rows} />
        <Stat label="Accepted" value={batch.counts.accepted} tone="ok" />
        <Stat label="Rejected" value={batch.counts.rejected} tone="error" hint="Errors block the row" />
        <Stat label="With warnings" value={batch.counts.warnings} tone="warning" hint="Accepted" />
        <Stat label="Flagged for AICTE" value={batch.counts.flags} tone="flag" hint="Accepted, reviewed by AICTE" />
      </div>

      <Card title="Row-level issues" actions={
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "error", "warning", "flag"] as Sev[]).map((s) => (
            <button key={s} onClick={() => setSev(s)} aria-pressed={sev === s}
              className={`rounded-full px-3 py-1 text-xs font-medium ${sev === s ? "bg-brand-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {s === "all" ? `All (${issues.length})` : `${s[0].toUpperCase()}${s.slice(1)}s (${bySev(s)})`}
            </button>
          ))}
          <label className="text-xs text-slate-600">
            <span className="sr-only">Filter by code</span>
            <select value={code} onChange={(e) => setCode(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
              <option value="all">All codes</option>
              {codes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
      }>
        {issues.length === 0 ? <Empty>No issues: every row passed validation.</Empty> : shown.length === 0 ? <Empty>No issues match this filter.</Empty> : (
          <Table head={["Row", "Code", "Severity", "Field", "Message", "How to fix"]}>
            {shown.map((i, n) => (
              <tr key={`${i.row_no}-${i.code}-${n}`} className="align-top hover:bg-slate-50">
                <Td className="tabular-nums">{i.row_no || "batch"}</Td>
                <Td className="font-mono text-xs">{i.code}</Td>
                <Td><Badge tone={SEVERITY_TONE[i.severity]}>{i.severity}</Badge></Td>
                <Td className="font-mono text-xs text-slate-600">{i.field ?? "—"}</Td>
                <Td wrap className="min-w-64">{i.message}</Td>
                <Td wrap className="min-w-56 text-slate-600">{i.fix_hint}</Td>
              </tr>
            ))}
          </Table>
        )}
        {cursor !== null && <div className="mt-4 text-center"><Button variant="secondary" onClick={() => loadPage(cursor)}>Load more</Button></div>}
      </Card>
    </div>
  );
}
