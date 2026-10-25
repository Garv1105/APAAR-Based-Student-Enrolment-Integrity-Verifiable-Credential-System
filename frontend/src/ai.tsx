// Advisory plain-language summaries (Gemini free tier via backend/app/ai.py; rule-based fallback). Never decides anything.
import { useState } from "react";
import { ClipboardCopy, Download, FileText, Sparkles, Wand2 } from "lucide-react";
import { ApiError, sendJson, type S } from "./api/client";
import { Button, ErrorNote } from "./ui";

/** Languages the AI summaries and upload messages support, each named in its own script. */
export const LANGUAGES: [string, string][] = [
  ["en", "English"], ["hi", "हिन्दी"], ["bn", "বাংলা"], ["mr", "मराठी"], ["te", "తెలుగు"], ["ta", "தமிழ்"], ["gu", "ગુજરાતી"],
  ["kn", "ಕನ್ನಡ"], ["ml", "മലയാളം"], ["or", "ଓଡ଼ିଆ"], ["pa", "ਪੰਜਾਬੀ"], ["as", "অসমীয়া"], ["ur", "اردو"],
];
const LANG_KEY = "vp.lang";
/** Language choice, remembered in this browser only (a convenience; works without storage). */
export function useLang(): [string, (l: string) => void] {
  const [lang, setLang] = useState(() => { try { return localStorage.getItem(LANG_KEY) || "en"; } catch { return "en"; } });
  return [lang, (l: string) => { setLang(l); try { localStorage.setItem(LANG_KEY, l); } catch { /* storage blocked */ } }];
}
export function LangSelect({ value, onChange, label = "Language" }: { value: string; onChange: (l: string) => void; label?: string }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-500">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
        className="rounded-lg border border-slate-300 bg-surface px-2 py-1 text-[13px] text-ink focus:border-gold focus:outline-none">
        {LANGUAGES.map(([k, n]) => <option key={k} value={k} lang={k}>{n}</option>)}
      </select>
    </label>
  );
}
const withLang = (path: string, lang: string) => `${path}${path.includes("?") ? "&" : "?"}lang=${lang}`;

export function AiBox({ path, cta, title }: { path: string; cta: string; title: string }) {
  const [out, setOut] = useState<S["AiSummary"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useLang();

  async function run() {
    setBusy(true);
    setError(null);
    try { setOut(await sendJson<S["AiSummary"]>(withLang(path, lang), "POST")); }
    catch (e) { setError(e instanceof ApiError ? (e.status === 429 ? "Too many requests. Try again in a minute." : e.text) : "The service is unreachable."); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl border border-gold/25 bg-gold/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-display text-[16px] font-bold text-ink"><Sparkles className="h-4 w-4 text-gold" aria-hidden />{title}</p>
        <span className="flex items-center gap-2">
          <LangSelect value={lang} onChange={setLang} label="Answer language" />
          <Button variant={out ? "ghost" : "secondary"} disabled={busy} onClick={run}>{busy ? "Thinking…" : out ? "Refresh" : cta}</Button>
        </span>
      </div>
      <div aria-live="polite">
        {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
        {out && (<>
          <p dir="auto" className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink">{out.text}</p>
          <p className="mt-2 text-[12.5px] text-mute">{out.source === "gemini" ? "✦ " : ""}{out.label}</p>
        </>)}
      </div>
    </div>
  );
}

/** AICTE officer: an editable DRAFT inspection note (copy or download; nothing is stored). */
export function NoteDraft({ institutionId, name }: { institutionId: string; name: string }) {
  const [text, setText] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lang, setLang] = useLang();

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const out = await sendJson<S["AiSummary"]>(withLang(`/v1/ai/inspection-note/${encodeURIComponent(institutionId)}`, lang), "POST");
      setText(out.text);
      setLabel(out.label);
    } catch (e) { setError(e instanceof ApiError ? e.text : "The service is unreachable."); } finally { setBusy(false); }
  }
  const save = () => {
    const url = URL.createObjectURL(new Blob([`Inspection note (DRAFT): ${name}\n\n${text ?? ""}\n`], { type: "text/plain" }));
    Object.assign(document.createElement("a"), { href: url, download: `inspection-note-${institutionId}.txt` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border border-line bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-display text-[16px] font-bold text-ink"><FileText className="h-4 w-4 text-gold" aria-hidden />Inspection note</p>
        <span className="flex items-center gap-2">
          <LangSelect value={lang} onChange={setLang} label="Note language" />
          <Button variant={text ? "ghost" : "secondary"} disabled={busy} onClick={run}>{busy ? "Drafting…" : text ? "Draft again" : "Draft a visit note"}</Button>
        </span>
      </div>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      {text !== null && (<>
        <label className="sr-only" htmlFor={`note-${institutionId}`}>Inspection note draft</label>
        <textarea dir="auto" id={`note-${institutionId}`} value={text} onChange={(e) => setText(e.target.value)} rows={12}
          className="mt-3 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-[13.5px] leading-relaxed" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            <ClipboardCopy className="h-4 w-4" aria-hidden />{copied ? "Copied" : "Copy"}</Button>
          <Button variant="secondary" onClick={save}><Download className="h-4 w-4" aria-hidden />Download .txt</Button>
          <span className="text-[12.5px] text-mute">{label} Edit before use; it is not saved on the platform.</span>
        </div>
      </>)}
    </div>
  );
}

/** Quote-aware split of a CSV header line (header names only). */
export function splitHeader(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((h) => h.trim());
}

const quote = (h: string) => (/[",]/.test(h) ? `"${h.replace(/"/g, '""')}"` : h);

/** Institution: match the file's own column names to the template, confirm, then re-upload with renamed headers. */
export function ColumnMatcher({ file, onUpload, onCancel }: { file: File; onUpload: (f: File) => void; onCancel: () => void }) {
  const [data, setData] = useState<S["ColumnMapOut"] | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function suggest() {
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      const headers = splitHeader(text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0]);
      const out = await sendJson<S["ColumnMapOut"]>("/v1/ai/map-columns", "POST", { headers });
      setData(out);
      setPick(Object.fromEntries(out.matches.map((m) => [m.header, m.column ?? ""])));
    } catch (e) { setError(e instanceof ApiError ? e.text : "The service is unreachable."); } finally { setBusy(false); }
  }

  const chosen = Object.values(pick).filter(Boolean);
  const dupes = new Set(chosen.filter((c, i) => chosen.indexOf(c) !== i));
  const missing = data ? data.required.filter((c) => !chosen.includes(c)) : [];

  async function apply() {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    const nl = text.search(/\r?\n/);
    const first = nl < 0 ? text : text.slice(0, nl);
    const renamed = splitHeader(first).map((h) => quote(pick[h] || h)).join(",");
    onUpload(new File([renamed + (nl < 0 ? "" : text.slice(nl))], file.name.replace(/\.csv$/i, "") + "-matched.csv", { type: "text/csv" }));
  }

  return (
    <div className="rounded-2xl border border-gold/30 bg-gold/[0.05] p-5">
      <p className="flex items-center gap-2 font-display text-[17px] font-bold text-ink"><Wand2 className="h-4 w-4 text-gold" aria-hidden />Your column names don't match the template</p>
      <p className="mt-1 text-[14.5px] text-slate-700">We can suggest which of your columns is which. Only the column names are checked, never the student rows.
        You confirm every match, and your file on disk is not changed.</p>
      {!data && <Button className="mt-3" disabled={busy} onClick={suggest}>{busy ? "Matching…" : "Match my columns"}</Button>}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      {data && (<>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {data.matches.map((m) => (
            <li key={m.header} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[14px] text-ink" title={m.header}>{m.header || "(blank)"}</span>
              <span aria-hidden className="text-slate-400">→</span>
              <select value={pick[m.header] ?? ""} onChange={(e) => setPick({ ...pick, [m.header]: e.target.value })}
                aria-label={`Template column for ${m.header}`}
                className={`w-52 rounded-lg border px-2 py-1.5 text-[13.5px] ${dupes.has(pick[m.header]) ? "border-critical" : "border-slate-300"}`}>
                <option value="">Ignore this column</option>
                {data.columns.map((c) => <option key={c} value={c}>{c}{data.required.includes(c) ? "" : " (optional)"}</option>)}
              </select>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13.5px] text-mute">{data.label}</p>
        {missing.length > 0 && <p className="mt-2 text-[14px] text-warning-text">Still missing (add these columns to your file first): {missing.join(", ")}</p>}
        {dupes.size > 0 && <p className="mt-2 text-[14px] text-critical-text">Each template column can be used once: {[...dupes].join(", ")}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={missing.length > 0 || dupes.size > 0} onClick={apply}>Upload with these matches</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </>)}
    </div>
  );
}
