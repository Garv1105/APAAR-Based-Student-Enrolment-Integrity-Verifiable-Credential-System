import { ArrowRight, Fingerprint } from "lucide-react";

const POINTS = [
  ["Validated row by row", "Checked against the APAAR registry (MOCK), with a row-level report."],
  ["Seats within intake", "Limits come only from the AICTE registry (MOCK)."],
  ["Shared with consent", "Students approve each request with a passkey."],
] as const;

const d = (ms: number) => ({ ["--d" as string]: `${ms}ms` });

export default function Hero({ onOpenStudentModal }: { onOpenStudentModal?: () => void }) {
  return (
    <section className="relative font-inter">
      {/* Eyebrow label */}
      <p
        className="rise inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b9c8ff] backdrop-blur"
        style={d(40)}
      >
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#8ea8ff]" aria-hidden />
        Student-level data · keyed by APAAR ID
      </p>

      {/* Display headline — Manrope, tight tracking, gradient on "India." */}
      <h1
        className="rise mt-7 font-manrope text-[52px] font-extrabold leading-[1.02] tracking-[-0.035em] text-white sm:text-[64px] xl:text-[68px]"
        style={d(110)}
      >
        Every seat
        <br />builds a
        <br />
        <span className="bg-gradient-to-r from-[#a9c0ff] via-[#7c9bff] to-[#a98bff] bg-clip-text pb-1 text-transparent">
          fairer India.
        </span>
      </h1>

      {/* Subtext — Inter 16px, lh 1.7 */}
      <p className="rise mt-6 text-[15.5px] leading-[1.75] text-[#a9b6d3]" style={d(190)}>
        Institutions submit student records keyed by APAAR ID. Every row is
        validated, every seat is checked against approved intake, and students
        share verifiable credentials only when they choose to.
      </p>

      {/* Feature list — Geist Mono gold section numbers */}
      <ol className="rise mt-8 space-y-5 border-t border-white/[0.08] pt-6" style={d(270)}>
        {POINTS.map(([t, body], i) => (
          <li key={t} className="flex gap-4">
            {/* Gold mono section number per spec: Geist Mono 13px, #d4af37, tracking 0.18em */}
            <span
              className="tnum mt-0.5 shrink-0 font-mono text-[13px] font-semibold tracking-[0.18em]"
              style={{ color: "#d4af37", minWidth: "1.75rem" }}
              aria-hidden
            >
              0{i + 1}
            </span>
            <span>
              <span className="block font-manrope text-[15px] font-bold tracking-[-0.01em] text-white">
                {t}
              </span>
              <span className="mt-0.5 block text-[13.5px] leading-relaxed text-[#8b9bbd]">
                {body}
              </span>
            </span>
          </li>
        ))}
      </ol>

      {/* Student / guardian passkey CTA card */}
      <button
        type="button"
        onClick={onOpenStudentModal}
        style={d(350)}
        className="rise group mt-8 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 pl-2.5 pr-5 text-left backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-[#7aa2ff]/45 hover:bg-white/[0.07] hover:shadow-[0_18px_40px_-20px_rgba(59,107,255,0.6)]"
      >
        <span
          className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#3b6bff]/35 to-[#7c5cff]/25 text-[#dbe4ff]"
          aria-hidden
        >
          <Fingerprint className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-[12px] font-medium text-[#8b9bbd]">Student or guardian?</span>
          <span className="block font-manrope text-[14.5px] font-semibold text-white">
            Sign in with a passkey
          </span>
        </span>
        <ArrowRight
          className="ml-2 h-4 w-4 text-[#8ea8ff] transition-transform duration-300 group-hover:translate-x-1"
          aria-hidden
        />
      </button>
    </section>
  );
}
