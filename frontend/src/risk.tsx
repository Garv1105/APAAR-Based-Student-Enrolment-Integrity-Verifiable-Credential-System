// D3 UI: Data Quality Score breakdown, anomaly flags with evidence, risk-ranked inspection queue.
import { Fragment, useState } from "react";
import { getJson, type S } from "./api/client";
import { Badge, Card, Empty, ErrorNote, Loading, Table, Td, usePoll } from "./ui";

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

export function FlagList({ flags }: { flags: S["AnomalyFlag"][] }) {
  if (flags.length === 0) return <Empty>No anomaly flags.</Empty>;
  return (
    <ul className="space-y-2">
      {flags.map((f, i) => (
        <li key={i} className="rounded-lg border border-slate-200 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning">{FLAG_LABEL[f.type] ?? f.type}</Badge>
            <span className="font-medium">{f.institution_id}{f.programme ? ` · ${f.programme}` : ""}</span>
          </div>
          <p className="mt-1 text-slate-700">{f.explanation}</p>
          <p className="mt-1 font-mono text-[11px] text-slate-500">{Object.entries(f.evidence).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join("  ")}</p>
        </li>
      ))}
    </ul>
  );
}

export function InspectionQueueCard() {
  const q = usePoll(() => getJson<S["InspectionEntry"][]>("/v1/inspection-queue"), 5000);
  const flags = usePoll(() => getJson<S["AnomalyFlag"][]>("/v1/anomalies"), 5000);
  const peers = usePoll(() => getJson<S["PeerStatus"]>("/v1/anomalies/peer-status"), 15000);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="grid gap-4 2xl:grid-cols-3">
      <Card title="Risk-based inspection queue" className="2xl:col-span-2"
        actions={<span className="text-xs text-slate-500">risk = (100 − DQS) × active enrolments · not-submitted first</span>}>
        {q.error ? <ErrorNote>{q.error}</ErrorNote> : !q.data ? <Loading /> : q.data.length === 0 ? <Empty>No institutions.</Empty> : (
          <Table head={["#", "Institution", "State", "DQS", "Risk", "Why"]}>
            {q.data.map((e) => (<Fragment key={e.institution_id}>
              <tr className="cursor-pointer align-top hover:bg-slate-50" onClick={() => setOpen(open === e.institution_id ? null : e.institution_id)}>
                <Td className="tabular-nums">{e.rank}</Td>
                <Td className="font-medium">{e.name}</Td>
                <Td>{e.state}</Td>
                <Td>{e.dqs ? <span className="tabular-nums">{e.dqs.score}</span> : <Badge tone="warning">not submitted</Badge>}</Td>
                <Td className="tabular-nums">{e.risk ?? "—"}</Td>
                <Td wrap className="min-w-56 text-xs text-slate-600">{e.why.join(" · ")}</Td>
              </tr>
              {open === e.institution_id && e.dqs && (
                <tr><td colSpan={6} className="bg-slate-50 px-5 py-4">
                  <div className="grid gap-6 md:grid-cols-2"><DqsBreakdown d={e.dqs} /><FlagList flags={e.flags} /></div>
                </td></tr>
              )}
            </Fragment>))}
          </Table>
        )}
        <p className="mt-3 text-xs text-slate-500">Click a row for its score breakdown and flags. Weights are fixed and shown, so every ranking can be explained.</p>
      </Card>
      <Card title={<span className="flex items-center gap-2">Anomaly flags {flags.data && <Badge tone={flags.data.length ? "warning" : "ok"}>{flags.data.length}</Badge>}</span>}
        actions={<span className="text-xs text-slate-500">Risk indicators for review, not proof</span>}>
        {peers.data && (
          <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Peer comparison: {peers.data.tests} test(s), {peers.data.flagged} flagged at a {Math.round(peers.data.fdr_q * 100)}% national
            false-discovery rate. {peers.data.insufficient > 0 && <span className="text-warn">{peers.data.note}.</span>}
          </p>
        )}
        {flags.error ? <ErrorNote>{flags.error}</ErrorNote> : !flags.data ? <Loading /> : <FlagList flags={flags.data} />}
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
