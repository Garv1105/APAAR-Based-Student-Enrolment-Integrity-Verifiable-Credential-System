import { useEffect, useState } from "react";
import {
  Award,
  CheckCircle2,
  Fingerprint,
  GraduationCap,
  History,
  ShieldCheck,
} from "lucide-react";
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
  const refresh = () => {
    creds.refresh();
    consents.refresh();
    log.refresh();
  };

  if (me.error && !me.data) return <ErrorNote>{me.error}</ErrorNote>;
  if (!me.data) return <Loading />;
  const pending = (consents.data ?? []).filter((c) => c.status === "pending");
  const others = (consents.data ?? []).filter((c) => c.status !== "pending");

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="grid gap-6 md:grid-cols-3">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-[#1a1710] via-raised to-surface p-6 text-white ring-1 ring-gold/25 shadow-premium-lg md:col-span-1 flex flex-col justify-between">
          <div className="absolute right-0 top-0 -mr-8 -mt-8 h-32 w-32 rounded-full bg-accent-600/20 blur-2xl" />

          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-gold" />
                <span className="text-[11px] font-extrabold tracking-widest text-white uppercase">
                  APAAR ID
                </span>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-400/30">
                {me.data.apaar_status}
              </span>
            </div>

            <div className="mt-6 space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">APAAR ID (masked)</span>
              <div className="font-mono text-xl font-extrabold tracking-wider text-white">
                {me.data.apaar_masked ?? me.data.provisional_id}
              </div>
              {me.data.provisional_id && !me.data.apaar_masked && (
                <span className="text-[10px] text-warning-text font-medium">Provisional ID: APAAR not linked</span>
              )}
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-mute font-medium">
            <span>APAAR registry (MOCK)</span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-surface p-6 shadow-premium md:col-span-2">
          <div>
            <h1 className="mt-1 font-display text-[36px] font-normal leading-tight text-ink sm:text-[42px]">
              {me.data.viewer === "guardian" ? "Guardian view: student's academic record" : "My academic record"}
            </h1>
            <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
              Your enrolments, signed credentials, who asked for your data, and who accessed it.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <Updated at={consents.updatedAt} />
            <Button variant="secondary" onClick={refresh}>
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {me.data.passkey_cooldown_until && (
        <div role="alert" className="rounded-lg border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
          A new passkey was registered for this account. As a safety measure it can approve consent requests only from
          {" "}{fmtTime(me.data.passkey_cooldown_until)}. If this wasn't you, contact your institution and AICTE: every activation
          code, with its reason, is listed under "Who accessed my data".
        </div>
      )}

      <Card
        title={
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-accent-600" />
            <span>Enrolments</span>
          </div>
        }
      >
        {me.data.enrolments.length === 0 ? (
          <Empty>No enrolments.</Empty>
        ) : (
          <Table head={["Programme", "Institution", "Year", "Student ID", "Status"]}>
            {me.data.enrolments.map((e, i) => (
              <tr key={i} className="transition-colors hover:bg-slate-50/70">
                <Td className="font-bold text-gov-900">{e.programme}</Td>
                <Td className="font-medium text-slate-700">{e.institution}</Td>
                <Td>{e.academic_year}</Td>
                <Td className="font-mono text-xs font-bold text-slate-600">{e.institution_student_id}</Td>
                <Td>
                  <Badge tone={e.status === "active" ? "ok" : "neutral"} dot>
                    {e.status.toUpperCase()}
                  </Badge>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card id="consents"
        title={
          <div className="flex items-center gap-2.5">
            <Fingerprint className="h-4 w-4 text-accent-600" />
            <span>Consent requests</span>
            {pending.length > 0 && (
              <Badge tone="flag" dot>
                {pending.length} pending authorization
              </Badge>
            )}
          </div>
        }
        actions={<span className="text-xs text-slate-500 font-medium">Verify third-party requests before granting access</span>}
      >
        {pending.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-xs text-slate-500 font-medium">
            <CheckCircle2 className="mr-1.5 h-4 w-4 text-success" />
            <span>No pending consent requests waiting for authorization.</span>
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((c) => (
              <PendingConsent key={c.id} c={c} onDone={refresh} />
            ))}
          </div>
        )}

        {others.length > 0 && (
          <div className="mt-8 border-t border-slate-200/80 pt-5">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
              Prior Consent History & Revocation
            </h3>
            <Table head={["Verification Entity", "Declared Purpose", "Disclosed Claims", "Current Status", "Expires", "Action"]}>
              {others.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-slate-50/70">
                  <Td className="font-semibold text-gov-900">{c.requester}</Td>
                  <Td wrap className="min-w-48 text-xs">{c.purpose}</Td>
                  <Td wrap className="text-xs text-slate-600">{c.fields.join(", ")}</Td>
                  <Td>
                    <Badge tone={c.status === "granted" ? "ok" : c.status === "revoked" || c.status === "denied" ? "error" : "neutral"} dot>
                      {c.status.toUpperCase()}
                    </Badge>
                    {c.granted_by === "guardian" && (
                      <span className="ml-1.5 text-[11px] font-semibold text-slate-500">(Guardian Approved)</span>
                    )}
                  </Td>
                  <Td className="text-xs text-slate-500">{fmtTime(c.expires_at)}</Td>
                  <Td>
                    {c.status === "granted" && <RevokeButton id={c.id} onDone={refresh} />}
                  </Td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>

      <Card id="wallet"
        title={
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-accent-600" />
            <span>Credential wallet</span>
          </div>
        }
        actions={<span className="text-xs text-slate-500 font-medium">Signed W3C Verifiable Credentials · verified online</span>}
      >
        {!creds.data ? (
          <Loading />
        ) : creds.data.length === 0 ? (
          <Empty>No credentials issued yet. Your approved institution or university issues them upon enrolment confirmation.</Empty>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {creds.data.map((c) => (
              <CredentialCard
                key={c.id}
                c={c}
                actions={
                  <>
                    {c.type !== "VerificationCredential" && <CertificateButton id={c.id} />}
                    <Button variant="secondary" onClick={() => downloadJson(c.credential, `${c.type}.json`)}>
                      Download JSON
                    </Button>
                  </>
                }
              />
            ))}
          </div>
        )}
      </Card>

      <Card id="access-log"
        title={
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-accent-600" />
            <span>Who accessed my data</span>
          </div>
        }
        actions={<span className="text-xs text-slate-500 font-medium">Every recorded read, export, verification and consent</span>}
      >
        {!log.data ? (
          <Loading />
        ) : log.data.length === 0 ? (
          <Empty>No external access events recorded for this academic account.</Empty>
        ) : (
          <ol className="space-y-3 border-l-2 border-slate-200 pl-4 py-2">
            {log.data.map((e, i) => (
              <li key={i} className="text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gov-900">{ACTION_LABEL[e.action] ?? e.action}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                    {e.role.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-0.5 text-slate-500">
                  By <strong className="text-slate-800">{e.actor}</strong>
                  {e.reason && <span> · Purpose: {e.reason}</span>}
                </div>
                <span className="mt-0.5 block font-mono text-[10px] text-slate-400">{fmtTime(e.ts)}</span>
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
    <div className="rounded-2xl border border-accent-300 bg-accent-50/50 p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-gov-900">
            <strong className="text-accent-700">{c.requester}</strong> asks to see:
          </h4>
          <p className="mt-1 font-semibold text-accent-950 text-xs">{c.fields.join(", ")}</p>
          <p className="mt-1 text-xs text-slate-600">
            Purpose: <span className="font-medium">{c.purpose}</span> · until {fmtTime(c.expires_at)}
          </p>
          <p className="mt-1 text-xs text-slate-500">They will receive a signed credential with only these fields. You can revoke it at any time.
            Your passkey signs exactly this request.</p>
        </div>
        <Badge tone="flag" dot>Action required</Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-accent-200/60 pt-3 text-xs">
        <Button disabled={busy} onClick={() => act(() => approveWithPasskey(c.id))}>
          <Fingerprint className="h-4 w-4" aria-hidden /> {busy ? "Waiting for passkey…" : "Approve with passkey"}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => act(() => sendJson(`/v1/consents/${c.id}/deny`, "POST"))}>
          Deny
        </Button>
      </div>

      {demo && (
        <details className="mt-3 rounded-lg border border-warning-border bg-warning-bg p-2 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-warning-text">Demo fallback: approve with MOCK OTP (DEMO_MODE)</summary>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="text-sm"><span className="block text-xs text-slate-600">OTP (MOCK: 123456)</span>
              <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" className="mt-1 w-28 rounded-lg border border-slate-300 px-2 py-1" /></label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} />
              Under 18: guardian approves (self-asserted, MOCK)</label>
            {guardian && <label className="text-sm"><span className="block text-xs text-slate-600">Guardian OTP (MOCK)</span>
              <input value={gotp} onChange={(e) => setGotp(e.target.value)} inputMode="numeric" className="mt-1 w-28 rounded-lg border border-slate-300 px-2 py-1" /></label>}
            <Button variant="secondary" disabled={busy || !otp} onClick={() => act(() => sendJson(`/v1/consents/${c.id}/approve`, "POST",
              { otp, approved_by: guardian ? "guardian" : "student", guardian_otp: guardian ? gotp : null }))}>Approve (MOCK)</Button>
          </div>
        </details>
      )}

      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </div>
  );
}

function RevokeButton({ id, onDone }: { id: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="danger"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm("Revoke this consent? The verifier's credential will instantly cease to verify.")) return;
        setBusy(true);
        try {
          await sendJson(`/v1/consents/${id}/revoke`, "POST");
          onDone();
        } finally {
          setBusy(false);
        }
      }}
    >
      Revoke Access
    </Button>
  );
}
