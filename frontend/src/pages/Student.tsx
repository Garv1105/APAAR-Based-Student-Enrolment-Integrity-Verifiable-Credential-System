import { useEffect, useState } from "react";
import { ApiError, approveWithPasskey, getJson, sendJson, type S } from "../api/client";
import { passkeyError } from "../webauthn";
import { CertificateButton, CredentialCard, downloadJson } from "../credentials";
import { Badge, Button, Card, Empty, ErrorNote, fmtTime, Loading, Table, Td, Updated, usePoll } from "../ui";

const ACTION_LABEL: Record<string, string> = {
  "credential.verify": "Verified a credential", "credential.issue": "Issued a credential", "credential.read": "Viewed your credentials",
  "credential.certificate": "Opened a certificate", "consent.request": "Requested your consent", "consent.grant": "Consent granted",
  "consent.deny": "Consent denied", "consent.revoke": "Consent revoked", "enrolment.read": "Looked up your enrolment",
  "enrolment.update": "Updated your enrolment", "activation_code.issue": "Issued a passkey activation code",
  "passkey.register": "Registered a passkey", "passkey.sign_in": "Signed in with a passkey", "passkey.revoke": "Revoked a passkey",
  "case.unmask": "Unmasked your record for a duplicate case",
};

export default function StudentHome() {
  const me = usePoll(() => getJson<S["StudentProfile"]>("/v1/students/me"), 10000);
  const creds = usePoll(() => getJson<S["CredentialOut"][]>("/v1/credentials"), 5000);
  const consents = usePoll(() => getJson<S["ConsentOut"][]>("/v1/consents"), 3000);
  const log = usePoll(() => getJson<S["AccessLogEntry"][]>("/v1/students/me/access-log"), 5000);
  const refresh = () => { creds.refresh(); consents.refresh(); log.refresh(); };

  if (me.error && !me.data) return <ErrorNote>{me.error}</ErrorNote>;
  if (!me.data) return <Loading />;
  const pending = (consents.data ?? []).filter((c) => c.status === "pending");
  const others = (consents.data ?? []).filter((c) => c.status !== "pending");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{me.data.viewer === "guardian" ? "Guardian view: student's academic record" : "My academic record"}</h1>
          <p className="text-sm text-slate-500">
            APAAR {me.data.apaar_masked ?? `not linked (provisional ${me.data.provisional_id})`} · status {me.data.apaar_status}
          </p>
        </div>
        <Updated at={consents.updatedAt} />
      </div>

      {me.data.passkey_cooldown_until && (
        <div role="alert" className="rounded-lg border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
          A new passkey was registered from an activation code your institution reissued. It can approve consent requests from
          {" "}{fmtTime(me.data.passkey_cooldown_until)}. If this wasn't you, contact your institution and AICTE: the reissue and its
          reason are listed under "Who accessed my data".
        </div>
      )}

      <Card title="Enrolments">
        {me.data.enrolments.length === 0 ? <Empty>No enrolments.</Empty> : (
          <Table head={["Programme", "Institution", "Year", "Student ID", "Status"]}>
            {me.data.enrolments.map((e, i) => (
              <tr key={i}><Td>{e.programme}</Td><Td>{e.institution}</Td><Td>{e.academic_year}</Td>
                <Td className="font-mono">{e.institution_student_id}</Td><Td><Badge tone={e.status === "active" ? "ok" : "neutral"}>{e.status}</Badge></Td></tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title={<span className="flex items-center gap-2">Consent requests {pending.length > 0 && <Badge tone="flag">{pending.length} waiting</Badge>}</span>}>
        {pending.length === 0 ? <Empty>No pending requests.</Empty> : (
          <div className="space-y-3">{pending.map((c) => <PendingConsent key={c.id} c={c} onDone={refresh} />)}</div>
        )}
        {others.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">History</h3>
            <Table head={["Requester", "Purpose", "Fields", "Status", "Expires", ""]}>
              {others.map((c) => (
                <tr key={c.id}>
                  <Td>{c.requester}</Td><Td wrap className="min-w-48">{c.purpose}</Td><Td wrap>{c.fields.join(", ")}</Td>
                  <Td><Badge tone={c.status === "granted" ? "ok" : c.status === "revoked" || c.status === "denied" ? "error" : "neutral"}>{c.status}</Badge>
                    {c.granted_by === "guardian" && <span className="ml-1 text-xs text-slate-500">(guardian)</span>}</Td>
                  <Td>{fmtTime(c.expires_at)}</Td>
                  <Td>{c.status === "granted" && <RevokeButton id={c.id} onDone={refresh} />}</Td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>

      <Card title="My credentials (wallet)">
        {!creds.data ? <Loading /> : creds.data.length === 0 ? <Empty>No credentials yet. Your institution or university issues them.</Empty> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {creds.data.map((c) => (
              <CredentialCard key={c.id} c={c} actions={<>
                {c.type !== "VerificationCredential" && <CertificateButton id={c.id} />}
                <Button variant="ghost" onClick={() => downloadJson(c.credential, `${c.type}.json`)}>Download JSON</Button>
              </>} />
            ))}
          </div>
        )}
      </Card>

      <Card title="Who accessed my data" actions={<span className="text-xs text-slate-500">Every recorded read, export, verification and consent (D6)</span>}>
        {!log.data ? <Loading /> : log.data.length === 0 ? <Empty>No access recorded yet.</Empty> : (
          <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
            {log.data.map((e, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span>
                <span className="text-slate-600"> by {e.actor} ({e.role.replace("_", " ")})</span>
                {e.reason && <span className="text-slate-500"> · {e.reason}</span>}
                <span className="block text-xs text-slate-400">{fmtTime(e.ts)}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function PendingConsent({ c, onDone }: { c: S["ConsentOut"]; onDone: () => void }) {
  const [demo, setDemo] = useState(false);
  const [otp, setOtp] = useState("");
  const [guardian, setGuardian] = useState(false);
  const [gotp, setGotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getJson<S["AuthConfig"]>("/v1/auth/config").then((x) => setDemo(x.demo_mode)).catch(() => {}); }, []);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); onDone(); } catch (e) { setError(passkeyError(e) ?? (e instanceof ApiError ? e.text : "Request failed")); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-flag/30 bg-flag-bg/40 p-4">
      <p className="text-sm"><strong>{c.requester}</strong> asks to see <strong>{c.fields.join(", ")}</strong></p>
      <p className="mt-1 text-sm text-slate-600">Purpose: {c.purpose} · until {fmtTime(c.expires_at)}</p>
      <p className="mt-1 text-xs text-slate-500">They will receive a signed credential with only these fields. You can revoke it at any time.
        Your passkey signs exactly this request.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Button disabled={busy} onClick={() => act(() => approveWithPasskey(c.id))}>{busy ? "Waiting for passkey…" : "Approve with passkey"}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => act(() => sendJson(`/v1/consents/${c.id}/deny`, "POST"))}>Deny</Button>
      </div>
      {demo && (
        <details className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-amber-900">Demo fallback: approve with MOCK OTP (DEMO_MODE)</summary>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="text-sm"><span className="block text-xs text-slate-600">OTP (MOCK: 123456)</span>
              <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" className="mt-1 w-28 rounded-lg border border-slate-300 px-2 py-1" /></label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} className="accent-brand-600" />
              Under 18: guardian approves (self-asserted, MOCK)</label>
            {guardian && <label className="text-sm"><span className="block text-xs text-slate-600">Guardian OTP (MOCK)</span>
              <input value={gotp} onChange={(e) => setGotp(e.target.value)} inputMode="numeric" className="mt-1 w-28 rounded-lg border border-slate-300 px-2 py-1" /></label>}
            <Button variant="secondary" disabled={busy || !otp} onClick={() => act(() => sendJson(`/v1/consents/${c.id}/approve`, "POST",
              { otp, approved_by: guardian ? "guardian" : "student", guardian_otp: guardian ? gotp : null }))}>Approve (MOCK)</Button>
          </div>
        </details>
      )}
      {error && <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>}
    </div>
  );
}

function RevokeButton({ id, onDone }: { id: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="ghost" disabled={busy} onClick={async () => {
      if (!window.confirm("Revoke this consent? The verifier's credential will stop verifying.")) return;
      setBusy(true);
      try { await sendJson(`/v1/consents/${id}/revoke`, "POST"); onDone(); } finally { setBusy(false); }
    }}>Revoke</Button>
  );
}
