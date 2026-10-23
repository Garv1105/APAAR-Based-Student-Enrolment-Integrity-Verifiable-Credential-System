import { useState } from "react";
import { ApiError, getJson, sendJson, type S } from "../api/client";
import { CertificateButton, CredentialCard } from "../credentials";
import { Badge, Button, Card, Empty, ErrorNote } from "../ui";

/** University registrar: find a student at an affiliated institution and award the degree credential (Req 10). */
export default function RegistrarHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Award degrees</h1>
        <p className="text-sm text-slate-500">Only students of affiliated institutions are visible. A degree needs a completed enrolment.</p>
      </div>
      <EnrolmentLookup mode="registrar" />
    </div>
  );
}

/** Shared by the registrar (degrees) and the institution (enrolment credentials, completion/withdrawal). */
export function EnrolmentLookup({ mode }: { mode: "registrar" | "institution" }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<S["EnrolmentOut"][] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const t = q.trim();
    const param = /^[\d\s-]{12,14}$/.test(t) ? `apaar=${encodeURIComponent(t)}` : `student_id=${encodeURIComponent(t)}`;
    try { setRows(await getJson<S["EnrolmentOut"][]>(`/v1/enrolments?${param}`)); } catch (err) { setError(err instanceof ApiError ? err.text : "Search failed"); }
  }

  return (
    <Card title={mode === "registrar" ? "Find a student" : "Student records and credentials"}>
      <form onSubmit={search} className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block text-slate-700">APAAR ID or student ID</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} required className="mt-1 w-72 rounded-lg border border-slate-300 px-3 py-1.5 font-mono" />
        </label>
        <Button type="submit">Search</Button>
      </form>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      {rows && (rows.length === 0 ? <Empty>No matching enrolment you can see.</Empty> : (
        <div className="mt-4 space-y-4">{rows.map((e) => <EnrolmentPanel key={e.id} e={e} mode={mode} onChange={search} />)}</div>
      ))}
    </Card>
  );
}

function EnrolmentPanel({ e, mode, onChange }: { e: S["EnrolmentOut"]; mode: "registrar" | "institution"; onChange: () => void }) {
  const [creds, setCreds] = useState<S["CredentialOut"][] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setCreds(await getJson<S["CredentialOut"][]>(`/v1/credentials?enrolment_id=${e.id}`)); } catch { setCreds([]); }
  }
  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); await load(); onChange(); } catch (err) { setMsg({ ok: false, text: err instanceof ApiError ? err.text : "Failed" }); } finally { setBusy(false); }
  }
  const issue = (type: string) => act(() => sendJson(`/v1/credentials/${e.id}/issue`, "POST", { type }), `${type} issued`);
  const patch = (status: string, reason: string) => act(() => sendJson(`/v1/enrolments/${e.id}`, "PATCH", { status, reason }), `Marked ${status}`);
  const setStatus = (id: string, purpose: string, value: boolean) =>
    act(() => sendJson("/v1/credentials/status", "POST", { credential_id: id, purpose, value, reason: value ? "under investigation" : "cleared" }),
      value ? `${purpose} set` : `${purpose} cleared`);

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span><strong className="font-mono">{e.institution_student_id}</strong> · {e.programme_id} · {e.academic_year} · APAAR {e.apaar_masked ?? e.provisional_id}</span>
        <Badge tone={e.status === "active" ? "ok" : e.status === "completed" ? "brand" : "neutral"}>{e.status}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {mode === "registrar" ? (
          <Button disabled={busy} onClick={() => issue("DegreeCredential")}>Award degree credential</Button>
        ) : (<>
          <Button disabled={busy || e.status !== "active"} onClick={() => issue("EnrolmentCredential")}>Issue enrolment credential</Button>
          <Button variant="secondary" disabled={busy || e.status !== "active"} onClick={() => patch("completed", "Programme completed")}>Mark completed</Button>
          <Button variant="secondary" disabled={busy || e.status !== "active"}
            onClick={() => window.confirm("Withdraw this student? Their credentials will be revoked.") && patch("withdrawn", "Student withdrew")}>Withdraw</Button>
        </>)}
        <Button variant="ghost" onClick={load}>Show credentials</Button>
      </div>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-ok" : "text-err"}`} role="status">{msg.text}</p>}
      {creds && (creds.length === 0 ? <p className="mt-3 text-sm text-slate-500">No credentials you issued for this enrolment.</p> : (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {creds.map((c) => (
            <CredentialCard key={c.id} c={c} actions={<>
              <CertificateButton id={c.id} />
              {!c.status.revocation && (c.status.suspension
                ? <Button variant="ghost" disabled={busy} onClick={() => setStatus(c.id, "suspension", false)}>Lift suspension</Button>
                : <Button variant="ghost" disabled={busy} onClick={() => setStatus(c.id, "suspension", true)}>Suspend</Button>)}
            </>} />
          ))}
        </div>
      ))}
    </div>
  );
}
