// Shared UI for W3C Verifiable Credentials: verification result, credential card, verify tool.
import { useRef, useState } from "react";
import { ApiError, getJson, sendJson, type S } from "./api/client";
import { Badge, Button, Card, ErrorNote, go, type Tone } from "./ui";

type VerifyOut = S["VerifyOut"];
type Result = VerifyOut["result"];

const RESULT: Record<Result, { tone: Tone; label: string; help: string }> = {
  VALID: { tone: "ok", label: "Valid", help: "Signed by a registered issuer, unchanged, in date and not revoked." },
  REVOKED: { tone: "error", label: "Revoked", help: "The issuer revoked this credential (e.g. the student withdrew or consent was withdrawn)." },
  SUSPENDED: { tone: "warning", label: "Suspended", help: "Temporarily suspended by the issuer (e.g. under investigation)." },
  UNTRUSTED_ISSUER: { tone: "error", label: "Untrusted issuer", help: "The issuer is not in the AICTE registry, or wasn't approved when this was issued." },
  TAMPERED: { tone: "error", label: "Tampered", help: "The signature doesn't match: the content was changed after signing." },
  EXPIRED: { tone: "warning", label: "Expired", help: "Outside the credential's validity period." },
  MALFORMED: { tone: "error", label: "Not a valid credential", help: "Not a well-formed student credential from this platform." },
};

const CHECK_LABEL: Record<keyof VerifyOut["checks"], string> = {
  well_formed: "Well-formed student credential",
  issuer_trusted: "Issuer in AICTE trust registry (MOCK)",
  signature_valid: "Signature valid (eddsa-jcs-2022)",
  within_validity: "Within validity period",
  not_revoked: "Not revoked (status list)",
  not_suspended: "Not suspended (status list)",
};

const CLAIM_LABEL: Record<string, string> = {
  name: "Name", apaarId: "APAAR ID", provisionalId: "Provisional ID", studentId: "Student ID", programme: "Programme",
  degree: "Degree", institution: "Institution", academicYear: "Academic year", status: "Status", seatType: "Seat type",
  awardedOn: "Awarded on",
};

export function Claims({ subject }: { subject: Record<string, unknown> }) {
  const entries = Object.entries(subject).filter(([k]) => k !== "consent");
  const consent = subject.consent as { purpose?: string; verifier?: string } | undefined;
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-slate-500">{CLAIM_LABEL[k] ?? k}</dt>
          <dd className={`font-medium ${k === "apaarId" || k === "studentId" ? "font-mono" : ""}`}>{String(v)}</dd>
        </div>
      ))}
      {consent && (
        <div className="sm:col-span-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
          Shared with <strong>{consent.verifier}</strong> for: {consent.purpose}
        </div>
      )}
    </dl>
  );
}

export function VerifyResultView({ out }: { out: VerifyOut }) {
  const r = RESULT[out.result];
  return (
    <div className={`rounded-xl border p-4 ${r.tone === "ok" ? "border-ok/30 bg-ok-bg" : r.tone === "warning" ? "border-warn/30 bg-warn-bg" : "border-err/30 bg-err-bg"}`}
      role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-lg font-semibold ${r.tone === "ok" ? "text-ok" : r.tone === "warning" ? "text-warn" : "text-err"}`}>
          {r.tone === "ok" ? "✓" : "✕"} {r.label}
        </span>
        {out.issuer_name && <span className="text-sm text-slate-700">issued by <strong>{out.issuer_name}</strong></span>}
      </div>
      <p className="mt-1 text-sm text-slate-700">{r.help}</p>
      <ul className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
        {(Object.keys(CHECK_LABEL) as (keyof VerifyOut["checks"])[]).map((k) => (
          <li key={k} className={out.checks[k] ? "text-ok" : "text-err"}>{out.checks[k] ? "✓" : "✕"} {CHECK_LABEL[k]}</li>
        ))}
      </ul>
      {out.subject && <div className="mt-4 rounded-lg bg-white/70 p-3"><Claims subject={out.subject as Record<string, unknown>} /></div>}
    </div>
  );
}

export function CredentialCard({ c, actions }: { c: S["CredentialOut"]; actions?: React.ReactNode }) {
  const vc = c.credential as { issuer?: { name?: string }; validUntil?: string; credentialSubject?: Record<string, unknown> };
  const label = { EnrolmentCredential: "Enrolment credential", DegreeCredential: "Degree credential", VerificationCredential: "Verification credential (consent-scoped)" }[c.type];
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-slate-500">{vc.issuer?.name} · issued {new Date(c.issued_at).toLocaleDateString()}
            {vc.validUntil ? ` · valid until ${new Date(vc.validUntil).toLocaleDateString()}` : ""}</p>
        </div>
        <div className="flex gap-1">
          {c.status.revocation ? <Badge tone="error">revoked</Badge> : c.status.suspension ? <Badge tone="warning">suspended</Badge> : <Badge tone="ok">active</Badge>}
        </div>
      </div>
      {vc.credentialSubject && <div className="mt-3"><Claims subject={vc.credentialSubject} /></div>}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
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
  return <Button variant="secondary" onClick={() => go(`/certificate?id=${encodeURIComponent(id)}`)}>Certificate & QR</Button>;
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
        try { body = { credential: JSON.parse(t) }; } catch { throw new Error("Paste the credential JSON or the QR text starting with AV1:"); }
      }
      setOut(await sendJson<VerifyOut>("/v1/verify", "POST", body));
    } catch (e) {
      setError(e instanceof ApiError ? e.text : e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Verify a credential" actions={<span className="text-xs text-slate-500">Online check against the trust registry and status lists</span>}>
      <label className="block text-sm font-medium text-slate-700" htmlFor="vc-input">Credential JSON or certificate QR text</label>
      <textarea id="vc-input" value={text} onChange={(e) => setText(e.target.value)} rows={6} spellCheck={false}
        placeholder='{"@context": [...], "type": ["VerifiableCredential", ...], ...}   or   AV1:...'
        className="mt-1 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => run(text)} disabled={busy || !text.trim()}>{busy ? "Verifying…" : "Verify"}</Button>
        <Button variant="secondary" onClick={() => file.current?.click()}>Load JSON file</Button>
        <input ref={file} type="file" accept=".json,application/json,.txt" className="sr-only" aria-label="Credential file"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const t = await f.text(); setText(t); run(t); } e.target.value = ""; }} />
        {allowForgedDemo && (
          <Button variant="ghost" onClick={async () => {
            const vc = await getJson<unknown>("/v1/demo/forged-credential");
            const t = JSON.stringify(vc, null, 2);
            setText(t);
            run(t);
          }}>Try a forged credential (DEMO)</Button>
        )}
      </div>
      <div className="mt-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        {out && <VerifyResultView out={out} />}
      </div>
    </Card>
  );
}
