// Data quality score (DQS), warning signs (anomaly flags) and the inspection priority list, in plain language.
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Search } from "lucide-react";
import { ApiError, getJson, sendJson, type S } from "./api/client";
import { Badge, Button, Card, Empty, ErrorNote, Loading, Table, Td, usePoll, type Tone } from "./ui";

export const COMPONENT_LABEL: Record<string, string> = {
  validation_pass_rate: "Rows that passed the checks", seat_integrity: "Seats within approved limits", timeliness: "Uploaded on time",
  duplicate_exposure: "Students not claimed by another college", anomaly_flags: "No unusual patterns", correction_churn: "Few corrections after upload",
  declarations: "Declarations match AICTE records",
};
export const COMPONENT_HELP: Record<string, string> = {
  validation_pass_rate: "Share of uploaded rows that were accepted.",
  seat_integrity: "Lower when admissions go over the approved intake or a category quota.",
  timeliness: "Lower when most records arrive in the last 24 hours before the deadline.",
  duplicate_exposure: "Lower when its students are also enrolled elsewhere and it uploaded them later.",
  anomaly_flags: "Lower for each warning sign found in its data.",
  correction_churn: "Lower when many records are edited after upload.",
  declarations: "Lower when declared intake differs from AICTE approval or records change after the deadline.",
};

/** Each warning sign: short name, what it means, why it matters. */
export const FLAG_INFO: Record<string, { label: string; meaning: string; why: string }> = {
  ENROLMENT_SPIKE: { label: "Sudden jump in admissions", meaning: "This year's fill is far above the college's own last three years.",
    why: "Can mean seats were filled with students who aren't really there." },
  CATEGORY_MIX_SHIFT: { label: "Unusual rise in special-category seats", meaning: "Many more foreign, NRI, OCI or CIWG admissions than in earlier years.",
    why: "These supernumerary seats sit outside normal intake and can be misused." },
  DOB_CLUSTER: { label: "Many students share one birth date", meaning: "Ten or more students in a programme have the same date of birth.",
    why: "Often a sign of placeholder or made-up records." },
  SEQUENTIAL_APAAR: { label: "APAAR IDs in a straight sequence", meaning: "A long run of consecutive APAAR numbers in one programme.",
    why: "Real students' IDs are scattered; a sequence suggests generated records." },
  DEADLINE_DUMP: { label: "Uploaded at the last minute", meaning: "Records arrived in the final hours before the deadline.",
    why: "Leaves no time for checks; often paired with other problems." },
  PEER_OUTLIER: { label: "Very different from similar colleges", meaning: "A number (fill, growth, foreign share, late uploads) is far from colleges of the same kind and size.",
    why: "Worth a look even when the college's own history looks normal." },
  SHARED_STUDENT_RING: { label: "Part of a group sharing students", meaning: "Three or more colleges list many of the same students.",
    why: "Typical of ghost-student rings that inflate enrolment at several colleges." },
  SEAT_BLOCKING: { label: "Students held by two colleges", meaning: "Two colleges both list the same students as active this year.",
    why: "One college may be blocking seats it doesn't use." },
};
export const FLAG_LABEL: Record<string, string> = Object.fromEntries(Object.entries(FLAG_INFO).map(([k, v]) => [k, v.label]));

export function scoreWord(score: number): { word: string; tone: Tone } {
  return score >= 85 ? { word: "Good", tone: "ok" } : score >= 65 ? { word: "Needs attention", tone: "warning" } : { word: "Poor", tone: "error" };
}

const human = (k: string) => k.replace(/_/g, " ");
const val = (v: unknown): string => typeof v === "number" ? (Math.abs(v) < 1 && v !== 0 ? `${Math.round(v * 1000) / 10}%` : v.toLocaleString("en-IN"))
  : Array.isArray(v) ? v.map(val).join(", ") : String(v);

export function DqsBreakdown({ d }: { d: S["Dqs"] }) {
  const w = scoreWord(d.score);
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className={`font-display text-[44px] font-bold leading-none tabular-nums ${w.tone === "ok" ? "text-success-text" : w.tone === "warning" ? "text-warning-text" : "text-critical-text"}`}>{Math.round(d.score)}</span>
        <span className="text-[15px] text-slate-600">out of 100</span>
        <Badge tone={w.tone}>{w.word}</Badge>
      </div>
      <p className="mt-2 text-[14px] text-slate-600">100 means clean, complete, on-time data. Each part below shows how this college did.</p>
      <ul className="mt-4 space-y-3.5">
        {Object.entries(d.components).sort((a, b) => a[1] - b[1]).map(([k, v]) => (
          <li key={k}>
            <div className="flex items-baseline justify-between gap-3 text-[14.5px]">
              <span className="text-ink">{COMPONENT_LABEL[k] ?? human(k)}</span>
              <span className={`font-semibold tabular-nums ${v >= 0.9 ? "text-success-text" : v >= 0.6 ? "text-warning-text" : "text-critical-text"}`}>{Math.round(v * 100)}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div className={v >= 0.9 ? "h-full bg-success" : v >= 0.6 ? "h-full bg-warning" : "h-full bg-critical"} style={{ width: `${v * 100}%` }} />
            </div>
            {COMPONENT_HELP[k] && <p className="mt-1 text-[12.5px] text-mute">{COMPONENT_HELP[k]} Counts for {Math.round(d.weights[k] * 100)}% of the score.</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const DECISION = { confirmed: ["Confirmed", "error"], dismissed: ["Dismissed", "neutral"], needs_info: ["Waiting for information", "warning"] } as const;

export function FlagList({ flags, canReview = false, onChange, names }: {
  flags: S["AnomalyFlag"][]; canReview?: boolean; onChange?: () => void; names?: Record<string, string>;
}) {
  if (flags.length === 0) return <Empty>No warning signs.</Empty>;
  return (
    <ul className="space-y-3">
      {flags.map((f, i) => {
        const info = FLAG_INFO[f.type];
        const dec = f.review ? DECISION[f.review.decision as keyof typeof DECISION] : null;
        return (
          <li key={f.flag_key ?? i} className={`rounded-xl border border-line bg-white/[0.02] p-4 ${f.suppressed ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-[16.5px] font-bold text-ink">{info?.label ?? human(f.type)}</span>
              {dec && <Badge tone={dec[1]}>{dec[0]}</Badge>}
            </div>
            {names && <p className="mt-0.5 text-[13.5px] text-mute">{names[f.institution_id] ?? f.institution_id}{f.programme ? ` · ${f.programme}` : ""}</p>}
            {!names && f.programme && <p className="mt-0.5 text-[13.5px] text-mute">Programme {f.programme}</p>}
            <p className="mt-2 text-[15px] text-ink">{f.explanation}</p>
            {info && <p className="mt-1.5 text-[14px] leading-relaxed text-slate-600"><span className="font-semibold text-slate-700">Why it matters: </span>{info.why}</p>}
            <details className="mt-2 text-[13px] text-mute">
              <summary className="cursor-pointer hover:text-ink">The numbers behind it</summary>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                {Object.entries(f.evidence).map(([k, v]) => <Fragment key={k}><dt className="capitalize">{human(k)}</dt><dd className="text-ink">{val(v)}</dd></Fragment>)}
              </dl>
            </details>
            {f.suppressed && <p className="mt-2 text-[13px] text-mute">Dismissed earlier. It comes back if the numbers change by more than 20%.</p>}
            {f.review && <p className="mt-2 text-[13px] text-mute">Last review by {String(f.review.reviewer)}: "{String(f.review.reason)}"</p>}
            <p className="mt-2 text-[12px] text-slate-400">A warning sign to look into, not proof of wrongdoing.</p>
            {canReview && f.flag_key && <ReviewBox flagKey={f.flag_key} onDone={onChange} />}
          </li>
        );
      })}
    </ul>
  );
}

/** Inspector decision with a written reason (audited). */
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
    <div className="mt-3 space-y-2 border-t border-line pt-3">
      <label className="block text-[13.5px] text-slate-600">Your decision and reason (at least 10 characters, recorded)
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Checked admission register; students verified on site"
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-[14px]" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!ok} onClick={() => send("confirmed")}>Confirm: real problem</Button>
        <Button variant="secondary" disabled={!ok} onClick={() => send("dismissed")}>Dismiss: explained</Button>
        <Button variant="ghost" disabled={!ok} onClick={() => send("needs_info")}>Ask the college for information</Button>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

/** How reliable each warning sign has proven in inspectors' reviews; reliable signs count more in the priority list. */
export function RulePerformanceCard() {
  const p = usePoll(() => getJson<S["RulePerformance"]>("/v1/rules/performance"), 30000);
  return (
    <Card title="How reliable is each warning sign?"
      actions={<span>Built from your team's Confirm / Dismiss decisions</span>}>
      {p.error ? <ErrorNote>{p.error}</ErrorNote> : !p.data ? <Loading /> : (<>
        <p className="mb-4 text-[14.5px] text-slate-600">When inspectors confirm a sign, it counts for more in the priority list; when they keep dismissing it, it counts for less
          (never below {Math.round(p.data.weight_floor * 100)}%, so no sign is ever switched off). Signs nobody has reviewed start at 50%.</p>
        <Table head={["Warning sign", "Reviewed", "Confirmed real", "Dismissed", "Asked for info", "Proven reliable", "Counts in priority"]}>
          {p.data.rules.map((r) => (
            <tr key={r.rule}>
              <Td className="text-ink">{FLAG_LABEL[r.rule] ?? human(r.rule)}</Td>
              <Td className="tabular-nums">{r.confirmed + r.dismissed + r.needs_info}</Td>
              <Td className="tabular-nums">{r.confirmed}</Td><Td className="tabular-nums">{r.dismissed}</Td>
              <Td className="tabular-nums">{r.needs_info}</Td>
              <Td className="tabular-nums">{Math.round(r.precision * 100)}% <span className="text-mute">(likely {Math.round(r.interval[0] * 100)}–{Math.round(r.interval[1] * 100)}%)</span></Td>
              <Td className="tabular-nums">{Math.round(r.weight * 100)}%</Td>
            </tr>
          ))}
        </Table>
        {p.data.reviewers.length > 0 && (<>
          <h3 className="mb-2 mt-6 text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-500">Reviewers</h3>
          <Table head={["Reviewer", "Reviews", "Dismissed", "Share dismissed"]}>
            {p.data.reviewers.map((r) => (
              <tr key={r.reviewer}><Td>{r.reviewer}</Td><Td className="tabular-nums">{r.reviews}</Td>
                <Td className="tabular-nums">{r.dismissed}</Td><Td className="tabular-nums">{Math.round(r.dismissal_rate * 100)}%</Td></tr>
            ))}
          </Table>
          <p className="mt-2 text-[13px] text-mute">A reviewer who dismisses far more than others may need a second opinion.</p>
        </>)}
      </>)}
    </Card>
  );
}

type Bucket = "High" | "Medium" | "Low" | "No data";
const BUCKET_TONE: Record<Bucket, Tone> = { High: "error", Medium: "warning", Low: "ok", "No data": "neutral" };

/** Top 10% of ranked colleges = High, next 20% = Medium, rest = Low; colleges with nothing uploaded = No data. */
export function withBuckets(q: S["InspectionEntry"][]) {
  const ranked = q.filter((e) => e.risk != null).sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0));
  const pos = new Map(ranked.map((e, i) => [e.institution_id, i / Math.max(ranked.length, 1)]));
  return q.map((e) => {
    const p = pos.get(e.institution_id);
    const bucket: Bucket = p === undefined ? "No data" : (e.risk ?? 0) <= 0 ? "Low" : p < 0.1 ? "High" : p < 0.3 ? "Medium" : "Low";
    return { ...e, bucket };
  }).sort((a, b) => (a.risk == null ? 1 : 0) - (b.risk == null ? 1 : 0) || (b.risk ?? 0) - (a.risk ?? 0));
}

/** AICTE: which colleges to inspect first, and why. */
export function InspectionList({ canReview = false }: { canReview?: boolean }) {
  const q = usePoll(() => getJson<S["InspectionEntry"][]>("/v1/inspection-queue"), 30000);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Bucket | "All">("High");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(25);
  const all = useMemo(() => (q.data ? withBuckets(q.data) : []), [q.data]);
  const count = (b: Bucket) => all.filter((e) => e.bucket === b).length;
  const s = search.trim().toLowerCase();
  const rows = all.filter((e) => (filter === "All" || e.bucket === filter) && (!s || e.name.toLowerCase().includes(s) || e.state.toLowerCase().includes(s) || e.institution_id.includes(s)));

  if (q.error && !q.data) return <ErrorNote>{q.error}</ErrorNote>;
  if (!q.data) return <Loading />;
  return (
    <Card title="Colleges to inspect, most urgent first">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Priority" className="flex flex-wrap gap-1.5">
          {(["High", "Medium", "Low", "No data", "All"] as const).map((b) => (
            <button key={b} type="button" onClick={() => { setFilter(b); setLimit(25); }} aria-pressed={filter === b}
              className={`rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition-colors ${filter === b ? "bg-gold/15 text-champagne ring-1 ring-gold/40" : "text-slate-600 hover:bg-white/[0.04] hover:text-ink"}`}>
              {b === "All" ? `All (${all.length})` : `${b === "No data" ? "Nothing uploaded" : `${b} priority`} (${count(b)})`}
            </button>
          ))}
        </div>
        <label className="relative">
          <span className="sr-only">Search colleges</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="College, state or AICTE id"
            className="w-72 max-w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-[14px]" />
        </label>
      </div>

      <div className="mt-4">
        {rows.length === 0 ? <Empty>No colleges in this group.</Empty> : (
          <Table head={["Priority", "College", "Data quality", "Students", "Main reasons", ""]}>
            {rows.slice(0, limit).map((e) => (<Fragment key={e.institution_id}>
              <tr className="cursor-pointer align-top hover:bg-white/[0.02]" onClick={() => setOpen(open === e.institution_id ? null : e.institution_id)}>
                <Td><Badge tone={BUCKET_TONE[e.bucket]} dot>{e.bucket === "No data" ? "Nothing uploaded" : e.bucket}</Badge></Td>
                <Td wrap className="min-w-64"><span className="block text-[15px] font-semibold text-ink">{e.name}</span>
                  <span className="text-[13px] text-mute">{e.state} · {e.institution_id}</span></Td>
                <Td>{e.dqs ? <span><span className="text-[15px] font-semibold tabular-nums text-ink">{Math.round(e.dqs.score)}</span><span className="text-mute"> / 100</span>
                  <span className="block text-[12.5px] text-mute">{scoreWord(e.dqs.score).word}</span></span> : <span className="text-mute">—</span>}</Td>
                <Td className="tabular-nums text-[15px]">{e.active.toLocaleString("en-IN")}</Td>
                <Td wrap className="min-w-64 text-[14px] text-slate-700">{reasons(e)}</Td>
                <Td><ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open === e.institution_id ? "rotate-180" : ""}`} aria-label={open === e.institution_id ? "Hide details" : "Show details"} /></Td>
              </tr>
              {open === e.institution_id && (
                <tr><td colSpan={6} className="bg-white/[0.02] px-5 py-5">
                  {e.dqs ? <div className="grid gap-8 lg:grid-cols-2"><DqsBreakdown d={e.dqs} />
                    <div><h3 className="mb-3 font-display text-[16px] font-bold text-ink">Warning signs ({e.flags.length})</h3>
                      <FlagList flags={e.flags} canReview={canReview} onChange={q.refresh} /></div></div>
                    : <p className="text-[14.5px] text-slate-600">This approved college hasn't uploaded any student records this year. Follow up with it before the deadline.</p>}
                </td></tr>
              )}
            </Fragment>))}
          </Table>
        )}
        {rows.length > limit && (
          <div className="mt-4 text-center"><Button variant="secondary" onClick={() => setLimit(limit + 50)}>Show more ({rows.length - limit} left)</Button></div>
        )}
      </div>
    </Card>
  );
}

function reasons(e: S["InspectionEntry"] & { bucket: Bucket }): ReactNode {
  if (!e.dqs) return "No student records uploaded yet.";
  const signs = [...new Set(e.flags.map((f) => FLAG_LABEL[f.type] ?? human(f.type)))];
  const weak = Object.entries(e.dqs.components).filter(([, v]) => v < 0.9).sort((a, b) => a[1] - b[1]).slice(0, 2)
    .map(([k, v]) => `${COMPONENT_LABEL[k] ?? human(k)}: ${Math.round(v * 100)}%`);
  const parts = [...signs.slice(0, 3), ...weak];
  return parts.length ? parts.join(" · ") : "No problems found.";
}

/** All warning signs nationally, grouped by kind. */
export function WarningSignsCard({ canReview = false, names }: { canReview?: boolean; names: Record<string, string> }) {
  const flags = usePoll(() => getJson<S["AnomalyFlag"][]>("/v1/anomalies"), 30000);
  const [kind, setKind] = useState<string | null>(null);
  if (flags.error && !flags.data) return <ErrorNote>{flags.error}</ErrorNote>;
  if (!flags.data) return <Loading />;
  const by = new Map<string, S["AnomalyFlag"][]>();
  for (const f of flags.data) by.set(f.type, [...(by.get(f.type) ?? []), f]);
  const kinds = [...by.entries()].sort((a, b) => b[1].length - a[1].length);
  const sel = kind ?? kinds[0]?.[0] ?? null;
  return (
    <Card title={`Warning signs found (${flags.data.length})`} actions={<span>Signs to look into, not proof</span>}>
      {kinds.length === 0 ? <Empty>No warning signs.</Empty> : (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <ul className="space-y-1.5">
            {kinds.map(([k, list]) => (
              <li key={k}><button type="button" onClick={() => setKind(k)} aria-pressed={sel === k}
                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${sel === k ? "border-gold/50 bg-gold/[0.07]" : "border-line hover:bg-white/[0.03]"}`}>
                <span className="flex items-center justify-between gap-2"><span className="text-[15px] font-semibold text-ink">{FLAG_LABEL[k] ?? human(k)}</span>
                  <span className="font-semibold tabular-nums text-champagne">{list.length}</span></span>
                {FLAG_INFO[k] && <span className="mt-1 block text-[13px] leading-snug text-mute">{FLAG_INFO[k].meaning}</span>}
              </button></li>
            ))}
          </ul>
          <div>{sel && <FlagList flags={by.get(sel)!} canReview={canReview} onChange={flags.refresh} names={names} />}</div>
        </div>
      )}
    </Card>
  );
}

export function OwnDqsCard() {
  const r = usePoll(() => getJson<S["InstitutionRisk"]>("/v1/dqs"), 30000);
  return (
    <Card title="My data quality score" actions={<span>The same score AICTE sees when it plans inspections</span>}>
      {r.error && !r.data ? <ErrorNote>{r.error}</ErrorNote> : !r.data ? <Loading /> : !r.data.dqs ? <Empty>Upload student records to get a score.</Empty> : (
        <div className="grid gap-8 md:grid-cols-2"><DqsBreakdown d={r.data.dqs} />
          <div><h3 className="mb-3 font-display text-[16px] font-bold text-ink">Warning signs ({r.data.flags.length})</h3><FlagList flags={r.data.flags} /></div></div>
      )}
    </Card>
  );
}
