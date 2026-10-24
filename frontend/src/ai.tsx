// Advisory plain-language summaries (Gemini free tier via backend/app/ai.py; rule-based fallback). Never decides anything.
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { ApiError, sendJson, type S } from "./api/client";
import { Button, ErrorNote } from "./ui";

export function AiBox({ path, cta, title }: { path: string; cta: string; title: string }) {
  const [out, setOut] = useState<S["AiSummary"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try { setOut(await sendJson<S["AiSummary"]>(path, "POST")); }
    catch (e) { setError(e instanceof ApiError ? (e.status === 429 ? "Too many requests. Try again in a minute." : e.text) : "The service is unreachable."); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl border border-gold/25 bg-gold/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-display text-[16px] font-bold text-ink"><Sparkles className="h-4 w-4 text-gold" aria-hidden />{title}</p>
        <Button variant={out ? "ghost" : "secondary"} disabled={busy} onClick={run}>{busy ? "Thinking…" : out ? "Refresh" : cta}</Button>
      </div>
      <div aria-live="polite">
        {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
        {out && (<>
          <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink">{out.text}</p>
          <p className="mt-2 text-[12.5px] text-mute">{out.source === "gemini" ? "✦ " : ""}{out.label}</p>
        </>)}
      </div>
    </div>
  );
}
