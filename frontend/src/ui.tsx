import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, ArrowDownToLine, FileSpreadsheet, Inbox, ShieldAlert } from "lucide-react";
import { ApiError, download, loadSession } from "./api/client";
import { useMounted } from "./components/motion";

export const go = (path: string) => { window.location.hash = path; };

export const CATEGORY_LABEL: Record<string, string> = {
  REGULAR: "Regular (within approved intake)",
  SN_FN_OCI_CIWG: "Supernumerary FN / OCI / CIWG (15%)",
  "SN_FN_OCI_CIWG:CIWG": "of which CIWG (⅓ of supernumerary)",
};

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Counts up to a new value; jumps straight there when the user prefers reduced motion. */
export function AnimatedCounter({ value, duration = 0.6 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value || reducedMotion()) { setShown(value); return; }
    let start: number | null = null;
    let raf = 0;
    const step = (t: number) => {
      start ??= t;
      const p = Math.min((t - start) / (duration * 1000), 1);
      setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className="tabular-nums">{shown.toLocaleString()}</span>;
}

/** Fetch now and every `ms` while the tab is visible ("real-time" by polling). */
export function usePoll<T>(fetcher: () => Promise<T>, ms = 3000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const ref = useRef(fetcher);
  ref.current = fetcher;

  const refresh = useCallback(async () => {
    if (!loadSession()) return;
    try {
      setData(await ref.current());
      setError(null);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e instanceof ApiError ? e.text : "Cannot reach the API. Is the backend running on :8000?");
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => document.visibilityState === "visible" && refresh(), ms);
    return () => clearInterval(id);
  }, [refresh, ms]);

  return { data, error, updatedAt, refresh };
}

/** Page heading: small gold eyebrow, serif title, muted meta line, actions on the right. */
export function PageHeader({ eyebrow, title, meta, actions }: { eyebrow?: ReactNode; title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="rise flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">{eyebrow}</p>}
        <h1 className="mt-2.5 font-display text-[40px] font-normal leading-[1.02] tracking-[-0.01em] text-ink sm:text-[52px]">{title}</h1>
        {meta && <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-mute">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Moves the card's spotlight to the pointer (CSS reads --mx/--my). */
const spot = (e: React.MouseEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
};

/** Glass card. `delay` (ms) staggers its entrance on first render. */
export function Card({ title, actions, children, className = "", id, icon, bodyClassName = "p-5", delay = 0 }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string; icon?: ReactNode; bodyClassName?: string; delay?: number;
}) {
  return (
    <section id={id} onMouseMove={spot} style={{ ["--d" as string]: `${delay}ms` }}
      className={`glass spotlight rise min-w-0 scroll-mt-28 rounded-2xl ${className}`}>
      {(title || actions) && (
        <header className="relative flex flex-wrap items-center justify-between gap-3 px-5 pt-[18px] pb-3">
          <h2 className="flex items-center gap-2 text-[13.5px] font-medium tracking-[-0.005em] text-ink">
            {icon && <span className="text-gold [&>svg]:h-4 [&>svg]:w-4" aria-hidden>{icon}</span>}
            {title}
          </h2>
          {actions && <div className="flex flex-wrap items-center gap-2 text-xs text-mute">{actions}</div>}
        </header>
      )}
      <div className={`relative ${bodyClassName}`}>{children}</div>
    </section>
  );
}

const TONES = {
  neutral: "bg-slate-100 text-slate-600 border-slate-200",
  error: "bg-critical-bg text-critical-text border-critical-border",
  warning: "bg-warning-bg text-warning-text border-warning-border",
  flag: "bg-flag-bg text-flag-text border-flag-border",
  ok: "bg-success-bg text-success-text border-success-border",
  brand: "bg-accent-50 text-accent-800 border-accent-300",
} as const;
export type Tone = keyof typeof TONES;
const DOT = { neutral: "bg-slate-400", error: "bg-critical", warning: "bg-warning", flag: "bg-flag", ok: "bg-success", brand: "bg-gold" } as const;
export const TONE_TEXT = { neutral: "text-ink", error: "text-critical-text", warning: "text-warning-text", flag: "text-flag-text", ok: "text-success-text", brand: "text-champagne" } as const;

export function Badge({ tone = "neutral", children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** KPI tile: label, large number, optional visual (ring, spark bars) on the right and a quiet footnote. */
export function Stat({ label, value, tone = "neutral", hint, icon, visual, delay = 0 }: {
  label: string; value: ReactNode; tone?: Tone; hint?: ReactNode; icon?: ReactNode; visual?: ReactNode; delay?: number;
}) {
  return (
    <div onMouseMove={spot} style={{ ["--d" as string]: `${delay}ms` }}
      className="glass spotlight rise flex min-w-0 items-center justify-between gap-4 rounded-2xl p-5 transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-white/[0.11]">
      <div className="relative min-w-0">
        <div className="flex items-center gap-2 text-[12px] font-medium text-mute">
          {icon && <span className={`grid h-7 w-7 place-items-center rounded-lg bg-white/[0.04] ring-1 ring-white/[0.05] [&>svg]:h-3.5 [&>svg]:w-3.5 ${tone === "neutral" ? "text-gold" : TONE_TEXT[tone]}`} aria-hidden>{icon}</span>}
          {label}
        </div>
        <div className={`mt-3.5 text-[34px] font-medium leading-none tracking-[-0.03em] tabular-nums ${TONE_TEXT[tone]}`}>
          {typeof value === "number" ? <AnimatedCounter value={value} /> : value}
        </div>
        {hint && <div className="mt-2 text-xs text-mute">{hint}</div>}
      </div>
      {visual && <div className="relative shrink-0">{visual}</div>}
    </div>
  );
}

/** Radial progress (0..1). Gold by default; pass a status colour for semantic use. */
export function Ring({ value, size = 64, stroke = 5, color = "var(--color-gold)", children, label }: {
  value: number; size?: number; stroke?: number; color?: string; children?: ReactNode; label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = useMounted() ? Math.max(0, Math.min(1, value)) : 0; // fill in from zero on first paint
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: "stroke-dashoffset 1100ms cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  );
}

/** Thin horizontal meter (0..1). */
export function Meter({ value, color = "bg-gold", className = "", label }: { value: number; color?: string; className?: string; label?: string }) {
  const shown = useMounted() ? value : 0;
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-white/[0.06] ${className}`} role={label ? "meter" : undefined}
      aria-label={label} aria-valuemin={label ? 0 : undefined} aria-valuemax={label ? 100 : undefined} aria-valuenow={label ? Math.round(value * 100) : undefined}>
      <div className={`h-full rounded-full ${color} transition-[width] duration-1000 ease-out`} style={{ width: `${Math.max(0, Math.min(1, shown)) * 100}%` }} />
    </div>
  );
}

/** Tiny bar sparkline for a short series of real values (e.g. per-batch counts). */
export function SparkBars({ values, color = "var(--color-gold)", label }: { values: number[]; color?: string; label: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const w = 6, gap = 3, h = 36;
  return (
    <svg width={values.length * (w + gap) - gap} height={h} role="img" aria-label={label}>
      {values.map((v, i) => {
        const bh = Math.max(2, (v / max) * h);
        return <rect key={i} x={i * (w + gap)} y={h - bh} width={w} height={bh} rx={1.5} fill={color} opacity={0.35 + 0.65 * ((i + 1) / values.length)} />;
      })}
    </svg>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-critical-border bg-critical-bg px-4 py-3 text-sm text-critical-text">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <Inbox className="h-5 w-5 text-slate-400" aria-hidden />
      <p className="max-w-sm text-sm text-mute">{children}</p>
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-4" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="h-10 w-72 max-w-full animate-pulse rounded-lg bg-slate-100" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-50 ring-1 ring-line" />)}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-slate-50 ring-1 ring-line" />
    </div>
  );
}

export function Button({ variant = "primary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const v = {
    primary: "bg-gold text-[#14110a] hover:bg-[#e0bd4a] disabled:bg-slate-200 disabled:text-slate-500",
    secondary: "border border-slate-300 bg-transparent text-slate-800 hover:border-accent-400 hover:text-ink disabled:text-slate-400",
    ghost: "text-accent-700 hover:bg-accent-50 hover:text-accent-900 disabled:text-slate-400",
    danger: "border border-critical-border bg-critical-bg text-critical-text hover:bg-critical/20 disabled:opacity-50",
  }[variant];
  return (
    <button {...p}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors duration-150 disabled:cursor-not-allowed ${v} ${className}`} />
  );
}

export const SEVERITY_TONE: Record<string, Tone> = { error: "error", warning: "warning", flag: "flag" };

export function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Live polling indicator. Shows the time of the last successful refresh. */
export function Updated({ at }: { at: Date | null }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1 text-[11px] text-mute backdrop-blur" aria-live="polite">
      <span className={`h-1.5 w-1.5 rounded-full ${at ? "live-dot bg-success" : "bg-slate-400"}`} aria-hidden />
      {at ? <>Live · <span className="tabular-nums">{at.toLocaleTimeString()}</span></> : "Connecting…"}
    </span>
  );
}

/** Req 9 report downloads. `institutions` (AICTE view) enables the per-institution accreditation pack picker. */
export function ReportsCard({ institutions, id }: { institutions?: { id: string; name: string }[]; id?: string }) {
  const [inst, setInst] = useState(institutions?.[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const get = async (kind: string, params = "") => {
    setError(null);
    try { await download(`/v1/reports/${kind}.csv${params}`, `${kind}.csv`); } catch (e) { setError(e instanceof ApiError ? e.text : "Download failed"); }
  };
  const item = (label: string, onClick: () => void, icon = <ArrowDownToLine className="h-3.5 w-3.5" />) => (
    <Button variant="secondary" onClick={onClick}>{icon}{label}</Button>
  );
  return (
    <Card id={id} title="Reports" icon={<FileSpreadsheet />} actions={<span>CSV · aggregates only · formula-safe · every export is audited</span>}>
      <div className="flex flex-wrap items-center gap-2">
        {institutions ? (<>
          {item("State summary", () => get("state-summary"))}
          {item("Category-quota utilisation", () => get("category-utilisation"))}
          {item("Excess-admission case file", () => get("excess-case-file"), <ShieldAlert className="h-3.5 w-3.5 text-critical-text" />)}
          <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
          <label htmlFor="inst-select" className="sr-only">Institution</label>
          <select id="inst-select" value={inst} onChange={(e) => setInst(e.target.value)}
            className="rounded-lg border border-slate-300 bg-surface px-3 py-2 text-[13px] text-ink focus:border-gold focus:outline-none">
            {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <Button disabled={!inst} onClick={() => get("accreditation", `?institution_id=${encodeURIComponent(inst)}`)}>
            <ArrowDownToLine className="h-3.5 w-3.5" />Accreditation pack
          </Button>
        </>) : (<>
          {item("Accreditation pack", () => get("accreditation"))}
          {item("Category-quota utilisation", () => get("category-utilisation"))}
        </>)}
      </div>
      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
    </Card>
  );
}

/** Data table: quiet uppercase header, hairline rows, horizontal scroll on narrow screens. */
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="min-w-full text-[13px]">
        <thead>
          <tr className="border-y border-line text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            {head.map((h, i) => <th key={i} scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold first:pl-5 last:pr-5">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "", wrap = false }: { children: ReactNode; className?: string; wrap?: boolean }) {
  return <td className={`${wrap ? "whitespace-normal" : "whitespace-nowrap"} px-4 py-3 text-slate-700 first:pl-5 last:pr-5 ${className}`}>{children}</td>;
}
