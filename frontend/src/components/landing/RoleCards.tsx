import { ArrowRight, FileCheck, Landmark, ShieldCheck, Users } from "lucide-react";
import { GOLD_TEXT, spotlight } from "./styles";

const ROLES = [
  { icon: Landmark, title: "For Institutions", body: "Submit, validate and manage student records. Universities award degree credentials.", href: "#/signin?as=institution" },
  { icon: ShieldCheck, title: "For Regulators", body: "Monitor seat integrity and review anomalies and duplicate cases in real time.", href: "#/signin?as=aicte" },
  { icon: FileCheck, title: "For Verifiers", body: "Verify academic credentials with the student's consent, after AICTE approval.", href: "#/request-access" },
  { icon: Users, title: "For Students", body: "See your record, approve each request and share verified credentials anytime.", href: "#/signin?as=student" },
] as const;

export default function RoleCards() {
  return (
    <section id="roles" aria-labelledby="roles-heading" className="scroll-mt-28">
      <h2 id="roles-heading" className="font-inter text-[28px] font-bold tracking-[-0.02em] text-white">One platform, <span className={GOLD_TEXT}>four roles</span></h2>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ROLES.map(({ icon: Icon, title, body, href }) => (
          <li key={title}>
            <a href={href} onMouseMove={spotlight} className="glass-premium lift relative group flex h-full items-start gap-4 rounded-2xl p-6">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-amber-300/20 to-amber-500/5 text-amber-300 ring-1 ring-amber-300/25 shadow-[0_0_24px_-8px_rgba(245,192,103,0.6)]" aria-hidden>
                <Icon className="h-5 w-5" strokeWidth={1.7} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-white">{title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-slate-400">{body}</span>
              </span>
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/20 text-white transition-colors group-hover:border-amber-400 group-hover:text-amber-400" aria-hidden>
                <ArrowRight className="h-3.5 w-3.5" /></span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-slate-400">
        New institution, university or verifier account? <a href="#/activate" className="font-semibold text-amber-300 underline decoration-amber-400/40 underline-offset-2 hover:text-amber-200">Activate it with your AICTE code</a>.
      </p>
    </section>
  );
}
