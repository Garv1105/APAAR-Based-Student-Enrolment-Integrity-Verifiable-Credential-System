import { useEffect, useId, useRef, useState } from "react";
import { Building2, Loader2, Search } from "lucide-react";
import { getJson, type S } from "../api/client";

export type Account = S["PublicAccount"];

const STYLE = {
  public: {
    input: "w-full rounded-2xl border border-white/[0.09] bg-black/25 py-3 pl-11 pr-10 text-[14.5px] text-white placeholder:text-[#6b7280] focus:border-[#d4af37]/60 focus:outline-none focus:ring-2 focus:ring-[#d4af37]/20",
    icon: "text-[#8a909a]",
    list: "border-white/[0.09] bg-[#11161d]/95 shadow-[0_30px_60px_-24px_rgba(0,0,0,0.9)] backdrop-blur-2xl",
    item: "text-white", active: "bg-white/[0.08]", meta: "text-[#a3a9b3]", empty: "text-[#a3a9b3]",
  },
  app: {
    input: "w-full rounded-lg border border-line bg-surface py-2.5 pl-10 pr-9 text-[14px] text-ink placeholder:text-slate-400 focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/20",
    icon: "text-slate-400",
    list: "border-line bg-raised shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)]",
    item: "text-ink", active: "bg-white/[0.06]", meta: "text-mute", empty: "text-mute",
  },
};

/** Registry search (ARIA combobox): institutions by name, AICTE id or city (optionally within a state), or universities.
 *  Backed by the public, throttled GET /v1/public/institutions; at most 8 suggestions. */
export default function AccountSearch({ kind, state, selected, onSelect, variant = "public", label, placeholder }: {
  kind: "institution" | "university"; state?: string; selected: Account | null; onSelect: (a: Account | null) => void;
  variant?: keyof typeof STYLE; label: string; placeholder?: string;
}) {
  const st = STYLE[variant];
  const id = useId();
  const [q, setQ] = useState(selected?.name ?? "");
  const [items, setItems] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (selected && q === selected.name) return;
    const term = q.trim();
    if (kind === "institution" && term.length < 2 && !state) { setItems([]); return; }
    const n = ++seq.current;
    const t = setTimeout(() => {
      const p = new URLSearchParams({ kind, limit: "8" });
      if (term.length >= 2) p.set("q", term);
      if (state) p.set("state", state);
      setBusy(true);
      getJson<Account[]>(`/v1/public/institutions?${p}`)
        .then((r) => { if (n === seq.current) { setItems(r); setActive(r.length ? 0 : -1); setError(null); } })
        .catch(() => { if (n === seq.current) setError("Search is unavailable right now. Try again in a moment."); })
        .finally(() => { if (n === seq.current) setBusy(false); });
    }, 200);
    return () => clearTimeout(t);
  }, [q, state, kind, selected]);

  const choose = (a: Account) => { onSelect(a); setQ(a.name); setOpen(false); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && open && active >= 0 && items[active]) { e.preventDefault(); choose(items[active]); }
    else if (e.key === "Escape") setOpen(false);
  };
  const showList = open && !selected && (items.length > 0 || (!busy && q.trim().length >= 2) || !!error);

  return (
    <div className="relative">
      <label htmlFor={`${id}-input`} className={variant === "public" ? "mb-1.5 block px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a3a9b3]" : "mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500"}>
        {label}
      </label>
      <div className="relative">
        <Search className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 ${st.icon} ${variant === "app" ? "left-3.5" : "left-4"}`} aria-hidden />
        <input id={`${id}-input`} role="combobox" aria-expanded={showList} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
          value={q} placeholder={placeholder} autoComplete="off" spellCheck={false}
          onChange={(e) => { setQ(e.target.value); setOpen(true); if (selected) onSelect(null); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onKeyDown={onKey}
          className={st.input} />
        {busy && <Loader2 className={`absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin ${st.icon}`} aria-hidden />}
      </div>
      {showList && (
        <ul id={`${id}-list`} role="listbox" aria-label={label}
          className={`absolute inset-x-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-2xl border p-1.5 ${st.list}`}>
          {error ? <li className={`px-3 py-3 text-[13px] ${st.empty}`}>{error}</li>
            : items.length === 0 ? <li className={`px-3 py-3 text-[13px] ${st.empty}`}>No match. Try a shorter name, the AICTE id or the city.</li>
            : items.map((a, i) => (
              <li key={a.id} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); choose(a); }} onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ${st.item} ${i === active ? st.active : ""}`}>
                <Building2 className={`mt-0.5 h-4 w-4 shrink-0 ${st.icon}`} aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium">{a.name}</span>
                  <span className={`block text-[12px] ${st.meta}`}>
                    {a.kind === "institution" ? <>{a.state} · <span className="font-mono">{a.id}</span></> : "University registrar"}
                  </span>
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
