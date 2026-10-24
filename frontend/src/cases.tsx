// AICTE duplicate cases: the same student (same APAAR ID) holds a seat at more than one college.
// Masked by default; seeing who is involved needs a recorded reason (PRD §10 steps 4-5).
import { useState } from "react";
import { ApiError, getJson, sendJson, type S } from "./api/client";
import { Badge, Button, Card, Empty, ErrorNote, fmtTime, Loading, usePoll, type Tone } from "./ui";

const STATUS: Record<string, [string, Tone]> = {
  flagged: ["New, needs a decision", "flag"], under_investigation: ["Being investigated", "warning"],
  confirmed_duplicate: ["Confirmed duplicate", "error"], false_positive: ["Not a duplicate", "ok"],
};
const isOpen = (c: S["CaseOut"]) => c.status === "flagged" || c.status === "under_investigation";

export function CaseQueueCard({ canResolve }: { canResolve: boolean }) {
  const q = usePoll(() => getJson<S["CaseOut"][]>("/v1/cases"), 20000);
  const [tab, setTab] = useState<"open" | "done">("open");
  const [limit, setLimit] = useState(25);
  if (q.error && !q.data) return <ErrorNote>{q.error}</ErrorNote>;
  if (!q.data) return <Loading />;
  const open = q.data.filter(isOpen), done = q.data.filter((c) => !isOpen(c));
  const list = tab === "open" ? open : done;
  return (
    <Card title="Cases" actions={
      <div role="group" aria-label="Show" className="flex gap-1.5">
        {([["open", `Needs a decision (${open.length})`], ["done", `Resolved (${done.length})`]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => { setTab(k); setLimit(25); }} aria-pressed={tab === k}
            className={`rounded-full px-3.5 py-1.5 text-[14px] font-semibold ${tab === k ? "bg-gold/15 text-champagne ring-1 ring-gold/40" : "text-slate-600 hover:text-ink"}`}>{label}</button>
        ))}
      </div>}>
      {list.length === 0 ? <Empty>{tab === "open" ? "No cases waiting for a decision." : "No resolved cases yet."}</Empty> : (
        <ul className="space-y-2">{list.slice(0, limit).map((c) => <CaseRow key={c.id} c={c} canResolve={canResolve} onChange={q.refresh} />)}</ul>
      )}
      {list.length > limit && <div className="mt-4 text-center"><Button variant="secondary" onClick={() => setLimit(limit + 50)}>Show more ({list.length - limit} left)</Button></div>}
    </Card>
  );
}

function CaseRow({ c, canResolve, onChange }: { c: S["CaseOut"]; canResolve: boolean; onChange: () => void }) {
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState<Record<string, unknown>[] | null>(null);
  const [keep, setKeep] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const open = isOpen(c);
  const [label, tone] = STATUS[c.status] ?? [c.status.replace(/_/g, " "), "neutral" as Tone];

  async function run(fn: () => Promise<void>) {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.text : "Request failed"); }
  }
  const unmask = () => run(async () => setDetail((await sendJson<S["CaseOut"]>(`/v1/cases/${c.id}/unmask`, "POST", { reason })).detail ?? []));
  const resolve = (status: S["CaseResolve"]["status"]) => run(async () => {
    await sendJson(`/v1/cases/${c.id}/resolve`, "POST", { status, note, keep_enrolment_id: status === "confirmed_duplicate" ? keep : null });
    onChange();
  });
  const field = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-[14px]";

  return (
    <li className="rounded-xl border border-line bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-display text-[16.5px] font-bold text-ink">Case #{c.id}</span>
        <Badge tone={tone} dot>{label}</Badge>
        <span className="text-[13.5px] text-mute">One student, {c.enrolment_ids.length} seats · opened {fmtTime(c.created_at)}</span>
        {(canResolve || detail) && <Button variant={expanded ? "ghost" : "secondary"} className="ml-auto" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Close" : open && canResolve ? "Review" : "Details"}</Button>}
      </div>
      {c.resolution_note && <p className="mt-2 text-[14px] text-slate-600">Decision note: {c.resolution_note}</p>}

      {expanded && canResolve && open && !detail && (
        <div className="mt-3 rounded-lg bg-white/[0.03] p-3">
          <p className="text-[14px] text-slate-700"><span className="font-semibold">Step 1.</span> See which colleges and records are involved.
            Names are hidden until you give a reason; the student can see that you looked.</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="min-w-72 flex-1 text-[13.5px] text-slate-600">Reason (at least 10 characters)
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Resolving duplicate admission case" className={field} /></label>
            <Button variant="secondary" disabled={reason.trim().length < 10} onClick={unmask}>Show details</Button>
          </div>
        </div>
      )}
      {expanded && detail && (
        <div className="mt-3 space-y-3">
          <ul className="space-y-2">
            {detail.map((d) => (
              <li key={String(d.enrolment_id)}>
                <label className={`flex flex-wrap items-start gap-3 rounded-lg border p-3 text-[14px] ${keep === d.enrolment_id ? "border-gold/50 bg-gold/[0.06]" : "border-line"}`}>
                  {open && <input type="radio" className="mt-1" name={`keep-${c.id}`} checked={keep === d.enrolment_id} onChange={() => setKeep(d.enrolment_id as number)} />}
                  <span><span className="block font-semibold text-ink">{String(d.institution)}</span>
                    <span className="text-slate-600">{String(d.name)} · student ID {String(d.institution_student_id)} · {String(d.programme_id)} · admitted {String(d.admission_date)} · {String(d.status)}</span></span>
                </label>
              </li>
            ))}
          </ul>
          {open && (
            <div className="rounded-lg bg-white/[0.03] p-3">
              <p className="text-[14px] text-slate-700"><span className="font-semibold">Step 2.</span> Decide. If it is a real duplicate, pick the seat that stands; the other is withdrawn.</p>
              <label className="mt-2 block text-[13.5px] text-slate-600">Decision note
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Student confirmed joining the first college" className={field} /></label>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button disabled={note.trim().length < 3 || keep === null} onClick={() => resolve("confirmed_duplicate")}>Confirm duplicate, keep selected seat</Button>
                <Button variant="secondary" disabled={note.trim().length < 3} onClick={() => resolve("false_positive")}>Not a duplicate</Button>
                {c.status === "flagged" && <Button variant="ghost" disabled={note.trim().length < 3} onClick={() => resolve("under_investigation")}>Mark as being investigated</Button>}
              </div>
            </div>
          )}
        </div>
      )}
      {error && <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>}
    </li>
  );
}
