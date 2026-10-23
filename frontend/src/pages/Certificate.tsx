import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Copy, Printer, ShieldCheck } from "lucide-react";
import { ApiError, getJson, type S } from "../api/client";
import { Button, ErrorNote, Loading } from "../ui";

/** Printable certificate (Req 10): APAAR ID and student ID in full, plus the offline-verifiable QR. */
export default function Certificate({ id }: { id: string }) {
  const [cert, setCert] = useState<S["CertificateOut"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getJson<S["CertificateOut"]>(`/v1/credentials/certificate?id=${encodeURIComponent(id)}`)
      .then(setCert)
      .catch((e) => setError(e instanceof ApiError ? e.text : "Cannot load certificate"));
  }, [id]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!cert) return <Loading />;
  const vc = cert.credential as {
    type: string[];
    issuer: { name: string; id: string };
    validFrom: string;
    credentialSubject: Record<string, string>;
  };
  const s = vc.credentialSubject;
  const degree = vc.type.includes("DegreeCredential");
  // the SVG comes from our backend's QR generator; rendered as an image, never injected as HTML
  const qrSrc = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(cert.qr_svg)))}`;

  const copyPayload = () => {
    navigator.clipboard?.writeText(cert.qr_payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs print:hidden">
        <Button variant="ghost" onClick={() => history.back()}>
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Portal</span>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={copyPayload}>
            <Copy className="h-4 w-4 text-accent-600" />
            <span>{copied ? "QR Payload Copied!" : "Copy QR Payload"}</span>
          </Button>
          <Button variant="primary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            <span>Print Official Certificate</span>
          </Button>
        </div>
      </div>

      {/* Official Gov Academic Certificate Paper */}
      <article className="relative overflow-hidden rounded-3xl border-8 border-double border-gov-900 bg-white p-10 shadow-premium-lg print:border-4 print:shadow-none print:p-6 sm:p-14">
        {/* Subtle Guilloche Watermark */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.03] select-none"
        >
          <ShieldCheck className="h-96 w-96 text-gov-900" />
        </div>

        {/* Certificate Header */}
        <header className="relative text-center border-b-2 border-slate-200 pb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="h-12 w-12 rounded-2xl bg-gov-900 flex items-center justify-center text-white shadow-md">
              <ShieldCheck className="h-7 w-7 text-amber-400" />
            </div>
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-slate-500">
            {degree ? "Government of India · Verified Degree Credential" : "All India Council for Technical Education · Enrolment Credential"}
          </p>
          <h1 className="mt-2 text-2xl font-extrabold text-gov-900 sm:text-3xl tracking-tight">
            {vc.issuer.name}
          </h1>
          <p className="mt-1 text-xs font-semibold text-accent-700 uppercase tracking-widest">
            Automated Permanent Academic Account Registry (APAAR)
          </p>
        </header>

        {/* Certificate Body Text */}
        <div className="relative mt-10 text-center space-y-4">
          <p className="text-sm font-medium italic text-slate-600">This is to officially certify that</p>
          <h2 className="text-3xl font-extrabold text-gov-900 sm:text-4xl tracking-tight text-balance">
            {s.name}
          </h2>
          <p className="text-base font-medium text-slate-700 max-w-xl mx-auto leading-relaxed">
            {degree ? (
              <>
                has been duly awarded the degree of{" "}
                <strong className="font-bold text-gov-950 underline decoration-accent-500 underline-offset-4">
                  {s.degree}
                </strong>{" "}
                through <strong className="font-bold text-gov-950">{s.institution}</strong>, having fulfilled all statutory academic requirements.
              </>
            ) : (
              <>
                is bonafide registered and enrolled in{" "}
                <strong className="font-bold text-gov-950 underline decoration-accent-500 underline-offset-4">
                  {s.programme}
                </strong>
                , for the sanctioned academic session{" "}
                <strong className="font-bold text-gov-950">{s.academicYear}</strong>.
              </>
            )}
          </p>
        </div>

        {/* Verified Claims Grid & High-Density QR Code */}
        <div className="relative mt-12 grid grid-cols-1 items-end gap-8 border-t border-b border-slate-200 py-8 sm:grid-cols-[1fr_auto]">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">National APAAR ID</dt>
              <dd className="mt-0.5 font-mono text-sm font-bold text-gov-900">
                {s.apaarId ?? `${s.provisionalId} (Provisional)`}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Institution Student Roll</dt>
              <dd className="mt-0.5 font-mono text-sm font-bold text-gov-900">{s.studentId}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {degree ? "Awarded On" : "Date of Issuance"}
              </dt>
              <dd className="mt-0.5 font-medium text-gov-900">
                {degree ? s.awardedOn : new Date(vc.validFrom).toLocaleDateString()}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Issuer Authority DID</dt>
              <dd className="mt-0.5 break-all font-mono text-[11px] font-semibold text-slate-700">{vc.issuer.id}</dd>
            </div>
          </dl>

          {/* Offline-Verifiable High Density QR */}
          <figure className="flex flex-col items-center justify-center rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm text-center">
            <img
              src={qrSrc}
              alt="Offline Verifiable Credential QR Code containing Ed25519 digital signature"
              className="h-44 w-44 object-contain"
            />
            <figcaption className="mt-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Scan to Verify Offline · Level M
            </figcaption>
            <span className="text-[10px] font-mono text-slate-400">
              {cert.qr_payload_chars} bytes · Ed25519 Signed
            </span>
          </figure>
        </div>

        {/* Legal & Cryptographic Assurance Footer */}
        <footer className="relative mt-8 text-center text-[11px] font-medium text-slate-500 space-y-1.5 leading-normal">
          <div className="flex items-center justify-center gap-1.5 text-success font-semibold">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span>Cryptographically Secured by W3C Verifiable Credentials (eddsa-jcs-2022)</span>
          </div>
          <p>
            This document is issued under the authority of the AICTE National Trust Registry. Any alteration to the text or QR payload will cause instant cryptographic verification failure.
          </p>
        </footer>
      </article>
    </div>
  );
}
