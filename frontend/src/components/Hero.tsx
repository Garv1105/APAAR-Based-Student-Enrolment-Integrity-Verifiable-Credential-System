import { ArrowRight, Fingerprint } from "lucide-react";

const POINTS = [
  ["Validated row by row", "Every upload is checked against the APAAR registry (MOCK) and returns a row-level report."],
  ["Seats within intake", "Approved intake comes only from the AICTE registry (MOCK), never from what institutions upload."],
  ["Shared with consent", "Students approve each request with a passkey. Verifiers get a signed credential, nothing more."],
] as const;

export default function Hero({ onOpenStudentModal }: { onOpenStudentModal?: () => void }) {
  return (
    <section className="relative">
      <p className="rise text-[11.5px] font-medium uppercase tracking-[0.22em] text-[#8ea8ff]" style={{ ["--d" as string]: "60ms" }}>
        Student-level data · keyed by APAAR ID
      </p>

      <h1 className="rise mt-6 font-display text-[56px] font-normal leading-[0.98] tracking-[-0.015em] text-white sm:text-[72px] xl:text-[84px]"
        style={{ ["--d" as string]: "120ms" }}>
        Every seat builds<br />a <em className="italic text-[#b9c8ff]">fairer India.</em>
      </h1>

      <p className="rise mt-7 max-w-[34rem] text-[16.5px] leading-[1.65] text-[#a7b4d0]" style={{ ["--d" as string]: "200ms" }}>
        Institutions submit student records keyed by APAAR ID. Every row is validated, every seat is checked against approved intake,
        and students share verifiable credentials only when they choose to.
      </p>

      <ol className="rise mt-10 grid gap-6 border-t border-white/[0.08] pt-6 sm:grid-cols-3 sm:gap-5" style={{ ["--d" as string]: "280ms" }}>
        {POINTS.map(([t, d], i) => (
          <li key={t}>
            <span className="font-mono text-[11px] text-[#6f86c4]">0{i + 1}</span>
            <p className="mt-2 text-[14px] font-medium text-white">{t}</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#8b9bbd]">{d}</p>
          </li>
        ))}
      </ol>

      <button type="button" onClick={onOpenStudentModal}
        className="rise group mt-10 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.035] py-2 pl-2 pr-5 text-left backdrop-blur-md transition-colors duration-300 hover:border-[#7aa2ff]/40 hover:bg-white/[0.06]"
        style={{ ["--d" as string]: "360ms" }}>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[#3b6bff]/15 text-[#b9c8ff]" aria-hidden><Fingerprint className="h-4 w-4" /></span>
        <span className="text-[13.5px] text-[#c9d3ea]">Student or guardian? <span className="text-white">Sign in with a passkey</span></span>
        <ArrowRight className="h-4 w-4 text-[#8ea8ff] transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
      </button>
    </section>
  );
}
