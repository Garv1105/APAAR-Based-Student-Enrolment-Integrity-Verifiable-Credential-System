import { useState } from "react";
import { ApiError, getJson, sendJson, type S } from "../api/client";
import { downloadJson, VerifyResultView, VerifyTool } from "../credentials";
import { Badge, Button, Card, Empty, ErrorNote, fmtTime, Loading, PageHeader, Updated, usePoll } from "../ui";

const FIELDS = [
  ["name", "Name"], ["programme", "Programme"], ["institution", "Institution"], ["academic_year", "Academic year"],
  ["status", "Enrolment status"], ["apaar_id", "APAAR ID"], ["student_id", "Student ID"],
] as const;
type Field = (typeof FIELDS)[number][0];

export default function VerifierHome() {
  const consents = usePoll(() => getJson<S["ConsentOut"][]>("/v1/consents"), 3000);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Employer verification" title="Verify a candidate"
        meta={<span>Ask the student for consent. You receive a signed credential with only the fields they approve.</span>}
        actions={<Updated at={consents.updatedAt} />} />
      <div className="grid gap-4 lg:grid-cols-2">
        <RequestForm onDone={consents.refresh} />
        <Card id="requests" title="My consent requests">
          {!consents.data ? <Loading /> : consents.data.length === 0 ? <Empty>No requests yet.</Empty> : (
            <div className="space-y-3">{consents.data.map((c) => <RequestRow key={c.id} c={c} />)}</div>
          )}
        </Card>
      </div>
      <div id="verify-tool" className="scroll-mt-28"><VerifyTool allowForgedDemo /></div>
    </div>
  );
}

function RequestForm({ onDone }: { onDone: () => void }) {
  const [apaar, setApaar] = useState("");
  const [purpose, setPurpose] = useState("Pre-employment education check");
  const [fields, setFields] = useState<Field[]>(["name", "programme", "institution", "status"]);
  const [days, setDays] = useState(7);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await sendJson("/v1/consents/requests", "POST", { apaar_id: apaar, purpose, fields, valid_days: days });
      setMsg({ ok: true, text: "Request sent. The student sees it in their consent inbox." });
      setApaar("");
      onDone();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.text : "Request failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Request consent">
      <form onSubmit={submit} className="space-y-3 text-sm">
        <label className="block">
          <span className="text-slate-700">Candidate's APAAR ID (they give it to you)</span>
          <input value={apaar} onChange={(e) => setApaar(e.target.value)} required inputMode="numeric" placeholder="12 digits"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono" />
        </label>
        <label className="block">
          <span className="text-slate-700">Purpose (shown to the student)</span>
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} required maxLength={200}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5" />
        </label>
        <fieldset>
          <legend className="text-slate-700">Fields requested (ask only for what you need)</legend>
          <div className="mt-1 grid grid-cols-2 gap-1">
            {FIELDS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" className="accent-brand-600" checked={fields.includes(k)}
                  onChange={(e) => setFields(e.target.checked ? [...fields, k] : fields.filter((f) => f !== k))} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="text-slate-700">Valid for (days)</span>
          <input type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="mt-1 w-24 rounded-lg border border-slate-300 px-3 py-1.5" />
        </label>
        <Button type="submit" disabled={busy || fields.length === 0}>{busy ? "Sending…" : "Send request"}</Button>
        {msg && (msg.ok ? <p className="text-ok" role="status">{msg.text}</p> : <ErrorNote>{msg.text}</ErrorNote>)}
      </form>
    </Card>
  );
}

function RequestRow({ c }: { c: S["ConsentOut"] }) {
  const [vc, setVc] = useState<unknown>(null);
  const [out, setOut] = useState<S["VerifyOut"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tone = c.status === "granted" ? "ok" : c.status === "pending" ? "flag" : "error";

  async function fetchAndVerify() {
    setError(null);
    setOut(null);
    try {
      const cred = await getJson<unknown>(`/v1/consents/${c.id}/credential`);
      setVc(cred);
      setOut(await sendJson<S["VerifyOut"]>("/v1/verify", "POST", { credential: cred }));
    } catch (e) {
      setError(e instanceof ApiError ? e.text : "Request failed");
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>#{c.id} · {c.fields.join(", ")}</span>
        <Badge tone={tone}>{c.status}</Badge>
      </div>
      <p className="mt-1 text-xs text-slate-500">{c.purpose} · expires {fmtTime(c.expires_at)}</p>
      {c.status === "granted" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={fetchAndVerify}>Fetch & verify credential</Button>
          {vc != null && <Button variant="ghost" onClick={() => downloadJson(vc, `verification-${c.id}.json`)}>Download JSON</Button>}
        </div>
      )}
      {error && <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>}
      {out && <div className="mt-3"><VerifyResultView out={out} /></div>}
    </div>
  );
}
