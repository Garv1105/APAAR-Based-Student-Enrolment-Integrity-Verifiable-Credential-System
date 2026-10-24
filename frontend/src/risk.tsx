// D3 UI: Data Quality Score breakdown, anomaly flags with evidence, risk-ranked inspection queue.
import { Fragment, useState } from "react";
import { ApiError, getJson, sendJson, type S } from "./api/client";
import { Badge, Button, Card, Empty, ErrorNote, Loading, Table, Td, usePoll } from "./ui";

export const COMPONENT_LABEL: Record<string, string> = {
  validation_pass_rate: "Validation pass rate", seat_integrity: "Seat integrity", timeliness: "Timeliness",
  duplicate_exposure: "Duplicate exposure", anomaly_flags: "Anomaly flags", correction_churn: "Correction churn",
  declarations: "Declarations (E303 / E501)",
};
export const FLAG_LABEL: Record<string, string> = {
  ENROLMENT_SPIKE: "Enrolment spike", CATEGORY_MIX_SHIFT: "Category-mix shift", DOB_CLUSTER: "DOB cluster",
  SEQUENTIAL_APAAR: "Sequential APAAR IDs", DEADLINE_DUMP: "Deadline dump", PEER_OUTLIER: "Peer outlier",
  SHARED_STUDENT_RING: "Shared-student ring", SEAT_BLOCKING: "Seat blocking",
};

export function DqsBreakdown({ d }: { d: S["Dqs"] }) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-semibold tabular-nums ${d.score >= 85 ? "text-ok" : d.score >= 65 ? "text-warn" : "text-err"}`}>{d.score}</span>
        <span className="text-sm text-slate-500">/ 100 data quality score</span>
      </div>
      <ul className="mt-3 space-y-2">
        {Object.entries(d.components).map(([k, v]) => (
          <li key={k} className="text-xs">
            <div className="flex justify-between"><span className="text-slate-600">{COMPONENT_LABEL[k] ?? k}
              <span className="text-slate-400"> · weight {Math.round(d.weights[k] * 100)}%</span></span>
              <span className="tabular-nums">{Math.round(v * 100)}% → {d.points[k]} pts</span></div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={v >= 0.9 ? "h-full bg-ok" : v >= 0.6 ? "h-full bg-amber-500" : "h-full bg-err"} style={{ width: `${v * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DECISION_TONE = { confirmed: "error", dismissed: "neutral", needs_info: "warning" } as const;

export function FlagList({ flags, canReview = false, onChange }: { flags: S["AnomalyFlag"][]; canReview?: boolean; onChange?: () => void }) {
  if (flags.length === 0) return <Empty>No anomaly flags.</Empty>;
  return (
    <ul className="space-y-2">
      {flags.map((f, i) => (
        <li key={f.flag_key ?? i} className={`rounded-lg border border-slate-200 p-3 text-sm ${f.suppressed ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning">{FLAG_LABEL[f.type] ?? f.type}</Badge>
            <span className="font-medium">{f.institution_id}{f.programme ? ` · ${f.programme}` : ""}</span>
            {f.review && <Badge tone={DECISION_TONE[f.review.decision as keyof typeof DECISION_TONE] ?? "neutral"}>
              {String(f.review.decision).replace("_", " ")}</Badge>}
            {f.suppressed && <span className="text-xs text-slate-500">hidden from the queue until its evidence changes by more than 20%</span>}
          </div>
          <p className="mt-1 text-slate-700">{f.explanation}</p>
          <p className="mt-1 font-mono text-[11px] text-slate-500">{Object.entries(f.evidence).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join("  ")}</p>
          {f.weight != null && (
            <p className="mt-1 text-xs text-slate-500">Rule weight {f.weight.toFixed(2)} · severity {(f.severity ?? 0).toFixed(2)} (0 to 1)
              {f.review && <> · last review by {String(f.review.reviewer)}: "{String(f.review.reason)}"</>}</p>
          )}
          <p className="mt-1 text-[11px] text-slate-500">{f.label}</p>
          {canReview && f.flag_key && <ReviewBox flagKey={f.flag_key} onDone={onChange} />}
        </li>
      ))}
    </ul>
  );
}

/** A4: inspector review with a written reason (audited). */
function ReviewBox({ flagKey, onDone }: { flagKey: string; onDone?: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(decision: string) {
    setBusy(true);
    setError(null);
    try { await sendJson(`/v1/flags/${flagKey}/review`, "POST", { decision, reason }); setReason(""); onDone?.(); }
    catch (e) { setError(e instanceof ApiError ? e.text : "Review failed"); } finally { setBusy(false); }
  }
  const ok = reason.trim().length >= 10 && !busy;
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="text-xs text-slate-600">Reason (min 10 characters, recorded)
        <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 block w-64 max-w-full rounded-lg border border-slate-300 px-2 py-1 text-sm" />
      </label>
      <Button disabled={!ok} onClick={() => send("confirmed")}>Confirm</Button>
      <Button variant="secondary" disabled={!ok} onClick={() => send("dismissed")}>Dismiss</Button>
      <Button variant="ghost" disabled={!ok} onClick={() => send("needs_info")}>Needs info</Button>
      {error && <div className="w-full"><ErrorNote>{error}</ErrorNote></div>}
    </div>
  );
}

/** A4: what inspectors' reviews say about each rule, and who dismisses what. */
export function RulePerformanceCard() {
  const p = usePoll(() => getJson<S["RulePerformance"]>("/v1/rules/performance"), 3000);
  return (
    <Card title="Rule performance (inspector feedback)" actions={<span className="text-xs text-slate-500">weights feed the inspection queue</span>}>
      {p.error ? <ErrorNote>{p.error}</ErrorNote> : !p.data ? <Loading /> : (<>
        <Table head={["Rule", "Reviews", "Confirmed", "Dismissed", "Needs info", "Precision (90% interval)", "Queue weight"]}>
          {p.data.rules.map((r) => (
            <tr key={r.rule}>
              <Td>{FLAG_LABEL[r.rule] ?? r.rule}</Td>
              <Td className="tabular-nums">{r.confirmed + r.dismissed + r.needs_info}</Td>
              <Td className="tabular-nums">{r.confirmed}</Td><Td className="tabular-nums">{r.dismissed}</Td>
              <Td className="tabular-nums">{r.needs_info}</Td>
              <Td className="tabular-nums">{Math.round(r.precision * 100)}% ({Math.round(r.interval[0] * 100)}–{Math.round(r.interval[1] * 100)}%)</Td>
              <Td className="tabular-nums">{r.weight.toFixed(2)}{r.weight === p.data!.weight_floor && <span className="text-xs text-slate-500"> (floor)</span>}</Td>
            </tr>
          ))}
        </Table>
        <h3 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Reviewers</h3>
        {p.data.reviewers.length === 0 ? <Empty>No reviews yet.</Empty> : (
          <Table head={["Reviewer", "Reviews", "Dismissed", "Dismissal rate"]}>
            {p.data.reviewers.map((r) => (
              <tr key={r.reviewer}><Td>{r.reviewer}</Td><Td className="tabular-nums">{r.reviews}</Td>
                <Td className="tabular-nums">{r.dismissed}</Td><Td className="tabular-nums">{Math.round(r.dismissal_rate * 100)}%</Td></tr>
            ))}
          </Table>
        )}
        <p className="mt-3 text-xs text-slate-500">Precision starts at 50% (Beta(1,1) prior) and every weight stays at or above {p.data.weight_floor},
          so no rule can be switched off. {p.data.note}</p>
      </>)}
    </Card>
  );
}

export function InspectionQueueCard({ canReview = false }: { canReview?: boolean }) {
  const q = usePoll(() => getJson<S["InspectionEntry"][]>("/v1/inspection-queue"), 5000);
  const flags = usePoll(() => getJson<S["AnomalyFlag"][]>("/v1/anomalies"), 5000);
  const peers = usePoll(() => getJson<S["PeerStatus"]>("/v1/anomalies/peer-status"), 15000);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="grid gap-4 2xl:grid-cols-3">
      <Card title="Risk-based inspection queue" className="2xl:col-span-2"
        actions={<span className="text-xs text-slate-500">risk = active enrolments × ((100 − DQS) + flag points) · not-submitted first</span>}>
        {q.error ? <ErrorNote>{q.error}</ErrorNote> : !q.data ? <Loading /> : q.data.length === 0 ? <Empty>No institutions.</Empty> : (
          <Table head={["#", "Institution", "State", "DQS", "Risk", "Why"]}>
            {q.data.map((e) => (<Fragment key={e.institution_id}>
              <tr className="cursor-pointer align-top hover:bg-slate-50" onClick={() => setOpen(open === e.institution_id ? null : e.institution_id)}>
                <Td className="tabular-nums">{e.rank}</Td>
                <Td className="font-medium">{e.name}</Td>
                <Td>{e.state}</Td>
                <Td>{e.dqs ? <span className="tabular-nums">{e.dqs.score}</span> : <Badge tone="warning">not submitted</Badge>}</Td>
                <Td className="tabular-nums">{e.risk ?? "—"}{e.flag_points ? <span className="block text-[11px] text-slate-500">incl. {e.flag_points} flag pts</span> : null}</Td>
                <Td wrap className="min-w-56 text-xs text-slate-600">{e.why.join(" · ")}</Td>
              </tr>
              {open === e.institution_id && e.dqs && (
                <tr><td colSpan={6} className="bg-slate-50 px-5 py-4">
                  <div className="grid gap-6 md:grid-cols-2"><DqsBreakdown d={e.dqs} />
                    <FlagList flags={e.flags} canReview={canReview} onChange={() => { q.refresh(); flags.refresh(); }} /></div>
                </td></tr>
              )}
            </Fragment>))}
          </Table>
        )}
        <p className="mt-3 text-xs text-slate-500">Click a row for its score breakdown and flags. Each flag adds up to 10 DQS points × its rule's
          weight (learned from inspector reviews, never below 0.25) × its severity, so every ranking can be explained.</p>
      </Card>
      <Card title={<span className="flex items-center gap-2">Anomaly flags {flags.data && <Badge tone={flags.data.length ? "warning" : "ok"}>{flags.data.length}</Badge>}</span>}
        actions={<span className="text-xs text-slate-500">Risk indicators for review, not proof</span>}>
        {peers.data && (
          <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Peer comparison: {peers.data.tests} test(s), {peers.data.flagged} flagged at a {Math.round(peers.data.fdr_q * 100)}% national
            false-discovery rate. {peers.data.insufficient > 0 && <span className="text-warn">{peers.data.note}.</span>}
          </p>
        )}
        {flags.error ? <ErrorNote>{flags.error}</ErrorNote> : !flags.data ? <Loading /> :
          <FlagList flags={flags.data} canReview={canReview} onChange={() => { q.refresh(); flags.refresh(); }} />}
      </Card>
    </div>
  );
}

export function OwnDqsCard() {
  const r = usePoll(() => getJson<S["InstitutionRisk"]>("/v1/dqs"), 10000);
  return (
    <Card title="My data quality score" actions={<span className="text-xs text-slate-500">What AICTE's risk-based inspection queue sees</span>}>
      {r.error ? <ErrorNote>{r.error}</ErrorNote> : !r.data ? <Loading /> : !r.data.dqs ? <Empty>Upload student records to get a score.</Empty> : (
        <div className="grid gap-6 md:grid-cols-2"><DqsBreakdown d={r.data.dqs} /><FlagList flags={r.data.flags} /></div>
      )}
    </Card>
  );
}
