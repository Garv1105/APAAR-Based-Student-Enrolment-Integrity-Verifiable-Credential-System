import React, { useEffect, useRef, useState } from "react";
import { Award, Landmark, ShieldCheck, Users } from "lucide-react";
import { useReducedMotion } from "./motion";

export const LANDING_STATS = [
  {
    id: "institutions",
    numeric: 6200,
    prefix: "",
    suffix: "+",
    label: "Institutions Onboarded",
    icon: Landmark,
  },
  {
    id: "students",
    numeric: 1.8,
    isFloat: true,
    prefix: "",
    suffix: " Cr+",
    label: "Student Records Verified",
    icon: Users,
  },
  {
    id: "states",
    numeric: 36,
    prefix: "",
    suffix: "",
    label: "States & UTs Connected",
    icon: ShieldCheck,
  },
  {
    id: "compliance",
    numeric: 100,
    prefix: "",
    suffix: "%",
    label: "AICTE Graduate Attribute Compliance (Target)",
    icon: Award,
  },
] as const;

export default function LandingImpactBand() {
  const [inView, setInView] = useState(false);
  const bandRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!bandRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(bandRef.current);
    return () => observer.disconnect();
  }, []);

  const spot = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <section id="impact" className="relative z-10 mx-auto w-full max-w-[1440px] px-5 py-16 sm:px-8 sm:py-24">
      {/* Overline with gold rule */}
      <div className="flex flex-col items-center justify-center text-center">
        <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.2em] text-[#d4af37]">
          EMPOWERING INDIA'S EDUCATION ECOSYSTEM
        </p>
        <div className="gold-rule mt-3 w-32" aria-hidden="true" />
      </div>

      {/* Main Glass Stats Band */}
      <div
        ref={bandRef}
        onMouseMove={spot}
        className="glass spotlight rise mt-10 grid grid-cols-1 divide-y divide-[#222c37] rounded-2xl border border-white/[0.08] bg-[#0c1219]/60 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.85)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4"
      >
        {LANDING_STATS.map((stat) => (
          <div key={stat.id} className="flex flex-col justify-between p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.03] text-[#d4af37]">
                <stat.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="font-inter text-[12px] font-semibold uppercase tracking-[0.14em] text-[#b3b9c2]">
                {stat.label}
              </p>
            </div>

            <div className="mt-5">
              <div className="font-manrope text-[40px] font-bold leading-none tracking-[-0.04em] text-[#f5f5f5] tnum sm:text-[46px] lg:text-[48px]">
                <StatCounter
                  target={stat.numeric}
                  isFloat={"isFloat" in stat && Boolean(stat.isFloat)}
                  prefix={stat.prefix}
                  suffix={stat.suffix}
                  animate={inView && !reduce}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Synthetic data note */}
      <p className="mt-4 text-center font-inter text-[11.5px] text-[#b3b9c2]/60">
        Illustrative figures · prototype · synthetic data
      </p>
    </section>
  );
}

function StatCounter({
  target,
  isFloat = false,
  prefix = "",
  suffix = "",
  animate,
}: {
  target: number;
  isFloat?: boolean;
  prefix?: string;
  suffix?: string;
  animate: boolean;
}) {
  const [value, setValue] = useState(animate ? 0 : target);

  useEffect(() => {
    if (!animate) {
      setValue(target);
      return;
    }
    let startTime: number | null = null;
    const duration = 1200; // ms
    let raf = 0;

    const step = (now: number) => {
      startTime ??= now;
      const progress = Math.min((now - startTime) / duration, 1);
      // easeOutExpo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setValue(target * ease);
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [animate, target]);

  return (
    <span>
      {prefix}
      {isFloat
        ? value.toFixed(1)
        : Math.round(value).toLocaleString()}
      {suffix}
    </span>
  );
}
