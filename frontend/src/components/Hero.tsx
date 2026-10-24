import { ArrowRight, Fingerprint } from "lucide-react";

const POINTS = [
  ["Validated row by row", "Every record is checked against the APAAR registry, with a row-level report back to the institution."],
  ["Seats within approved intake", "Limits come only from AICTE approvals, never from what an institution declares."],
  ["Shared only with consent", "Students approve each verification request with a passkey."],
] as const;

const d = (ms: number) => ({ ["--d" as string]: `${ms}ms` });

export default function Hero() {
  return (
    <section className="relative font-inter">
      <p className="rise inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11.5px] font-medium tracking-[0.08em] text-[#b9c8ff] backdrop-blur" style={d(40)}>
        <span className="h-1 w-1 rounded-full bg-[#8ea8ff]" aria-hidden />
        STUDENT-LEVEL DATA · KEYED BY APAAR ID
      </p>

      <h1 className="rise mt-7 font-manrope text-[48px] font-extrabold leading-[1.0] tracking-[-0.04em] text-white sm:text-[60px] xl:text-[64px]" style={d(110)}>
        Every seat<br />builds a{" "}
        <span className="bg-gradient-to-r from-[#a9c0ff] via-[#7c9bff] to-[#a98bff] bg-clip-text pb-1 text-transparent">fairer India.</span>
      </h1>

      <p className="rise mt-6 max-w-[560px] text-[16px] leading-[1.7] text-[#a9b6d3]" style={d(190)}>
        Institutions submit student records keyed by APAAR ID. Every row is validated, every seat is checked against approved intake,
        and students share verifiable credentials only when they choose to.
      </p>

      <ol className="rise mt-8 max-w-[560px] space-y-4 border-t border-white/[0.08] pt-6" style={d(270)}>
        {POINTS.map(([t, body], i) => (
          <li key={t} className="flex gap-4">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] font-manrope text-[11.5px] font-bold text-[#9db4ff]">0{i + 1}</span>
            <span>
              <span className="block font-manrope text-[15px] font-bold tracking-[-0.01em] text-white">{t}</span>
              <span className="mt-0.5 block text-[13.5px] leading-relaxed text-[#8b9bbd]">{body}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="rise mt-8 flex flex-wrap items-center gap-3" style={d(350)}>
        <a href="#/signin"
          className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#3b6bff] via-[#4f63ff] to-[#6f5cff] px-6 py-3.5 font-manrope text-[15px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_16px_36px_-14px_rgba(59,107,255,0.9)] transition-transform duration-300 hover:-translate-y-0.5">
          Sign in <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
        </a>
        <a href="#/signin?as=student"
          className="group inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 pl-2.5 pr-5 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-[#7aa2ff]/45 hover:bg-white/[0.07]">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#3b6bff]/35 to-[#7c5cff]/25 text-[#dbe4ff]" aria-hidden><Fingerprint className="h-4 w-4" /></span>
          <span>
            <span className="block text-[12px] text-[#8b9bbd]">Student or guardian?</span>
            <span className="block font-manrope text-[14px] font-semibold text-white">Sign in with a passkey</span>
          </span>
        </a>
      </div>
    </section>
  );
}
