// AICTE / auditor workspace: one page per job instead of one long page. Routes: /aicte, /aicte/seats, /aicte/cases,
// /aicte/inspection, /aicte/network, /aicte/institutions, /aicte/accounts, /aicte/reports.
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertOctagon, ArrowRight, Building2, CalendarClock, CheckCircle2, ClipboardList, Fingerprint, Inbox, Info, Link2, PieChart, Search,
  ShieldAlert, Users,
} from "lucide-react";
import { ApiError, getJson, sendJson, type Role, type S } from "../api/client";
import { AccountsCard } from "../accounts";
import { CaseQueueCard } from "../cases";
import GoldIndiaMap from "../components/GoldIndiaMap";
import { NetworkCard } from "../network";
import { InspectionList, RulePerformanceCard, WarningSignsCard, withBuckets } from "../risk";
import {
  Badge, Button, CATEGORY_LABEL, Card, Empty, ErrorNote, fmtTime, go, Loading, Meter, PageHeader, ReportsCard, Stat, Table, Td, usePoll, type Tone,
} from "../ui";

const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);
const fmt = (n: number) => n.toLocaleString("en-IN");
const useDashboard = () => usePoll(() => getJson<S["AicteDashboard"]>("/v1/dashboard/aicte"), 30000);

export default function AicteHome({ role, hash }: { role: Role; hash: string }) {
  const officer = role === "aicte_officer";
  const [path, query] = hash.split("?");
  switch (path) {
    case "/aicte/seats": return <Seats />;
    case "/aicte/cases": return <Cases officer={officer} />;
    case "/aicte/inspection": return <Inspection officer={officer} />;
    case "/aicte/network": return <Network />;
    case "/aicte/institutions": return <Institutions initial={new URLSearchParams(query ?? "").get("show")} />;
    case "/aicte/accounts": return <Accounts officer={officer} />;
    case "/aicte/reports": return <Reports officer={officer} />;
    default: return <Overview role={role} />;
  }
}

/** "What this page is for" box at the top of every page. */
function Intro({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-gold/20 bg-gold/[0.05] px-5 py-4">
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden />
      <div className="space-y-1.5 text-[15px] leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

function Page({ eyebrow = "AICTE", title, meta, intro, children }: { eyebrow?: string; title: string; meta?: ReactNode; intro: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={eyebrow} title={title} meta={meta} />
      <Intro>{intro}</Intro>
      {children}
    </div>
  );
}

/* ---------------- Overview: what needs attention today ---------------- */

function Overview({ role }: { role: Role }) {
  const d = useDashboard();
  const q = usePoll(() => getJson<S["InspectionEntry"][]>("/v1/inspection-queue"), 60000);
  const req = usePoll(() => getJson<S["AccessRequestOut"][]>("/v1/access-requests"), 60000);
  if (d.error && !d.data) return <ErrorNote>{d.error}</ErrorNote>;
  if (!d.data) return <Loading />;
  const t = d.data.totals;
  const approved = d.data.upload_compliance.filter((c) => c.status === "approved");
  const missing = approved.filter((c) => !c.batches).length;
  const overProgrammes = new Set(d.data.excess_ranking.filter((r) => !r.category_code.includes(":")).map((r) => r.programme_id)).size;
  const high = q.data ? withBuckets(q.data).filter((e) => e.bucket === "High").length : null;
  const pending = req.data ? req.data.filter((r) => r.status === "pending").length : null;
  const fill = pct(t.active_enrolments, t.approved_intake);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={role === "auditor" ? "AICTE · read-only" : "AICTE"} title="Today at a glance"
        meta={<span>Live from records submitted by {fmt(approved.length - missing)} of {fmt(approved.length)} approved colleges</span>} />

      <section aria-labelledby="todo">
        <h2 id="todo" className="font-display text-[22px] font-bold text-ink">Needs your attention</h2>
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          <Action icon={<Fingerprint />} n={d.data.open_cases} tone="flag" to="/aicte/cases"
            text="students hold seats at more than one college" sub="Decide which seat stands in each case." />
          <Action icon={<AlertOctagon />} n={t.excess_seats} tone="error" to="/aicte/seats"
            text={`seats admitted over the approved limit${overProgrammes ? `, in ${overProgrammes} programmes` : ""}`} sub="Admissions beyond approved intake or a category quota." />
          <Action icon={<ClipboardList />} n={high} tone="warning" to="/aicte/inspection"
            text="colleges are high priority for inspection" sub="The top 10% by data problems and students affected." />
          <Action icon={<Building2 />} n={missing} tone="warning" to="/aicte/institutions?show=missing"
            text="approved colleges haven't uploaded any records" sub="Follow up before the reporting deadline." />
          <Action icon={<Inbox />} n={pending} tone="brand" to="/aicte/accounts"
            text="verifier organisations are waiting for access" sub="Approve or reject their requests." />
          <Action icon={<CalendarClock />} n={t.post_deadline_mutations} tone="warning" to="/aicte/inspection"
            text="records were changed after the deadline" sub="Each change is flagged and kept in the seat ledger." />
        </ul>
        {!d.data.ledger_ok && (
          <button type="button" onClick={() => go("/aicte/reports")} className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-critical/50 bg-critical/10 p-4 text-left">
            <ShieldAlert className="h-6 w-6 text-critical-text" aria-hidden />
            <span className="text-[15px] font-semibold text-critical-text">The seat ledger failed its integrity check. Open Reports &amp; integrity.</span>
          </button>
        )}
      </section>

      <section aria-labelledby="pic">
        <h2 id="pic" className="font-display text-[22px] font-bold text-ink">The national picture</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Colleges reporting" value={approved.length - missing} icon={<Building2 />} hint={`of ${fmt(approved.length)} approved colleges`} />
          <Stat label="Students enrolled" value={t.active_enrolments} icon={<Users />} hint="Active this year, each keyed by APAAR ID" />
          <Stat label="Seats filled" value={`${fill}%`} icon={<PieChart />} hint={`${fmt(t.active_enrolments)} of ${fmt(t.approved_intake)} approved seats`} />
          <Stat label="Seats over the limit" value={t.excess_seats} tone={t.excess_seats ? "error" : "ok"} icon={<AlertOctagon />} hint="Beyond approved intake or quota" />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-12">
          <Card title="Where students are enrolled" className="xl:col-span-7">
            <div className="mx-auto max-w-[520px]"><GoldIndiaMap states={d.data.by_state.map((s) => ({ state: s.state, filled: s.filled, approved: s.approved,
              excess: d.data!.excess_ranking.some((r) => r.state === s.state) }))} /></div>
            <p className="mt-2 text-[13px] text-mute">Bigger dot = more students. A red ring means some college in that state admitted over its limit.</p>
          </Card>
          <Card title="Seats filled by state" className="xl:col-span-5" actions={<button type="button" onClick={() => go("/aicte/seats")} className="text-champagne hover:text-gold">Details</button>}>
            <StateFill rows={d.data.by_state} limit={8} />
          </Card>
        </div>
      </section>
    </div>
  );
}

function Action({ icon, n, text, sub, to, tone }: { icon: ReactNode; n: number | null; text: string; sub: string; to: string; tone: Tone }) {
  const done = n === 0;
  const color = done ? "text-success-text" : { error: "text-critical-text", warning: "text-warning-text", flag: "text-flag-text", brand: "text-champagne", ok: "text-success-text", neutral: "text-ink" }[tone];
  return (
    <li>
      <button type="button" onClick={() => go(to)}
        className="group flex h-full w-full items-center gap-4 rounded-2xl border border-line bg-white/[0.02] p-4 text-left transition-colors hover:border-gold/40 hover:bg-white/[0.04]">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.05] [&>svg]:h-5 [&>svg]:w-5 ${color}`} aria-hidden>{done ? <CheckCircle2 /> : icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] text-ink">
            <span className={`mr-1.5 font-display text-[24px] font-bold tabular-nums ${color}`}>{n === null ? "…" : fmt(n)}</span>{text}
          </span>
          <span className="block text-[13.5px] text-mute">{done ? "Nothing waiting." : sub}</span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-gold" aria-hidden />
      </button>
    </li>
  );
}

function StateFill({ rows, limit }: { rows: S["AicteDashboard"]["by_state"]; limit?: number }) {
  const sorted = [...rows].sort((a, b) => b.filled - a.filled).slice(0, limit ?? rows.length);
  if (!sorted.length) return <Empty>No college has reported yet.</Empty>;
  return (
    <ul className="space-y-3.5">
      {sorted.map((s) => {
        const p = s.approved ? s.filled / s.approved : 0;
        return (
          <li key={s.state}>
            <div className="flex items-baseline justify-between gap-3 text-[14.5px]">
              <span className="text-ink">{s.state}</span>
              <span className="tabular-nums text-slate-700">{fmt(s.filled)} <span className="text-mute">of {fmt(s.approved)} seats · {Math.round(p * 100)}%</span></span>
            </div>
            <Meter value={Math.min(p, 1)} color={p > 1 ? "bg-critical" : "bg-gradient-to-r from-accent-500 to-accent-700"} className="mt-1.5" />
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------- Seats & intake ---------------- */

function Seats() {
  const d = useDashboard();
  const [search, setSearch] = useState("");
  if (d.error && !d.data) return <ErrorNote>{d.error}</ErrorNote>;
  if (!d.data) return <Loading />;
  const t = d.data.totals;
  const s = search.trim().toLowerCase();
  const rows = d.data.excess_ranking.filter((r) => !s || `${r.institution} ${r.state} ${r.name}`.toLowerCase().includes(s));
  return (
    <Page title="Seats & intake" intro={<>
      <p>Every admitted student is counted against the number of seats AICTE approved for that programme, including students without an APAAR ID yet.</p>
      <p>Rows that go over the limit are still recorded, but flagged here. Use this page to see which colleges admitted more students than allowed.</p>
    </>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Approved seats" value={t.approved_intake} hint="Total intake AICTE approved this year" />
        <Stat label="Students admitted" value={t.active_enrolments} hint={`${pct(t.active_enrolments, t.approved_intake)}% of approved seats`} />
        <Stat label="Seats over the limit" value={t.excess_seats} tone={t.excess_seats ? "error" : "ok"} hint="Beyond approved intake or quota" />
        <Stat label="Programmes over the limit" value={new Set(d.data.excess_ranking.map((r) => r.programme_id)).size} tone={d.data.excess_ranking.length ? "error" : "ok"} hint="Each needs an explanation" />
      </div>

      <Card title="Programmes that admitted over the limit" icon={<ShieldAlert />} actions={
        <label className="relative"><span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="College, state or programme" className="w-64 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-[14px]" />
        </label>}>
        {rows.length === 0 ? <Empty>{d.data.excess_ranking.length ? "No match." : "No programme is over its approved intake or quota."}</Empty> : (
          <Table head={["College", "State", "Programme", "Seat type", "Admitted", "Allowed", "Over by"]}>
            {rows.map((r) => (
              <tr key={`${r.programme_id}-${r.category_code}`}>
                <Td wrap className="min-w-56 font-medium text-ink">{r.institution}</Td>
                <Td>{r.state}</Td>
                <Td wrap className="min-w-40">{r.name}</Td>
                <Td wrap className="min-w-40 text-mute">{CATEGORY_LABEL[r.category_code] ?? r.category_code}</Td>
                <Td className="tabular-nums">{r.filled}</Td>
                <Td className="tabular-nums">{r.cap}</Td>
                <Td className="tabular-nums font-semibold text-critical-text">+{r.excess}</Td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-3 text-[13px] text-mute">A warning sign to follow up, not proof of wrongdoing. Download the full case file from Reports &amp; integrity.</p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Seats filled by state"><StateFill rows={d.data.by_state} /></Card>
        <CategoryMix mix={d.data.category_mix} total={t.active_enrolments} />
      </div>
    </Page>
  );
}

function CategoryMix({ mix, total }: { mix: S["CategoryMix"]; total: number }) {
  const rows = [
    ["Regular seats", mix.regular], ["NRI", mix.nri], ["OCI", mix.oci], ["Foreign nationals", mix.fn], ["Children of Indian workers in the Gulf (CIWG)", mix.ciwg],
  ] as const;
  return (
    <Card title="Who is admitted, by seat type">
      <ul className="space-y-3.5">
        {rows.map(([k, v]) => (
          <li key={k}>
            <div className="flex justify-between gap-3 text-[14.5px]"><span className="text-ink">{k}</span>
              <span className="tabular-nums text-slate-700">{fmt(v)} <span className="text-mute">({pct(v, total)}%)</span></span></div>
            <Meter value={total ? v / total : 0} className="mt-1.5" />
          </li>
        ))}
      </ul>
      <p className="mt-5 rounded-lg border border-warning-border bg-warning-bg px-3 py-2.5 text-[14px] text-warning-text">
        {fmt(mix.no_apaar)} students don't have an APAAR ID yet (a reason was given). They still count toward intake.
      </p>
    </Card>
  );
}

/* ---------------- Duplicate cases ---------------- */

function Cases({ officer }: { officer: boolean }) {
  return (
    <Page title="Duplicate cases" intro={<>
      <p>A case opens when the same student (same APAAR ID) is uploaded as active by more than one college. Only one seat can be real.</p>
      <p>Colleges only see a neutral notice; they never learn who the other college is. {officer
        ? "Open a case, give a reason to see who is involved, then decide which seat stands."
        : "You have read-only access: you can see cases and their status, not decide them."}</p>
    </>}>
      <CaseQueueCard canResolve={officer} />
    </Page>
  );
}

/* ---------------- Inspection priorities ---------------- */

function Inspection({ officer }: { officer: boolean }) {
  const [tab, setTab] = useState<"colleges" | "signs" | "rules">("colleges");
  const d = useDashboard();
  const names = useMemo(() => Object.fromEntries((d.data?.upload_compliance ?? []).map((c) => [c.id, c.name])), [d.data]);
  return (
    <Page title="Inspection priorities" intro={<>
      <p><span className="font-semibold text-ink">Which colleges should inspectors visit first?</span> Each college gets a data quality score out of 100
        (100 = clean, complete, on-time data). Colleges come first when their score is low, warning signs were found in their data, and they have many
        students, because problems there affect the most people. A college with a good score can still rank high if serious warning signs were found.</p>
      <p><span className="font-semibold text-ink">High priority</span> is the top 10%, <span className="font-semibold text-ink">Medium</span> the next 20%, the rest are Low.
        Open a college to see exactly what lowered its score and the warning signs found{officer ? ", and record your decision on each sign" : ""}.</p>
    </>}>
      <div role="tablist" aria-label="View" className="flex flex-wrap gap-1 rounded-2xl border border-line bg-white/[0.02] p-1">
        {([["colleges", "Colleges to inspect"], ["signs", "Warning signs"], ["rules", "How reliable each sign is"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-xl px-4 py-2.5 text-[15px] font-semibold ${tab === k ? "bg-gold/[0.1] text-champagne" : "text-slate-600 hover:text-ink"}`}>{label}</button>
        ))}
      </div>
      {tab === "colleges" ? <InspectionList canReview={officer} /> : tab === "signs" ? <WarningSignsCard canReview={officer} names={names} /> : <RulePerformanceCard />}
    </Page>
  );
}

/* ---------------- Shared students (network) ---------------- */

function Network() {
  return (
    <Page title="Shared students" intro={<>
      <p>Each dot is a college. A line joins two colleges that list some of the same students; the thicker the line, the more students they share.</p>
      <p>A few shared students are normal (transfers). Watch for <span className="font-semibold text-ink">groups of colleges</span> sharing many students (possible ghost
        students) and <span className="font-semibold text-ink">red lines</span>: 5 or more students active at both colleges right now (one may be blocking seats).
        Only counts are shown; open a duplicate case to see who is involved.</p>
    </>}>
      <NetworkCard />
    </Page>
  );
}

/* ---------------- Institutions ---------------- */

const SHOW = { all: "All colleges", missing: "Haven't uploaded", reporting: "Reporting", unapproved: "Not approved" } as const;

function Institutions({ initial }: { initial: string | null }) {
  const d = useDashboard();
  const [show, setShow] = useState<keyof typeof SHOW>(initial && initial in SHOW ? initial as keyof typeof SHOW : "all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(50);
  if (d.error && !d.data) return <ErrorNote>{d.error}</ErrorNote>;
  if (!d.data) return <Loading />;
  const all = d.data.upload_compliance;
  const match = (c: (typeof all)[number]) => show === "all" || (show === "missing" ? c.status === "approved" && !c.batches
    : show === "reporting" ? c.batches > 0 : c.status !== "approved");
  const s = search.trim().toLowerCase();
  const rows = all.filter((c) => match(c) && (!s || `${c.name} ${c.state} ${c.id}`.toLowerCase().includes(s)));
  return (
    <Page title="Institutions" intro={<>
      <p>Every college in the AICTE registry, whether it has uploaded this year and when. Use it to chase colleges that haven't reported.</p>
      <p><span className="font-semibold text-ink">Passkey codes reissued</span> counts how often a college issued a student a second activation code.
        A sudden rise can mean someone is trying to take over students' accounts.</p>
    </>}>
      <Card title={`${fmt(rows.length)} colleges`} actions={
        <label className="relative"><span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setLimit(50); }} placeholder="Name, state or AICTE id" className="w-64 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-[14px]" />
        </label>}>
        <div role="group" aria-label="Show" className="mb-4 flex flex-wrap gap-1.5">
          {(Object.keys(SHOW) as (keyof typeof SHOW)[]).map((k) => (
            <button key={k} type="button" onClick={() => { setShow(k); setLimit(50); }} aria-pressed={show === k}
              className={`rounded-full px-3.5 py-1.5 text-[14px] font-semibold ${show === k ? "bg-gold/15 text-champagne ring-1 ring-gold/40" : "text-slate-600 hover:text-ink"}`}>
              {SHOW[k]} ({all.filter((c) => k === "all" || (k === "missing" ? c.status === "approved" && !c.batches : k === "reporting" ? c.batches > 0 : c.status !== "approved")).length})
            </button>
          ))}
        </div>
        {rows.length === 0 ? <Empty>No college matches.</Empty> : (
          <Table head={["College", "State", "AICTE approval", "Uploads", "Last upload", "Passkey codes reissued"]}>
            {rows.slice(0, limit).map((c) => (
              <tr key={c.id}>
                <Td wrap className="min-w-64"><span className="block font-medium text-ink">{c.name}</span><span className="text-[13px] text-mute">{c.id}</span></Td>
                <Td>{c.state}</Td>
                <Td><Badge tone={c.status === "approved" ? "ok" : "error"} dot>{c.status === "approved" ? "Approved" : "Not approved"}</Badge></Td>
                <Td className="tabular-nums">{c.batches}</Td>
                <Td>{c.batches ? <span className="text-mute">{fmtTime(c.last_upload)}</span> : <Badge tone="warning">Nothing uploaded</Badge>}</Td>
                <Td className="tabular-nums">{c.activation_reissues ? <Badge tone="warning">{c.activation_reissues}</Badge> : <span className="text-slate-400">0</span>}</Td>
              </tr>
            ))}
          </Table>
        )}
        {rows.length > limit && <div className="mt-4 text-center"><Button variant="secondary" onClick={() => setLimit(limit + 100)}>Show more ({fmt(rows.length - limit)} left)</Button></div>}
      </Card>
    </Page>
  );
}

/* ---------------- Accounts & access ---------------- */

function Accounts({ officer }: { officer: boolean }) {
  return (
    <Page title="Accounts & access" intro={<>
      <p><span className="font-semibold text-ink">Activation codes</span> let a college, university or verifier set its password the first time, or after forgetting it.
        Codes are shown to you once and expire after 7 days; send them through an official channel.</p>
      <p><span className="font-semibold text-ink">Verifier requests</span> come from employers and agencies that want to check students' credentials (with each student's consent).
        {officer ? " Approve to create their account, or reject with a reason." : " You have read-only access."}</p>
    </>}>
      <AccountsCard canManage={officer} />
    </Page>
  );
}

/* ---------------- Reports & integrity ---------------- */

function Reports({ officer }: { officer: boolean }) {
  const d = useDashboard();
  if (d.error && !d.data) return <ErrorNote>{d.error}</ErrorNote>;
  if (!d.data) return <Loading />;
  return (
    <Page title="Reports & integrity" intro={<>
      <p><span className="font-semibold text-ink">Reports</span> are spreadsheet (CSV) downloads with totals only, no student details. Every download is recorded.</p>
      <p><span className="font-semibold text-ink">The seat ledger</span> is a tamper-evident record of every admission and change. If anyone edits the database
        behind the platform's back, the check below fails.</p>
    </>}>
      <ReportsCard institutions={d.data.upload_compliance.map((c) => ({ id: c.id, name: c.name }))} />
      <Ledger ok={d.data.ledger_ok} canSign={officer} onChange={d.refresh} />
    </Page>
  );
}

function Ledger({ ok, canSign, onChange }: { ok: boolean; canSign: boolean; onChange: () => void }) {
  const [report, setReport] = useState<S["LedgerVerifyOut"] | null>(null);
  const [cp, setCp] = useState<S["CheckpointOut"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); onChange(); } catch (e) { setError(e instanceof ApiError ? e.text : "The service is unreachable."); } finally { setBusy(false); }
  }

  return (
    <Card title="Seat ledger" icon={<Link2 />}>
      <div className={`flex items-center gap-3 rounded-xl border p-4 ${ok ? "border-success-border bg-success-bg" : "border-critical-border bg-critical-bg"}`}>
        {ok ? <CheckCircle2 className="h-7 w-7 shrink-0 text-success-text" aria-hidden /> : <ShieldAlert className="h-7 w-7 shrink-0 text-critical-text" aria-hidden />}
        <div>
          <p className={`text-[16px] font-semibold ${ok ? "text-success-text" : "text-critical-text"}`}>{ok ? "No tampering found" : "Tampering detected"}</p>
          <p className="text-[14px] text-mute">{ok ? "Every recorded admission and change matches the live data." : "Recorded history and live data disagree. Investigate before relying on the numbers."}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => run(async () => setReport(await getJson("/v1/ledger/verify")))}>Check again now</Button>
        {canSign && <Button disabled={busy} onClick={() => run(async () => setCp(await sendJson("/v1/ledger/checkpoints", "POST")))}>Seal the ledger (sign a checkpoint)</Button>}
      </div>
      {canSign && <p className="mt-2 text-[13px] text-mute">Sealing signs the current state with AICTE's key, so any later change to past records is detectable.</p>}
      <div aria-live="polite" className="mt-3 space-y-2 text-[14px]">
        {error && <ErrorNote>{error}</ErrorNote>}
        {cp && <p className="text-success-text">Sealed: checkpoint #{cp.id} covers {fmt(cp.upto_seq)} entries.</p>}
        {report && (
          <div className={`rounded-lg border p-3 ${report.ok ? "border-success-border bg-success-bg text-success-text" : "border-critical-border bg-critical-bg text-critical-text"}`}>
            <p className="font-medium">{report.ok ? `Checked ${fmt(report.entries)} entries: all consistent.` : `${report.problems.length} problem(s) found`}</p>
            {!report.ok && <ul className="mt-1 list-disc pl-4">{report.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          </div>
        )}
      </div>
    </Card>
  );
}
