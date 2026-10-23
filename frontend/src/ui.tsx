import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "./api/client";

export const go = (path: string) => { window.location.hash = path; };

export const CATEGORY_LABEL: Record<string, string> = {
  REGULAR: "Regular (within approved intake)",
  SN_FN_OCI_CIWG: "Supernumerary FN / OCI / CIWG (15%)",
  "SN_FN_OCI_CIWG:CIWG": "of which CIWG (⅓ of supernumerary)",
};

/** Fetch now and every `ms` while the tab is visible ("real-time" by polling; SSE is a later upgrade). */
export function usePoll<T>(fetcher: () => Promise<T>, ms = 3000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const ref = useRef(fetcher);
  ref.current = fetcher;

  const refresh = useCallback(async () => {
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

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const TONES = {
  neutral: "bg-slate-100 text-slate-700",
  error: "bg-err-bg text-err",
  warning: "bg-warn-bg text-warn",
  flag: "bg-flag-bg text-flag",
  ok: "bg-ok-bg text-ok",
  brand: "bg-brand-50 text-brand-700",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export function Stat({ label, value, tone = "neutral", hint }: { label: string; value: ReactNode; tone?: Tone; hint?: string }) {
  const color = { neutral: "text-slate-900", error: "text-err", warning: "text-warn", flag: "text-flag", ok: "text-ok", brand: "text-brand-700" }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" title={hint}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div role="alert" className="rounded-lg border border-err/20 bg-err-bg px-4 py-3 text-sm text-err">{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}

export function Loading() {
  return <p className="py-6 text-center text-sm text-slate-500" aria-live="polite">Loading…</p>;
}

export function Button({ variant = "primary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const v = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-300",
    secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400",
    ghost: "text-brand-700 hover:bg-brand-50",
  }[variant];
  return <button {...p} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${v} ${className}`} />;
}

export const SEVERITY_TONE: Record<string, Tone> = { error: "error", warning: "warning", flag: "flag" };

export function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function Updated({ at }: { at: Date | null }) {
  return <span className="text-xs text-slate-500" aria-live="polite">{at ? `Live · updated ${at.toLocaleTimeString()}` : ""}</span>;
}

/** Column header + rows with consistent styling; horizontal scroll on narrow screens. */
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            {head.map((h, i) => <th key={i} scope="col" className="whitespace-nowrap px-5 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "", wrap = false }: { children: ReactNode; className?: string; wrap?: boolean }) {
  return <td className={`${wrap ? "whitespace-normal" : "whitespace-nowrap"} px-5 py-2.5 ${className}`}>{children}</td>;
}
