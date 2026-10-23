import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, ArrowDownToLine, CheckCircle2, Clock, FileSpreadsheet, ShieldAlert } from "lucide-react";
import { ApiError, download, loadSession } from "./api/client";

export const go = (path: string) => { window.location.hash = path; };

export const CATEGORY_LABEL: Record<string, string> = {
  REGULAR: "Regular (within approved intake)",
  SN_FN_OCI_CIWG: "Supernumerary FN / OCI / CIWG (15%)",
  "SN_FN_OCI_CIWG:CIWG": "of which CIWG (⅓ of supernumerary)",
};

/** Smooth animated counter for numerical KPI values */
export function AnimatedCounter({ value, duration = 0.5 }: { value: number; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValue = useRef(value);

  useEffect(() => {
    let startTime: number | null = null;
    const startVal = prevValue.current;
    const endVal = value;
    prevValue.current = value;

    if (startVal === endVal) {
      setDisplayValue(endVal);
      return;
    }

    let animationFrameId: number;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (endVal - startVal) * ease);
      setDisplayValue(current);
      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      }
    };
    animationFrameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrameId);
  }, [value, duration]);

  return <span className="tabular-nums font-bold">{displayValue.toLocaleString()}</span>;
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

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-slate-200/90 bg-white shadow-premium transition-all duration-200 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-6 py-4 rounded-t-2xl">
          <div className="text-sm font-bold tracking-tight text-gov-900">{title}</div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-6">{children}</div>
    </section>
  );
}

const TONES = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  error: "bg-critical-bg text-critical-text border-critical-border",
  warning: "bg-warning-bg text-warning-text border-warning-border",
  flag: "bg-flag-bg text-flag-text border-flag-border",
  ok: "bg-success-bg text-success-text border-success-border",
  brand: "bg-accent-50 text-accent-700 border-accent-200",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${TONES[tone]}`}>
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            tone === "ok" ? "bg-success" : tone === "error" ? "bg-critical" : tone === "warning" ? "bg-warning" : tone === "flag" ? "bg-flag" : "bg-slate-400"
          }`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  tone = "neutral",
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  hint?: string;
  icon?: ReactNode;
}) {
  const isNumber = typeof value === "number";
  const colorMap = {
    neutral: "text-gov-900",
    error: "text-critical",
    warning: "text-warning",
    flag: "text-flag",
    ok: "text-success",
    brand: "text-accent-600",
  };

  const iconBgMap = {
    neutral: "bg-slate-100 text-slate-600",
    error: "bg-critical-bg text-critical",
    warning: "bg-warning-bg text-warning",
    flag: "bg-flag-bg text-flag",
    ok: "bg-success-bg text-success",
    brand: "bg-accent-50 text-accent-600",
  };

  return (
    <div
      className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-premium transition-all duration-200 hover:border-slate-300 hover:shadow-premium-hover"
      title={hint}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        {icon && <div className={`grid h-8 w-8 place-items-center rounded-xl p-1.5 ${iconBgMap[tone]}`}>{icon}</div>}
      </div>
      <div className="mt-3">
        <div className={`text-2xl font-bold tracking-tight ${colorMap[tone]}`}>
          {isNumber ? <AnimatedCounter value={value} /> : value}
        </div>
        {hint && (
          <div className="mt-1 flex items-center gap-1 text-xs text-slate-500 font-medium">
            <span>{hint}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-critical-border bg-critical-bg p-4 text-sm text-critical-text">
      <AlertCircle className="h-5 w-5 shrink-0 text-critical mt-0.5" aria-hidden="true" />
      <div className="font-medium">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="rounded-full bg-slate-100 p-3 text-slate-400 mb-2">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-slate-500 max-w-sm">{children}</p>
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-3 border-accent-600 border-t-transparent" />
      <p className="mt-3 text-xs font-medium text-slate-500 tracking-wide uppercase">Loading official data…</p>
    </div>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const v = {
    primary: "bg-accent-600 text-white hover:bg-accent-700 active:bg-accent-800 shadow-sm hover:shadow disabled:bg-slate-300 disabled:shadow-none",
    secondary: "border border-slate-300/90 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-xs disabled:text-slate-400 disabled:border-slate-200",
    ghost: "text-accent-600 hover:bg-accent-50 active:bg-accent-100 disabled:text-slate-400",
    danger: "bg-critical text-white hover:bg-critical-hover shadow-sm disabled:bg-slate-300",
  }[variant];

  return (
    <button
      {...p}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 cursor-pointer ${v} ${className}`}
    />
  );
}

export const SEVERITY_TONE: Record<string, Tone> = { error: "error", warning: "warning", flag: "flag" };

export function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function Updated({ at }: { at: Date | null }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-xs" aria-live="polite">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
      </span>
      <span>{at ? `Live sync · ${at.toLocaleTimeString()}` : "Connecting…"}</span>
    </div>
  );
}

/** Req 9 report downloads. */
export function ReportsCard({ institutions }: { institutions?: { id: string; name: string }[] }) {
  const [inst, setInst] = useState(institutions?.[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const get = async (kind: string, params = "") => {
    setError(null);
    try {
      await download(`/v1/reports/${kind}.csv${params}`, `${kind}.csv`);
    } catch (e) {
      setError(e instanceof ApiError ? e.text : "Download failed");
    }
  };

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-accent-600" />
          <span>Statutory Compliance Reports (CSV)</span>
        </div>
      }
      actions={<span className="text-xs text-slate-500 font-medium">Immutable audit export · Formula injection safe</span>}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        {institutions ? (
          <>
            <Button variant="secondary" onClick={() => get("state-summary")}>
              <ArrowDownToLine className="h-3.5 w-3.5" />
              <span>State summary</span>
            </Button>
            <Button variant="secondary" onClick={() => get("category-utilisation")}>
              <ArrowDownToLine className="h-3.5 w-3.5" />
              <span>Category quota utilisation</span>
            </Button>
            <Button variant="secondary" onClick={() => get("excess-case-file")}>
              <ShieldAlert className="h-3.5 w-3.5 text-critical" />
              <span>Excess admission case file</span>
            </Button>
            <span className="mx-2 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
            <div className="flex items-center gap-2">
              <label htmlFor="inst-select" className="sr-only">Institution</label>
              <select
                id="inst-select"
                value={inst}
                onChange={(e) => setInst(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-gov-900 shadow-xs focus:border-accent-600 focus:ring-1 focus:ring-accent-600"
              >
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
              <Button variant="primary" disabled={!inst} onClick={() => get("accreditation", `?institution_id=${encodeURIComponent(inst)}`)}>
                <ArrowDownToLine className="h-3.5 w-3.5" />
                <span>Accreditation pack</span>
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => get("accreditation")}>
              <ArrowDownToLine className="h-3.5 w-3.5" />
              <span>Accreditation pack</span>
            </Button>
            <Button variant="secondary" onClick={() => get("category-utilisation")}>
              <ArrowDownToLine className="h-3.5 w-3.5" />
              <span>Category quota utilisation</span>
            </Button>
          </>
        )}
      </div>
      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </Card>
  );
}

/** Structured data table with responsive horizontal scroll and modern GovTech styling. */
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-6 -my-2 overflow-x-auto">
      <div className="inline-block min-w-full align-middle">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="bg-slate-50/70 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {head.map((h, i) => (
                <th key={i} scope="col" className="whitespace-nowrap px-6 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Td({ children, className = "", wrap = false }: { children: ReactNode; className?: string; wrap?: boolean }) {
  return (
    <td className={`${wrap ? "whitespace-normal" : "whitespace-nowrap"} px-6 py-3.5 text-slate-700 font-medium ${className}`}>
      {children}
    </td>
  );
}
