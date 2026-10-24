import { useState } from "react";
import {
  Award,
  CheckCircle2,
  FileCheck,
  GraduationCap,
  Search,
  UserMinus,
} from "lucide-react";
import { ApiError, getJson, sendJson, type S } from "../api/client";
import { CertificateButton, CredentialCard } from "../credentials";
import { Badge, Button, Card, Empty, ErrorNote, PageHeader } from "../ui";

/** University registrar: find a student at an affiliated institution and award the degree credential (Req 10). */
export default function RegistrarHome() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="University registrar" title="Award degrees"
        meta={<span>Only students of affiliated institutions are visible. A degree needs a completed enrolment.</span>} />

      <EnrolmentLookup mode="registrar" />
    </div>
  );
}

/** Shared by the registrar (degrees) and the institution (enrolment credentials, completion/withdrawal). */
export function EnrolmentLookup({ mode }: { mode: "registrar" | "institution" }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<S["EnrolmentOut"][] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    const t = q.trim();
    const param = /^[\d\s-]{12,14}$/.test(t) ? `apaar=${encodeURIComponent(t)}` : `student_id=${encodeURIComponent(t)}`;
    try {
      setRows(await getJson<S["EnrolmentOut"][]>(`/v1/enrolments?${param}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.text : "Search operation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card icon={<Search />} delay={740}
      title={mode === "registrar" ? "Find a student" : "Students & credentials"}
      actions={<span>Search by 12-digit APAAR ID or student ID</span>}
    >
      <form onSubmit={search} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[280px]">
          <label htmlFor="search-input" className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            APAAR ID or student ID
          </label>
          <div className="relative">
            <input
              id="search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              required
              placeholder="e.g. 123456789012 or CS-2024-001"
              className="w-full rounded-xl border border-white/[0.09] bg-white/[0.025] px-3.5 py-2.5 pr-10 font-mono text-sm text-ink transition-colors placeholder:text-slate-400 focus:border-gold/50 focus:outline-none focus:ring-2 focus:ring-gold/15"
            />
            <Search className="pointer-events-none absolute right-3.5 top-3 h-4 w-4 text-slate-400" aria-hidden />
          </div>
        </div>
        <Button type="submit" disabled={busy || !q.trim()}>
          {busy ? "Searching…" : "Search"}
        </Button>
      </form>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {rows && (
        <div className="mt-6">
          {rows.length === 0 ? (
            <Empty>No matching enrolment you can see.</Empty>
          ) : (
            <div className="space-y-4">
              {rows.map((e) => (
                <EnrolmentPanel key={e.id} e={e} mode={mode} onChange={search} />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function EnrolmentPanel({
  e,
  mode,
  onChange,
}: {
  e: S["EnrolmentOut"];
  mode: "registrar" | "institution";
  onChange: () => void;
}) {
  const [creds, setCreds] = useState<S["CredentialOut"][] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setCreds(await getJson<S["CredentialOut"][]>(`/v1/credentials?enrolment_id=${e.id}`));
    } catch {
      setCreds([]);
    }
  }

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      await load();
      onChange();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.text : "Action execution failed" });
    } finally {
      setBusy(false);
    }
  }

  const issue = (type: string) => act(() => sendJson(`/v1/credentials/${e.id}/issue`, "POST", { type }), `${type} issued and signed`);
  const patch = (status: string, reason: string) =>
    act(() => sendJson(`/v1/enrolments/${e.id}`, "PATCH", { status, reason }), `Enrolment status updated to ${status}`);
  const setStatus = (id: string, purpose: string, value: boolean) =>
    act(
      () =>
        sendJson("/v1/credentials/status", "POST", {
          credential_id: id,
          purpose,
          value,
          reason: value ? "under investigation" : "cleared",
        }),
      value ? `Credential ${purpose} status active` : `Credential ${purpose} status cleared`
    );

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-surface p-5 shadow-xs transition-all hover:border-slate-300">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-50 text-accent-700">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-gov-900">{e.institution_student_id}</span>
              <span className="text-slate-400">·</span>
              <span className="text-xs font-semibold text-slate-700">{e.programme_id}</span>
              <span className="text-slate-400">·</span>
              <span className="text-xs text-slate-500">Academic Year {e.academic_year}</span>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              APAAR: {e.apaar_masked ?? e.provisional_id}
            </p>
          </div>
        </div>
        <Badge tone={e.status === "active" ? "ok" : e.status === "completed" ? "brand" : "neutral"} dot>
          {e.status.toUpperCase()}
        </Badge>
      </div>

      {/* Action Buttons */}
      <div className="mt-4 flex flex-wrap gap-2">
        {mode === "registrar" ? (
          <Button disabled={busy} onClick={() => issue("DegreeCredential")}>
            <Award className="h-3.5 w-3.5" />
            <span>Award Degree Credential</span>
          </Button>
        ) : (
          <>
            <Button disabled={busy || e.status !== "active"} onClick={() => issue("EnrolmentCredential")}>
              <FileCheck className="h-3.5 w-3.5" />
              <span>Issue Enrolment Credential</span>
            </Button>
            <Button
              variant="secondary"
              disabled={busy || e.status !== "active"}
              onClick={() => patch("completed", "Programme requirements fulfilled")}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              <span>Mark Completed</span>
            </Button>
            <Button
              variant="secondary"
              disabled={busy || e.status !== "active"}
              onClick={() =>
                window.confirm("Confirm student withdrawal? All active credentials will be revoked in the status list.") &&
                patch("withdrawn", "Student formally withdrew")
              }
            >
              <UserMinus className="h-3.5 w-3.5 text-critical" />
              <span>Withdraw Student</span>
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={load}>
          <span>View Issued Credentials</span>
        </Button>
      </div>

      {msg && (
        <p className={`mt-3 text-xs font-bold ${msg.ok ? "text-success" : "text-critical"}`} role="status">
          {msg.text}
        </p>
      )}

      {mode === "institution" && e.status === "active" && <ActivationCodeBox enrolmentId={e.id} />}

      {/* Credentials Sub-list */}
      {creds && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {creds.length === 0 ? (
            <p className="text-xs font-medium text-slate-500 italic">No credentials currently issued for this enrolment record.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {creds.map((c) => (
                <CredentialCard
                  key={c.id}
                  c={c}
                  actions={
                    <>
                      <CertificateButton id={c.id} />
                      {!c.status.revocation &&
                        (c.status.suspension ? (
                          <Button variant="ghost" disabled={busy} onClick={() => setStatus(c.id, "suspension", false)}>
                            Lift Suspension
                          </Button>
                        ) : (
                          <Button variant="ghost" disabled={busy} onClick={() => setStatus(c.id, "suspension", true)}>
                            Suspend
                          </Button>
                        ))}
                    </>
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


/** P1: one-time passkey activation code for the student (or a minor's guardian). Shown once, never stored. */
function ActivationCodeBox({ enrolmentId }: { enrolmentId: number }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"student" | "guardian">("student");
  const [reason, setReason] = useState("");
  const [out, setOut] = useState<S["ActivationCodeOut"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) return <div className="mt-2"><Button variant="ghost" onClick={() => setOpen(true)}>Passkey activation code…</Button></div>;
  async function issue() {
    setBusy(true);
    setError(null);
    try { setOut(await sendJson<S["ActivationCodeOut"]>(`/v1/enrolments/${enrolmentId}/activation-code`, "POST", { kind, reason })); }
    catch (err) { setError(err instanceof ApiError ? err.text : "Failed"); } finally { setBusy(false); }
  }
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      {out?.code ? (
        <div>
          <p className="text-xs text-slate-600">One-time {out.kind} code (shown once, valid until {new Date(out.expires_at ?? "").toLocaleDateString()}):</p>
          <p className="mt-1 font-mono text-2xl tracking-widest">{out.code}</p>
          {out.revoked_passkeys > 0 && <p className="mt-1 text-xs text-err">Revoked {out.revoked_passkeys} earlier passkey(s).</p>}
          {out.reissue && <p className="mt-1 text-xs text-warn">Reissued code: the new passkey can't approve consent for 24 h, and the student is notified.</p>}
          <p className="mt-1 text-xs text-slate-500">Prototype: hand it to the student. Production: delivered via DigiLocker or the registered mobile number.</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600">For
            <select value={kind} onChange={(ev) => setKind(ev.target.value as "student" | "guardian")} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1 text-sm">
              <option value="student">Student</option><option value="guardian">Guardian (students under 18)</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">Reason (recorded, shown to the student)
            <input value={reason} onChange={(ev) => setReason(ev.target.value)} className="mt-1 block w-72 max-w-full rounded-lg border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <Button disabled={busy || reason.trim().length < 10} onClick={issue}>Issue code</Button>
        </div>
      )}
      {error && <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>}
    </div>
  );
}
