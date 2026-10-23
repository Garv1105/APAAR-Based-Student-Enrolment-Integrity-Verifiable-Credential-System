import { useEffect, useState } from "react";
import { ApiError, getJson, type S } from "../api/client";
import { Button, ErrorNote, Loading } from "../ui";

/** Printable certificate (Req 10): APAAR ID and student ID in full, plus the offline-verifiable QR. */
export default function Certificate({ id }: { id: string }) {
  const [cert, setCert] = useState<S["CertificateOut"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getJson<S["CertificateOut"]>(`/v1/credentials/certificate?id=${encodeURIComponent(id)}`)
      .then(setCert).catch((e) => setError(e instanceof ApiError ? e.text : "Cannot load certificate"));
  }, [id]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!cert) return <Loading />;
  const vc = cert.credential as { type: string[]; issuer: { name: string; id: string }; validFrom: string; credentialSubject: Record<string, string> };
  const s = vc.credentialSubject;
  const degree = vc.type.includes("DegreeCredential");
  // the SVG comes from our backend's QR generator; rendered as an image, never injected as HTML
  const qrSrc = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(cert.qr_svg)))}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button onClick={() => window.print()}>Print</Button>
        <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(cert.qr_payload)}>Copy QR text</Button>
        <Button variant="ghost" onClick={() => history.back()}>Back</Button>
      </div>
      <article className="mx-auto max-w-3xl rounded-2xl border-4 border-double border-brand-900 bg-white p-8 shadow-sm print:border-2 print:shadow-none">
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{degree ? "Degree certificate" : "Enrolment certificate"}</p>
          <h1 className="mt-2 text-2xl font-semibold text-brand-900">{vc.issuer.name}</h1>
        </header>
        <p className="mt-8 text-center text-slate-700">This is to certify that</p>
        <p className="mt-2 text-center text-3xl font-semibold">{s.name}</p>
        <p className="mt-4 text-center text-slate-700">
          {degree ? <>has been awarded the degree of <strong>{s.degree}</strong> through <strong>{s.institution}</strong></>
            : <>is enrolled in <strong>{s.programme}</strong>, academic year <strong>{s.academicYear}</strong></>}
        </p>
        <div className="mt-8 grid grid-cols-1 items-end gap-6 sm:grid-cols-[1fr_auto]">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-xs text-slate-500">APAAR ID</dt><dd className="font-mono text-base font-semibold">{s.apaarId ?? `${s.provisionalId} (provisional)`}</dd></div>
            <div><dt className="text-xs text-slate-500">Student ID</dt><dd className="font-mono text-base font-semibold">{s.studentId}</dd></div>
            <div><dt className="text-xs text-slate-500">{degree ? "Awarded on" : "Issued"}</dt><dd>{degree ? s.awardedOn : new Date(vc.validFrom).toLocaleDateString()}</dd></div>
            <div><dt className="text-xs text-slate-500">Issuer DID</dt><dd className="break-all font-mono text-xs">{vc.issuer.id}</dd></div>
          </dl>
          <figure className="text-center">
            <img src={qrSrc} alt="Verification QR code containing the signed credential" className="mx-auto h-44 w-44" />
            <figcaption className="mt-1 text-[10px] text-slate-500">Contains the signed credential · verify at /verify<br />{cert.qr_payload_chars} chars, EC level M</figcaption>
          </figure>
        </div>
        <footer className="mt-8 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-500">
          W3C Verifiable Credential (eddsa-jcs-2022) · issuer in the AICTE trust registry (MOCK) · verify the QR and check that the
          signed details it shows match this printout: an altered QR fails verification, and altered print won't match
        </footer>
      </article>
    </div>
  );
}
