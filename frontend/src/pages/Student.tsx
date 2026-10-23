import { useState } from "react";
import {
  Award,
  CheckCircle2,
  Fingerprint,
  GraduationCap,
  History,
  ShieldCheck,
} from "lucide-react";
import { ApiError, getJson, sendJson, type S } from "../api/client";
import { CertificateButton, CredentialCard, downloadJson } from "../credentials";
import { Badge, Button, Card, Empty, ErrorNote, fmtTime, Loading, Table, Td, Updated, usePoll } from "../ui";

const ACTION_LABEL: Record<string, string> = {
  "credential.verify": "Verified your credential",
  "credential.issue": "Issued new verifiable credential",
  "credential.read": "Viewed credential wallet",
  "credential.certificate": "Generated official certificate",
  "consent.request": "Requested selective data consent",
  "consent.grant": "Consent approved via OTP",
  "consent.deny": "Consent declined",
  "consent.revoke": "Consent revoked by student",
  "enrolment.read": "Queried enrolment record",
  "enrolment.update": "Modified enrolment details",
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
      {/* Student Profile & Digital APAAR ID Card */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Digital APAAR ID Card (Simulated Government Identity Card) */}
        <div className="relative overflow-hidden rounded-3xl border border-slate-700 bg-gradient-to-br from-gov-950 via-slate-900 to-indigo-950 p-6 text-white shadow-premium-lg md:col-span-1 flex flex-col justify-between">
          <div className="absolute right-0 top-0 -mr-8 -mt-8 h-32 w-32 rounded-full bg-accent-600/20 blur-2xl" />

          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-amber-400" />
                <span className="text-[11px] font-extrabold tracking-widest text-white uppercase">
                  APAAR ID · भारत
                </span>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-400/30">
                {me.data.apaar_status}
              </span>
            </div>

            <div className="mt-6 space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">National Student ID</span>
              <div className="font-mono text-xl font-extrabold tracking-wider text-white">
                {me.data.apaar_masked ?? me.data.provisional_id}
              </div>
              {me.data.provisional_id && !me.data.apaar_masked && (
                <span className="text-[10px] text-amber-300 font-medium">Provisional ID (Pending Aadhaar link)</span>
              )}
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-300 font-medium">
            <span>DigiLocker Synced</span>
            <span className="font-mono text-[10px] text-slate-400">W3C Compliant</span>
          </div>
        </div>

        {/* Overview Header */}
        <div className="flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 shadow-premium md:col-span-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-700">
              <span>National Academic Depository</span>
              <span>·</span>
              <span>Beneficiary Wallet</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-gov-900 sm:text-3xl">My Academic Record</h1>
            <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
              Your academic enrolments, degrees, and tamper-proof W3C credentials. You maintain full data sovereignty under the DPDP Act 2023.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <Updated at={consents.updatedAt} />
            <Button variant="secondary" onClick={refresh}>
              Sync Records
            </Button>
          </div>
        </div>
      </div>

      {/* Enrolment Registry Record */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-accent-600" />
            <span>Active Enrolments</span>
          </div>
        }
      >
        {me.data.enrolments.length === 0 ? (
          <Empty>No enrolment records associated with this identity.</Empty>
        ) : (
          <Table head={["Enrolled Programme", "Sanctioned Institution", "Academic Session", "Student Roll ID", "Integrity Status"]}>
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

      {/* Consent Requests Inbox */}
      <Card
        title={
          <div className="flex items-center gap-2.5">
            <Fingerprint className="h-4 w-4 text-accent-600" />
            <span>Data Verification Consent Requests (DPDP Act 2023)</span>
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

      {/* Credential Wallet */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-accent-600" />
            <span>My Digital Credentials Wallet</span>
          </div>
        }
        actions={<span className="text-xs text-slate-500 font-medium">W3C Verifiable Credentials with offline QR verification</span>}
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

      {/* Access Audit Log */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-accent-600" />
            <span>DPDP Access Audit Trail (Section 6)</span>
          </div>
        }
        actions={<span className="text-xs text-slate-500 font-medium">Immutable record of every read, verification, and export</span>}
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
  const [otp, setOtp] = useState("123456");
  const [guardian, setGuardian] = useState(false);
  const [gotp, setGotp] = useState("123456");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await sendJson(path, "POST", body);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.text : "Authorization request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-accent-300 bg-accent-50/50 p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-gov-900">
            <strong className="text-accent-700">{c.requester}</strong> requests authorization to inspect:
          </h4>
          <p className="mt-1 font-semibold text-accent-950 text-xs">{c.fields.join(", ")}</p>
          <p className="mt-1 text-xs text-slate-600">
            Purpose: <span className="font-medium">{c.purpose}</span> · Valid until {fmtTime(c.expires_at)}
          </p>
        </div>
        <Badge tone="flag" dot>ACTION REQUIRED</Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-accent-200/60 pt-3 text-xs">
        <div>
          <label htmlFor={`otp-${c.id}`} className="block font-semibold uppercase tracking-wider text-slate-600 text-[10px]">
            Student OTP (Mock: 123456)
          </label>
          <input
            id={`otp-${c.id}`}
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            inputMode="numeric"
            className="mt-1 w-28 rounded-xl border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-bold shadow-xs focus:border-accent-600"
          />
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 pb-2">
          <input
            type="checkbox"
            checked={guardian}
            onChange={(e) => setGuardian(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-accent-600 accent-accent-600"
          />
          <span>Minor under 18: Guardian consent required</span>
        </label>

        {guardian && (
          <div>
            <label htmlFor={`gotp-${c.id}`} className="block font-semibold uppercase tracking-wider text-slate-600 text-[10px]">
              Guardian OTP
            </label>
            <input
              id={`gotp-${c.id}`}
              value={gotp}
              onChange={(e) => setGotp(e.target.value)}
              inputMode="numeric"
              className="mt-1 w-28 rounded-xl border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-bold shadow-xs"
            />
          </div>
        )}

        <Button
          disabled={busy || !otp}
          onClick={() =>
            act(`/v1/consents/${c.id}/approve`, {
              otp,
              approved_by: guardian ? "guardian" : "student",
              guardian_otp: guardian ? gotp : null,
            })
          }
        >
          Authorize Consent
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => act(`/v1/consents/${c.id}/deny`)}>
          Decline
        </Button>
      </div>

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
