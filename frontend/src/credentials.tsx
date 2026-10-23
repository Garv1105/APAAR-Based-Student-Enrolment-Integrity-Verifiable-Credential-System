// Shared UI for W3C Verifiable Credentials: verification result, credential card, verify tool.
import { useRef, useState } from "react";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  FileCheck,
  FileText,
  ShieldAlert,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { ApiError, getJson, sendJson, type S } from "./api/client";
import { Badge, Button, Card, ErrorNote, go, type Tone } from "./ui";

type VerifyOut = S["VerifyOut"];
type Result = VerifyOut["result"];

const RESULT: Record<Result, { tone: Tone; label: string; help: string }> = {
  VALID: { tone: "ok", label: "Cryptographically Valid", help: "Signed by an approved institution in the AICTE trust registry, intact, active, and not revoked." },
  REVOKED: { tone: "error", label: "Revoked by Issuer", help: "The issuing institution revoked this credential (e.g. candidate withdrawal, academic penalty, or consent revocation)." },
  SUSPENDED: { tone: "warning", label: "Temporarily Suspended", help: "Temporarily placed on administrative hold by the issuer pending review." },
  UNTRUSTED_ISSUER: { tone: "error", label: "Untrusted / Unapproved Issuer", help: "The signing authority is not active in the national AICTE trust registry." },
  TAMPERED: { tone: "error", label: "Cryptographic Tampering Detected", help: "EdDSA signature verification failed: payload contents were altered after issuance." },
  EXPIRED: { tone: "warning", label: "Validity Period Expired", help: "The credential has passed its expiration timestamp (validUntil)." },
  MALFORMED: { tone: "error", label: "Malformed Credential Payload", help: "Payload does not conform to the W3C Verifiable Credential standard format." },
};

const CHECK_LABEL: Record<keyof VerifyOut["checks"], string> = {
  well_formed: "Conforms to W3C Verifiable Credential schema",
  issuer_trusted: "Issuer active in AICTE national trust registry",
  signature_valid: "Cryptographic Ed25519 signature verified (eddsa-jcs-2022)",
  within_validity: "Timestamp within valid period (validFrom - validUntil)",
  not_revoked: "StatusList2021 check: Not revoked",
  not_suspended: "StatusList2021 check: Not suspended",
};

const CLAIM_LABEL: Record<string, string> = {
  name: "Candidate Name",
  apaarId: "APAAR ID",
  provisionalId: "Provisional ID",
  studentId: "Student Roll ID",
  programme: "Enrolled Programme",
  degree: "Awarded Degree",
  institution: "Institution",
  academicYear: "Academic Year",
  status: "Enrolment Status",
  seatType: "Seat Quota Category",
  awardedOn: "Degree Award Date",
};

export function Claims({ subject }: { subject: Record<string, unknown> }) {
  const entries = Object.entries(subject).filter(([k]) => k !== "consent");
  const consent = subject.consent as { purpose?: string; verifier?: string } | undefined;

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {entries.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-slate-200/70 bg-white/80 p-3 shadow-2xs">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{CLAIM_LABEL[k] ?? k}</dt>
            <dd className={`mt-0.5 font-bold text-gov-900 ${k === "apaarId" || k === "studentId" ? "font-mono text-xs" : "text-sm"}`}>
              {String(v)}
            </dd>
          </div>
        ))}
      </dl>
      {consent && (
        <div className="rounded-xl border border-accent-200 bg-accent-50/60 p-3 text-xs text-accent-900 font-medium">
          Selective disclosure shared with <strong className="font-bold text-accent-950">{consent.verifier}</strong> for: {consent.purpose}
        </div>
      )}
    </div>
  );
}

export function VerifyResultView({ out }: { out: VerifyOut }) {
  const r = RESULT[out.result];
  const isOk = r.tone === "ok";
  const isWarn = r.tone === "warning";

  return (
    <div
      className={`rounded-2xl border p-5 shadow-xs transition-all ${
        isOk
          ? "border-success-border bg-success-bg/50"
          : isWarn
          ? "border-warning-border bg-warning-bg/50"
          : "border-critical-border bg-critical-bg/50"
      }`}
      role="status"
      aria-live="polite"
    >
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 pb-3">
        <div className="flex items-center gap-2.5">
          {isOk ? (
            <CheckCircle2 className="h-6 w-6 text-success" />
          ) : isWarn ? (
            <AlertTriangle className="h-6 w-6 text-warning" />
          ) : (
            <XCircle className="h-6 w-6 text-critical" />
          )}
          <div>
            <h4 className={`text-base font-bold ${isOk ? "text-success-text" : isWarn ? "text-warning-text" : "text-critical-text"}`}>
              {r.label}
            </h4>
            {out.issuer_name && (
              <p className="text-xs text-slate-600">
                Issued by <strong className="font-semibold text-slate-900">{out.issuer_name}</strong>
              </p>
            )}
          </div>
        </div>
        <Badge tone={r.tone} dot>{out.result}</Badge>
      </div>

      <p className="mt-2.5 text-xs text-slate-700 font-medium">{r.help}</p>

      {/* Cryptographic Checklist */}
      <div className="mt-4 rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
          Trust & Signature Verification Checklist
        </span>
        <ul className="grid gap-2 sm:grid-cols-2 text-xs">
          {(Object.keys(CHECK_LABEL) as (keyof VerifyOut["checks"])[]).map((k) => {
            const pass = out.checks[k];
            return (
              <li
                key={k}
                className={`flex items-start gap-2 rounded-lg p-2 font-medium ${
                  pass ? "bg-success-bg/40 text-success-text" : "bg-critical-bg/40 text-critical-text"
                }`}
              >
                {pass ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success mt-0.2" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-critical mt-0.2" />
                )}
                <span>{CHECK_LABEL[k]}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Verified Claims Subject */}
      {out.subject && (
        <div className="mt-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
            Verified Academic Claims
          </span>
          <Claims subject={out.subject as Record<string, unknown>} />
        </div>
      )}
    </div>
  );
}

export function CredentialCard({ c, actions }: { c: S["CredentialOut"]; actions?: React.ReactNode }) {
  const vc = c.credential as { issuer?: { name?: string }; validUntil?: string; credentialSubject?: Record<string, unknown> };
  const label = {
    EnrolmentCredential: "APAAR Enrolment Credential",
    DegreeCredential: "AICTE University Degree Credential",
    VerificationCredential: "Verification Credential (Consent-Scoped)",
  }[c.type];

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-premium transition-all hover:border-slate-300">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent-50 text-accent-700">
            {c.type === "DegreeCredential" ? <Award className="h-5 w-5" /> : <FileCheck className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-sm font-bold text-gov-900">{label}</p>
            <p className="text-xs text-slate-500">
              {vc.issuer?.name} · Issued {new Date(c.issued_at).toLocaleDateString()}
              {vc.validUntil ? ` · Valid until ${new Date(vc.validUntil).toLocaleDateString()}` : ""}
            </p>
          </div>
        </div>
        <div>
          {c.status.revocation ? (
            <Badge tone="error" dot>REVOKED</Badge>
          ) : c.status.suspension ? (
            <Badge tone="warning" dot>SUSPENDED</Badge>
          ) : (
            <Badge tone="ok" dot>ACTIVE</Badge>
          )}
        </div>
      </div>

      {vc.credentialSubject && (
        <div className="mt-4">
          <Claims subject={vc.credentialSubject} />
        </div>
      )}

      {actions && <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{actions}</div>}
    </div>
  );
}

export function downloadJson(obj: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function CertificateButton({ id }: { id: string }) {
  return (
    <Button variant="secondary" onClick={() => go(`/certificate?id=${encodeURIComponent(id)}`)}>
      <FileText className="h-3.5 w-3.5" />
      <span>Print Certificate & QR</span>
    </Button>
  );
}

/** Paste a VC (JSON) or the certificate QR text (AV1:...), or load a file; verified online via POST /v1/verify. */
export function VerifyTool({ allowForgedDemo = false }: { allowForgedDemo?: boolean }) {
  const [text, setText] = useState("");
  const [out, setOut] = useState<VerifyOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  async function run(input: string) {
    setBusy(true);
    setError(null);
    setOut(null);
    try {
      const t = input.trim();
      let body: { credential?: unknown; qr?: string };
      if (t.startsWith("AV1:")) body = { qr: t };
      else {
        try {
          body = { credential: JSON.parse(t) };
        } catch {
          throw new Error("Invalid payload: Paste a valid W3C credential JSON string or QR text starting with AV1:");
        }
      }
      setOut(await sendJson<VerifyOut>("/v1/verify", "POST", body));
    } catch (e) {
      setError(e instanceof ApiError ? e.text : e instanceof Error ? e.message : "Verification request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-accent-600" />
          <span>W3C Verifiable Credential Validation Console</span>
        </div>
      }
      actions={<span className="text-xs text-slate-500 font-medium">Real-time status list check & trust registry audit</span>}
    >
      <div className="space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600" htmlFor="vc-input">
          Paste Credential JSON or Certificate QR Payload (AV1:...)
        </label>
        <textarea
          id="vc-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          spellCheck={false}
          placeholder='{"@context": [...], "type": ["VerifiableCredential", ...], "proof": {...}}   or   AV1:...'
          className="w-full rounded-xl border border-slate-300 bg-slate-50/50 p-3 font-mono text-xs text-gov-900 shadow-2xs focus:bg-white focus:border-accent-600 focus:ring-1 focus:ring-accent-600"
        />

        <div className="flex flex-wrap items-center gap-2.5">
          <Button onClick={() => run(text)} disabled={busy || !text.trim()}>
            <ShieldCheck className="h-4 w-4" />
            <span>{busy ? "Verifying signature…" : "Verify Credential"}</span>
          </Button>

          <Button variant="secondary" onClick={() => file.current?.click()}>
            <Upload className="h-4 w-4" />
            <span>Load JSON File</span>
          </Button>
          <input
            ref={file}
            type="file"
            accept=".json,application/json,.txt"
            className="sr-only"
            aria-label="Credential file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                const t = await f.text();
                setText(t);
                run(t);
              }
              e.target.value = "";
            }}
          />

          {allowForgedDemo && (
            <Button
              variant="ghost"
              onClick={async () => {
                const vc = await getJson<unknown>("/v1/demo/forged-credential");
                const t = JSON.stringify(vc, null, 2);
                setText(t);
                run(t);
              }}
            >
              <ShieldAlert className="h-4 w-4 text-critical" />
              <span>Test Forged Credential (SIH Demo)</span>
            </Button>
          )}
        </div>

        {error && (
          <div className="mt-3">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}

        {out && (
          <div className="mt-4">
            <VerifyResultView out={out} />
          </div>
        )}
      </div>
    </Card>
  );
}
