import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Printer } from "lucide-react";
import { ApiError, getJson, type S } from "../api/client";
import { Button, ErrorNote, Loading } from "../ui";

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
  const vc = cert.credential as { type: string[]; issuer: { name: string; id: string }; validFrom: string; credentialSubject: Record<string, string> };
  const s = vc.credentialSubject;
  const degree = vc.type.includes("DegreeCredential");
  const qrSrc = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(cert.qr_svg)))}`;

  const copyPayload = async () => {
    try { await navigator.clipboard.writeText(cert.qr_payload); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { }
  };

  const field = (label: string, value: React.ReactNode, mono = false) => (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a7a55]">{label}</dt>
      <dd className={`mt-1 text-[#1c1a16] ${mono ? "font-mono text-[15px] font-semibold tracking-wide" : "text-sm font-medium"}`}>{value}</dd>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => history.back()}><ArrowLeft className="h-4 w-4" aria-hidden />Back</Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={copyPayload}><Copy className="h-4 w-4" aria-hidden /><span aria-live="polite">{copied ? "QR text copied" : "Copy QR text"}</span></Button>
          <Button onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />Print</Button>
        </div>
      </div>

      <article className="relative rounded-sm bg-[#fbf8f0] p-3 text-[#1c1a16] shadow-premium-lg print:p-0 print:shadow-none">
        <div className="border border-[#b8963a] p-1.5">
          <div className="border-[3px] border-double border-[#b8963a]/70 px-6 py-10 sm:px-14 sm:py-14">
            <header className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-[#8a7a55]">{degree ? "Degree certificate" : "Enrolment certificate"}</p>
              <h1 className="mt-4 font-display text-[34px] leading-tight text-[#1c1a16] sm:text-[40px]">{vc.issuer.name}</h1>
              <div className="mx-auto mt-5 flex w-48 items-center gap-3" aria-hidden>
                <span className="h-px flex-1 bg-[#b8963a]/60" /><span className="h-1.5 w-1.5 rotate-45 bg-[#b8963a]" /><span className="h-px flex-1 bg-[#b8963a]/60" />
              </div>
            </header>

            <div className="mt-8 text-center">
              <p className="font-display text-lg italic text-[#5c5240]">This is to certify that</p>
              <p className="mt-3 font-display text-[40px] leading-tight text-[#1c1a16] sm:text-[48px]">{s.name}</p>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-[#3d372b]">
                {degree
                  ? <>has been awarded the degree of <strong className="font-semibold">{s.degree}</strong> through <strong className="font-semibold">{s.institution}</strong>.</>
                  : <>is enrolled in <strong className="font-semibold">{s.programme}</strong>, academic year <strong className="font-semibold">{s.academicYear}</strong>.</>}
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 items-end gap-8 border-t border-[#b8963a]/40 pt-8 sm:grid-cols-[1fr_auto]">
              <dl className="grid grid-cols-2 gap-x-8 gap-y-5">
                {field("APAAR ID", s.apaarId ?? `${s.provisionalId} (provisional)`, true)}
                {field("Student ID", s.studentId, true)}
                {field(degree ? "Awarded on" : "Issued", degree ? s.awardedOn : new Date(vc.validFrom).toLocaleDateString())}
                {field("Issuer DID", <span className="break-all font-mono text-[11px]">{vc.issuer.id}</span>)}
              </dl>
              <figure className="text-center">
                <div className="inline-block border border-[#b8963a]/50 bg-white p-2"><img src={qrSrc} alt="Verification QR code containing the signed credential" className="h-40 w-40" /></div>
                <figcaption className="mt-2 text-[10px] leading-snug text-[#6b6150]">Contains the signed credential · verify at /verify<br />{cert.qr_payload_chars} chars · EC level M</figcaption>
              </figure>
            </div>

            <footer className="mt-10 space-y-1 text-center text-[10px] leading-relaxed text-[#6b6150]">
              <p>W3C Verifiable Credential (eddsa-jcs-2022) · issuer listed in the AICTE trust registry (MOCK).</p>
              <p>Verify the QR and check that the signed details it shows match this printout: an altered QR fails verification, and altered print won't match.</p>
              <p className="pt-1 font-semibold uppercase tracking-[0.2em] text-[#8a7a55]">Prototype · synthetic data</p>
            </footer>
          </div>
        </div>
      </article>
    </div>
  );
}
