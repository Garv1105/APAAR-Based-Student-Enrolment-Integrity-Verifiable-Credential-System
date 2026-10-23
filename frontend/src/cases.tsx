// AICTE duplicate-case queue: unmask with a recorded reason, then resolve (PRD §10 steps 4-5).
import { useState } from "react";
import { ApiError, getJson, sendJson, type S } from "./api/client";
import { Badge, Button, Card, Empty, ErrorNote, fmtTime, Loading, usePoll } from "./ui";

const STATUS_TONE = { flagged: "flag", under_investigation: "warning", confirmed_duplicate: "error", false_positive: "ok" } as const;

export function CaseQueueCard({ canResolve }: { canResolve: boolean }) {
  const q = usePoll(() => getJson<S["CaseOut"][]>("/v1/cases"), 5000);
  return (
    <Card title="Duplicate cases" actions={<span className="text-xs text-slate-500">Masked by default · unmasking is logged and shown to the student</span>}>
      {q.error ? <ErrorNote>{q.error}</ErrorNote> : !q.data ? <Loading /> : q.data.length === 0 ? <Empty>No duplicate cases.</Empty> : (
        <ul className="space-y-3">{q.data.map((c) => <CaseRow key={c.id} c={c} canResolve={canResolve} onChange={q.refresh} />)}</ul>
      )}
    </Card>
  );
}

function CaseRow({ c, canResolve, onChange }: { c: S["CaseOut"]; canResolve: boolean; onChange: () => void }) {
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState<Record<string, unknown>[] | null>(null);
  const [keep, setKeep] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const open = c.status === "flagged" || c.status === "under_investigation";

  async function run(fn: () => Promise<void>) {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.text : "Request failed"); }
  }
  const unmask = () => run(async () => setDetail((await sendJson<S["CaseOut"]>(`/v1/cases/${c.id}/unmask`, "POST", { reason })).detail ?? []));
  const resolve = (status: S["CaseResolve"]["status"]) => run(async () => {
    await sendJson(`/v1/cases/${c.id}/resolve`, "POST", { status, note, keep_enrolment_id: status === "confirmed_duplicate" ? keep : null });
    onChange();
  });

  return (
    <li className="rounded-lg border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Case #{c.id}</span>
        <Badge tone={STATUS_TONE[c.status as keyof typeof STATUS_TONE] ?? "neutral"}>{c.status.replace(/_/g, " ")}</Badge>
        <span className="text-xs text-slate-500">opened {fmtTime(c.created_at)} · {c.enrolment_ids.length} enrolments</span>
      </div>
      {c.resolution_note && <p className="mt-1 text-xs text-slate-600">Note: {c.resolution_note}</p>}
      {canResolve && !detail && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600">Reason for unmasking (min 10 characters)
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 block w-72 max-w-full rounded-lg border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <Button variant="secondary" disabled={reason.trim().length < 10} onClick={unmask}>Unmask</Button>
        </div>
      )}
      {detail && (
        <div className="mt-2 space-y-1">
          {detail.map((d) => (
            <label key={String(d.enrolment_id)} className="flex flex-wrap items-center gap-2 text-xs">
              {open && <input type="radio" name={`keep-${c.id}`} checked={keep === d.enrolment_id} onChange={() => setKeep(d.enrolment_id as number)} />}
              <span className="font-medium">{String(d.institution)}</span>
              <span>{String(d.name)} · {String(d.institution_student_id)} · {String(d.programme_id)} · admitted {String(d.admission_date)} · {String(d.status)}</span>
            </label>
          ))}
          {open && (
            <div className="flex flex-wrap items-end gap-2 pt-2">
              <label className="text-xs text-slate-600">Resolution note
                <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 block w-72 max-w-full rounded-lg border border-slate-300 px-2 py-1 text-sm" />
              </label>
              <Button disabled={note.trim().length < 3 || keep === null} onClick={() => resolve("confirmed_duplicate")} title="Pick the enrolment that stands">
                Confirm duplicate (keep selected)</Button>
              <Button variant="secondary" disabled={note.trim().length < 3} onClick={() => resolve("false_positive")}>False positive</Button>
              {c.status === "flagged" && <Button variant="secondary" disabled={note.trim().length < 3} onClick={() => resolve("under_investigation")}>Investigate</Button>}
            </div>
          )}
        </div>
      )}
      {error && <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>}
    </li>
  );
}
