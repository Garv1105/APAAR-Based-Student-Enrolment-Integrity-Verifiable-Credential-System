import { useState } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { ApiError, getJson, sendJson, type S } from "./api/client";
import AccountSearch, { type Account } from "./components/AccountSearch";
import { Badge, Button, Card, Empty, ErrorNote, fmtTime, Table, Td, usePoll } from "./ui";

const field = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const errText = (e: unknown) => (e instanceof ApiError ? e.text : "Request failed");

function CodeBox({ out }: { out: S["AccountCodeOut"] }) {
  if (!out.code) return <p className="text-[13px] text-mute">A code was already issued with this request; issue a new one if it was lost.</p>;
  return (
    <div role="status" className="rounded-xl border border-gold/40 bg-accent-50 p-4">
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">One-time activation code · shown once</p>
      <p className="mt-2 font-mono text-[24px] font-semibold tracking-[0.18em] text-champagne">{out.code}</p>
      <p className="mt-1 text-[13px] text-slate-600">
        For <span className="text-ink">{out.display_name}</span> (account <span className="font-mono">{out.user_id}</span>), expires {fmtTime(out.expires_at)}.
        Send it through an official channel. Prototype: no email is sent (MOCK).
      </p>
    </div>
  );
}

const KINDS = [["institution", "Institution"], ["university", "University"], ["verifier", "Verifier"]] as const;

function IssueCode() {
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("institution");
  const [account, setAccount] = useState<Account | null>(null);
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<S["AccountCodeOut"] | null>(null);

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    const id = kind === "verifier" ? userId.trim() : account?.login_id;
    if (!id) return setError("Choose the account first.");
    setBusy(true);
    setError(null);
    try {
      setOut(await sendJson<S["AccountCodeOut"]>(`/v1/users/${encodeURIComponent(id)}/account-code`, "POST", { reason },
        { "Idempotency-Key": crypto.randomUUID() }));
      setReason("");
    } catch (err) { setError(errText(err)); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={issue} className="space-y-3">
      <h3 className="font-display text-[16px] font-bold text-ink">Issue an activation code</h3>
      <p className="text-[13px] text-slate-600">For a new account or a forgotten password. A new code cancels the account's earlier unused code.</p>
      <div role="radiogroup" aria-label="Account type" className="flex gap-1">
        {KINDS.map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setAccount(null); setOut(null); }}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${kind === k ? "bg-white/[0.08] text-ink" : "text-slate-500 hover:text-ink"}`}>{label}</button>
        ))}
      </div>
      {kind === "verifier" ? (
        <label className="block text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">Verifier account ID
          <input value={userId} onChange={(e) => setUserId(e.target.value)} className={`${field} font-mono normal-case tracking-normal`} /></label>
      ) : (
        <AccountSearch key={kind} kind={kind} variant="app" selected={account} onSelect={setAccount}
          label={kind === "institution" ? "Institution" : "University"} placeholder={kind === "institution" ? "Name, AICTE id or city" : "University name"} />
      )}
      <label className="block text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">Reason (audited)
        <input value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} required placeholder="e.g. New principal, first sign-in"
          className={`${field} normal-case tracking-normal`} /></label>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" disabled={busy || reason.trim().length < 10}><KeyRound className="h-4 w-4" aria-hidden />{busy ? "Issuing…" : "Issue code"}</Button>
      {out && <CodeBox out={out} />}
    </form>
  );
}

function Requests({ canDecide }: { canDecide: boolean }) {
  const { data, error, refresh } = usePoll(() => getJson<S["AccessRequestOut"][]>("/v1/access-requests"), 15000);
  const [open, setOpen] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [issued, setIssued] = useState<S["AccountCodeOut"] | null>(null);

  async function decide(id: number, decision: "approved" | "rejected") {
    setBusy(true);
    setErr(null);
    try {
      const r = await sendJson<S["AccessRequestDecided"]>(`/v1/access-requests/${id}/decide`, "POST", { decision, reason });
      setIssued(r.account ?? null);
      setOpen(null);
      setReason("");
      refresh();
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  }

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  const rows = data ?? [];
  return (
    <div className="space-y-3">
      <h3 className="font-display text-[16px] font-bold text-ink">Verifier access requests</h3>
      {issued && <CodeBox out={issued} />}
      {rows.length === 0 ? <Empty>No access requests yet.</Empty> : (
        <Table head={["Organisation", "Contact", "Purpose", "Received", "Status", ""]}>
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <Td className="font-medium text-ink" wrap>{r.organisation}</Td>
              <Td wrap><span className="block text-ink">{r.contact_name}</span><span className="text-mute">{r.contact_email}</span></Td>
              <Td wrap className="min-w-56 max-w-80">{r.purpose}</Td>
              <Td className="text-mute">{fmtTime(r.created_at)}</Td>
              <Td>
                <Badge tone={r.status === "approved" ? "ok" : r.status === "rejected" ? "error" : "warning"} dot>{r.status}</Badge>
                {r.user_id && <span className="mt-1 block font-mono text-[12px] text-mute">{r.user_id}</span>}
              </Td>
              <Td wrap>
                {canDecide && r.status === "pending" && (open === r.id ? (
                  <div className="w-72 space-y-2">
                    <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (10+ characters, audited)" aria-label="Reason"
                      className="block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                    <div className="flex gap-2">
                      <Button disabled={busy || reason.trim().length < 10} onClick={() => decide(r.id, "approved")}>Approve</Button>
                      <Button variant="danger" disabled={busy || reason.trim().length < 10} onClick={() => decide(r.id, "rejected")}>Reject</Button>
                      <Button variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
                    </div>
                    {err && <ErrorNote>{err}</ErrorNote>}
                  </div>
                ) : <Button variant="secondary" onClick={() => { setOpen(r.id); setReason(""); setErr(null); }}>Review</Button>)}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

export function AccountsCard({ canManage }: { canManage: boolean }) {
  return (
    <Card id="accounts" title="Accounts and access" icon={<UserPlus />} actions={<span>Codes are shown once · every action is audited</span>}>
      <div className={`grid gap-8 ${canManage ? "xl:grid-cols-[380px_minmax(0,1fr)]" : ""}`}>
        {canManage && <IssueCode />}
        <Requests canDecide={canManage} />
      </div>
    </Card>
  );
}
