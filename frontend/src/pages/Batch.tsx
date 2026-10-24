import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowLeft, CheckCircle2, Layers, ShieldAlert, Wrench, XCircle } from "lucide-react";
import { ApiError, download, getJson, type S } from "../api/client";
import { AiBox } from "../ai";
import { Button, Card, ErrorNote, fmtTime, go, Loading, PageHeader, Stat } from "../ui";

type Sev = "error" | "warning" | "flag";

/** What each severity means for the row, in the institution's words. */
const SEV: Record<Sev, { label: string; meaning: string; chip: string; icon: typeof XCircle; ring: string }> = {
  error: { label: "Rejected", meaning: "These rows were not saved. Fix them and upload those rows again.",
    chip: "bg-critical/15 text-critical-text ring-critical/40", icon: XCircle, ring: "border-critical/40" },
  warning: { label: "Saved, please check", meaning: "These rows were saved, but something looks off. Correct them if it's a mistake.",
    chip: "bg-warning/15 text-warning-text ring-warning/40", icon: AlertTriangle, ring: "border-warning/40" },
  flag: { label: "Sent to AICTE for review", meaning: "These rows were saved and counted, and AICTE has been notified. No action is needed unless AICTE asks.",
    chip: "bg-flag/15 text-flag-text ring-flag/40", icon: ShieldAlert, ring: "border-flag/40" },
};
const ORDER: Sev[] = ["error", "warning", "flag"];

export default function BatchDetail({ id }: { id: number }) {
  const [batch, setBatch] = useState<S["BatchOut"] | null>(null);
  const [issues, setIssues] = useState<S["Issue"][]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sev, setSev] = useState<Sev | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);

  async function loadPage(after: number) {
    const page = await getJson<S["IssuesPage"]>(`/v1/batches/${id}/issues?cursor=${after}&limit=1000`);
    setIssues((prev) => (after === 0 ? page.items : [...prev, ...page.items]));
    setCursor(page.next_cursor);
  }

  useEffect(() => {
    (async () => {
      try {
        setBatch(await getJson<S["BatchOut"]>(`/v1/batches/${id}`));
        await loadPage(0);
      } catch (e) {
        setError(e instanceof ApiError ? (e.status === 404 ? "This upload was not found." : e.text) : "The service is unreachable. Try again shortly.");
      }
    })();
  }, [id]);

  // one group per problem type, worst first, then the most rows first
  const groups = useMemo(() => {
    const by = new Map<string, S["Issue"][]>();
    for (const i of issues) by.set(i.code, [...(by.get(i.code) ?? []), i]);
    return [...by.values()].sort((a, b) => ORDER.indexOf(a[0].severity as Sev) - ORDER.indexOf(b[0].severity as Sev) || b.length - a.length);
  }, [issues]);
  const rowsWith = (s: Sev) => new Set(issues.filter((i) => i.severity === s).map((i) => i.row_no)).size;

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!batch) return <Loading />;
  const c = batch.counts;
  const shown = groups.filter((g) => sev === "all" || g[0].severity === sev);
  const sel = shown.find((g) => g[0].code === selected) ?? shown[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<button onClick={() => go("/inst")} className="inline-flex items-center gap-1.5 hover:text-champagne"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />Back to dashboard</button>}
        title={`Upload #${batch.batch_id}`}
        meta={<>
          <span>Uploaded {fmtTime(batch.created_at)}</span><span aria-hidden className="text-slate-300">·</span>
          <span>{batch.channel === "portal_csv" ? "CSV file" : "Through the API"}</span>
        </>}
        actions={<Button variant="secondary" onClick={() => download(`/v1/batches/${id}/report.csv`, `upload-${id}-problems.csv`)}>
          <ArrowDownToLine className="h-4 w-4" aria-hidden />Download problems (CSV)</Button>}
      />

      <Summary c={c} />
      {issues.length > 0 && <AiBox path={`/v1/ai/upload-summary/${id}`} title="What to fix first" cta="Get a fix checklist" />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Rows in the file" value={c.rows} icon={<Layers />} hint="Every student row you uploaded" />
        <Stat label="Saved" value={c.accepted} tone="ok" icon={<CheckCircle2 />} hint="Stored and counted toward intake" />
        <Stat label="Rejected" value={c.rejected} tone={c.rejected ? "error" : "ok"} icon={<XCircle />} hint="Not saved: fix and re-upload" />
        <Stat label="Saved, please check" value={c.warnings} tone={c.warnings ? "warning" : "neutral"} icon={<AlertTriangle />} hint="Saved with a warning" />
        <Stat label="Sent to AICTE" value={c.flags} tone={c.flags ? "flag" : "neutral"} icon={<ShieldAlert />} hint="Saved; AICTE will review" />
      </div>

      <Card title="Problems found, by type" actions={issues.length > 0 && (
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
          {(["all", ...ORDER] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSev(s)} aria-pressed={sev === s}
              className={`rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors ${sev === s ? "bg-gold/15 text-champagne ring-1 ring-gold/40" : "text-slate-600 hover:bg-white/[0.04] hover:text-ink"}`}>
              {s === "all" ? "All" : `${SEV[s].label} (${rowsWith(s)} rows)`}
            </button>
          ))}
        </div>
      )}>
        {issues.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" aria-hidden />
            <p className="mt-3 font-display text-[20px] font-bold text-ink">No problems found</p>
            <p className="mt-1 text-[15px] text-slate-600">Every row passed the checks and was saved.</p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
            <div>
              <p className="mb-2 text-[13px] text-mute">{shown.length} type{shown.length === 1 ? "" : "s"} of problem. Pick one to see the rows and how to fix it.</p>
              <ul className="space-y-1.5 lg:max-h-[560px] lg:overflow-y-auto lg:pr-1">
                {shown.map((g) => {
                  const st = SEV[g[0].severity as Sev] ?? SEV.warning;
                  const Icon = st.icon;
                  const on = sel?.[0].code === g[0].code;
                  const n = new Set(g.map((i) => i.row_no)).size;
                  return (
                    <li key={g[0].code}>
                      <button type="button" onClick={() => setSelected(g[0].code)} aria-pressed={on}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${on ? "border-gold/50 bg-gold/[0.07]" : "border-line hover:bg-white/[0.03]"}`}>
                        <Icon className={`h-[18px] w-[18px] shrink-0 ${st.chip.split(" ").find((c) => c.startsWith("text-"))}`} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 block text-[14.5px] font-semibold leading-snug text-ink">{g[0].title}</span>
                          <span className="sr-only">{st.label}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[13px] font-semibold tabular-nums text-ink">{n} row{n === 1 ? "" : "s"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {cursor !== null && <Button variant="secondary" className="mt-3 w-full" onClick={() => loadPage(cursor)}>Load more problems</Button>}
            </div>
            {sel && <div className="lg:sticky lg:top-24 lg:self-start"><Detail key={sel[0].code} items={sel} /></div>}
          </div>
        )}
      </Card>
    </div>
  );
}

function Summary({ c }: { c: S["BatchOut"]["counts"] }) {
  const ok = !c.rejected && !c.warnings && !c.flags;
  const parts = [
    c.rejected ? `${c.rejected} row${c.rejected === 1 ? " was" : "s were"} rejected and not saved: fix ${c.rejected === 1 ? "it" : "them"} and upload again` : null,
    c.warnings ? `${c.warnings} saved row${c.warnings === 1 ? " has" : "s have"} a warning to check` : null,
    c.flags ? `${c.flags} row${c.flags === 1 ? " was" : "s were"} sent to AICTE for review` : null,
  ].filter(Boolean);
  return (
    <div role="status" className={`rounded-2xl border p-5 ${ok ? "border-success/40 bg-success/[0.07]" : c.rejected ? "border-critical/40 bg-critical/[0.06]" : "border-warning/40 bg-warning/[0.06]"}`}>
      <p className="font-display text-[19px] font-bold text-ink">
        {ok ? `All ${c.rows} rows were saved. Nothing to fix.` : `${c.accepted} of ${c.rows} rows were saved.`}
      </p>
      {!ok && <p className="mt-1.5 text-[15.5px] leading-relaxed text-slate-700">{parts.join(". ")}.</p>}
    </div>
  );
}

/** One problem type: what it means, how to fix it, and the affected rows in a fixed-height, searchable box. */
function Detail({ items }: { items: S["Issue"][] }) {
  const [find, setFind] = useState("");
  const first = items[0];
  const s = SEV[first.severity as Sev] ?? SEV.warning;
  const Icon = s.icon;
  const rows = [...new Set(items.map((i) => i.row_no))];
  const sameMessage = items.every((i) => i.message === first.message);
  const f = find.trim();
  const list = f ? items.filter((i) => String(i.row_no).startsWith(f) || i.message.toLowerCase().includes(f.toLowerCase())) : items;

  return (
    <section className={`rounded-2xl border bg-white/[0.02] p-5 ${s.ring}`} aria-labelledby={`g-${first.code}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ring-1 ${s.chip}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden />{s.label}
        </span>
        <span className="font-mono text-[12.5px] text-slate-500" title="Validation code">{first.code}</span>
      </div>
      <h3 id={`g-${first.code}`} className="mt-2.5 font-display text-[20px] font-bold text-ink">{first.title}</h3>
      <p className="mt-1 text-[14.5px] text-slate-600">
        {rows.length === 1 && rows[0] === 0 ? "Applies to the whole upload." : `${rows.length} row${rows.length === 1 ? "" : "s"} affected.`} {s.meaning}
      </p>

      <div className="mt-4 flex gap-3 rounded-xl bg-white/[0.04] px-4 py-3">
        <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
        <p className="text-[15px] leading-relaxed text-ink"><span className="font-semibold">How to fix: </span>{first.fix_hint}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] font-semibold text-ink">{sameMessage ? first.message : "Affected rows"}</p>
        {items.length > 12 && (
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a row number" aria-label="Find a row"
            className="w-44 rounded-lg border border-slate-300 px-3 py-1.5 text-[14px]" />
        )}
      </div>
      <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-line">
        {list.length === 0 ? <p className="px-4 py-3 text-[14px] text-mute">No row matches.</p> : sameMessage ? (
          <ul className="flex flex-wrap gap-2 p-3">
            {list.map((i, n) => (
              <li key={n} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[14px] text-ink">
                {i.row_no ? <>Row <span className="font-semibold tabular-nums">{i.row_no}</span></> : "Whole upload"}
                {i.field && <span className="text-slate-500"> · {i.field}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((i, n) => (
              <li key={n} className="grid grid-cols-[80px_minmax(0,1fr)] gap-3 px-4 py-2.5 text-[14.5px] sm:grid-cols-[80px_130px_minmax(0,1fr)]">
                <span className="font-semibold tabular-nums text-ink">{i.row_no ? `Row ${i.row_no}` : "Upload"}</span>
                <span className="hidden truncate text-slate-500 sm:block">{i.field ?? "—"}</span>
                <span className="text-slate-700">{i.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-2 text-[12.5px] text-mute">Row numbers count from the first data row of your file (the header is not counted).</p>
    </section>
  );
}
