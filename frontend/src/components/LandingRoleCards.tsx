import React from "react";
import { ArrowUpRight, FileText, Landmark, ShieldCheck, Users } from "lucide-react";

interface LandingRoleCardsProps {
  onOpenPortal: (group: 0 | 1 | 2) => void;
  onOpenStudentModal: () => void;
}

const ROLES = [
  {
    id: "institutions",
    title: "For Institutions",
    description: "Submit, validate and manage student records with ease.",
    icon: Landmark,
    handler: (props: LandingRoleCardsProps) => props.onOpenPortal(0),
    ariaLabel: "Access institution portal: submit and validate student admission records",
  },
  {
    id: "regulators",
    title: "For Regulators",
    description: "Monitor seat integrity and detect anomalies in real time.",
    icon: ShieldCheck,
    handler: (props: LandingRoleCardsProps) => props.onOpenPortal(1),
    ariaLabel: "Access regulator portal: monitor seat intake compliance across India",
  },
  {
    id: "verifiers",
    title: "For Verifiers",
    description: "Verify authentic academic credentials.",
    icon: FileText,
    handler: (props: LandingRoleCardsProps) => props.onOpenPortal(2),
    ariaLabel: "Access verifier portal: consent-based credential verification",
  },
  {
    id: "students",
    title: "For Students",
    description: "Share verified records with consent, anytime.",
    icon: Users,
    handler: (props: LandingRoleCardsProps) => props.onOpenStudentModal(),
    ariaLabel: "Open student passkey modal: view and share verified academic credentials",
  },
];

export default function LandingRoleCards({ onOpenPortal, onOpenStudentModal }: LandingRoleCardsProps) {
  const spot = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <section id="portals" className="relative z-20 mx-auto w-full max-w-[1440px] px-5 sm:px-8" aria-label="Portal access roles">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((role, idx) => {
          const Icon = role.icon;
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => role.handler({ onOpenPortal, onOpenStudentModal })}
              onMouseMove={spot}
              style={{ ["--d" as string]: `${400 + idx * 80}ms` }}
              className="glass spotlight rise group relative flex min-h-[148px] flex-col justify-between rounded-2xl p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:border-[#d4af37]/45 hover:shadow-[0_20px_40px_-15px_rgba(212,175,55,0.22)] focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
              aria-label={role.ariaLabel}
            >
              {/* Top row: Icon tile & Arrow button */}
              <div className="flex items-center justify-between">
                <span
                  className="grid h-11 w-11 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-[#d4af37] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] transition-all duration-300 group-hover:border-[#d4af37]/40 group-hover:bg-[#d4af37]/15 group-hover:text-[#f7e08a] group-hover:shadow-[0_8px_18px_-6px_rgba(212,175,55,0.4)]"
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" />
                </span>

                <span
                  className="grid h-8 w-8 place-items-center rounded-full border border-white/[0.09] bg-white/[0.02] text-[#b3b9c2] transition-all duration-300 group-hover:border-[#d4af37] group-hover:bg-[#d4af37] group-hover:text-[#0b0f14]"
                  aria-hidden="true"
                >
                  <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </div>

              {/* Bottom text: Title and Description */}
              <div className="mt-4">
                <h3 className="font-manrope text-[16px] font-bold tracking-tight text-[#f5f5f5] transition-colors group-hover:text-[#f7e08a]">
                  {role.title}
                </h3>
                <p className="mt-1 text-[13px] leading-snug text-[#b3b9c2]">
                  {role.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
