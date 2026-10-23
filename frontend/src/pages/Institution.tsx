import { useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Building,
  CheckCircle2,
  FileCheck,
  FileSpreadsheet,
  FileText,
  History,
  Info,
  ShieldCheck,
  UploadCloud,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { ApiError, download, getJson, uploadCsv, type S } from "../api/client";
import { EnrolmentLookup } from "./Registrar";
import { OwnDqsCard } from "../risk";
import { ReportsCard } from "../ui";
import { Badge, Button, CATEGORY_LABEL, Card, Empty, ErrorNote, fmtTime, go, Loading, Stat, Table, Td, Updated, usePoll } from "../ui";

export default function InstitutionHome() {
  const { data, error, updatedAt, refresh } = usePoll(() => getJson<S["InstitutionDashboard"]>("/v1/dashboard/institution"));

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  const active = Object.values(data.apaar_coverage).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Dashboard Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-700">
            <span>Institution Portal</span>
            <span>·</span>
            <span>AICTE Institute ID {data.institution_id}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gov-900 sm:text-3xl">{data.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Academic Session {data.programmes[0]?.academic_year ?? "2024-25"} · Direct integration with APAAR & AICTE sanction registry
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Updated at={updatedAt} />
          <Button variant="secondary" onClick={() => refresh()}>
            Refresh
          </Button>
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Upload Zone */}
      <Upload onDone={refresh} />

      {/* KPI Stat Cards with Icons */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Active Enrolments"
          value={active}
          tone="neutral"
          icon={<Users className="h-4 w-4" />}
          hint="Enrolled in approved programmes"
        />
        <Stat
          label="APAAR Verified"
          value={data.apaar_coverage.VERIFIED ?? 0}
          tone="ok"
          icon={<UserCheck className="h-4 w-4" />}
          hint="Validated against registry"
        />
        <Stat
          label="Without APAAR (Reasoned)"
          value={
            (data.apaar_coverage.REFUSED ?? 0) +
            (data.apaar_coverage.NOT_GENERATED ?? 0) +
            (data.apaar_coverage.PENDING ?? 0)
          }
          tone="warning"
          icon={<AlertTriangle className="h-4 w-4" />}
          hint="Counted toward intake cap"
        />
        <Stat
          label="Rejected Rows (All Batches)"
          value={data.rejected_rows_total}
          tone={data.rejected_rows_total > 0 ? "error" : "neutral"}
          icon={<XCircle className="h-4 w-4" />}
          hint="Blocked from seat count"
        />
      </div>

      {/* Regulatory Notices from AICTE */}
      {data.open_notices.length > 0 && (
        <Card
          title={
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 text-flag" />
              <span>Regulatory Notices & Queries from AICTE</span>
              <Badge tone="flag" dot>{data.open_notices.length}</Badge>
            </div>
          }
          className="border-flag-border/60 bg-flag-bg/20"
        >
          <ul className="space-y-2.5 text-sm">
            {data.open_notices.map((n, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl border border-flag-border/40 bg-white/80 p-3 text-slate-800">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-flag" aria-hidden="true" />
                <span className="font-medium">{n}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500 font-medium">
            Privacy safeguard: Notices never expose competing institution details. AICTE reviews each discrepancy independently.
          </p>
        </Card>
      )}

      {/* Student Search & Credential Issuance Section */}
      <EnrolmentLookup mode="institution" />

      {/* Programme Intake vs Filled Seat Allocation Grid */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent-600" />
            <span>Sanctioned Intake vs Live Enrolment</span>
          </div>
        }
        actions={
          <span className="text-xs text-slate-500 font-medium">
            Sanction limits verified via AICTE approval registry
          </span>
        }
      >
        {data.programmes.length === 0 ? (
          <Empty>No approved programmes configured for this academic cycle.</Empty>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {data.programmes.map((p) => (
              <ProgrammeSeats key={p.programme_id} p={p} />
            ))}
          </div>
        )}
      </Card>

      {/* Data Quality Score Card */}
      <OwnDqsCard />

      {/* CSV Statutory Reports */}
      <ReportsCard />

      {/* Batch Upload History */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-accent-600" />
            <span>Upload & Ingestion History</span>
          </div>
        }
      >
        {data.batches.length === 0 ? (
          <Empty>No batch submissions recorded yet.</Empty>
        ) : (
          <Table head={["Batch #", "Submitted", "Channel", "Total Rows", "Accepted", "Rejected", "Warnings", "Flags", "Action"]}>
            {data.batches.map((b) => (
              <tr key={b.batch_id} className="transition-colors hover:bg-slate-50">
                <Td className="font-mono font-bold text-gov-900">#{b.batch_id}</Td>
                <Td className="text-xs text-slate-600">{fmtTime(b.created_at)}</Td>
                <Td>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {b.channel === "portal_csv" ? "CSV Portal" : "REST API"}
                  </span>
                </Td>
                <Td className="tabular-nums font-semibold">{b.counts.rows}</Td>
                <Td className="tabular-nums font-bold text-success">{b.counts.accepted}</Td>
                <Td className="tabular-nums font-bold text-critical">
                  {b.counts.rejected > 0 ? (
                    <span className="rounded bg-critical-bg px-1.5 py-0.5 text-critical border border-critical-border/50">
                      {b.counts.rejected}
                    </span>
                  ) : (
                    "0"
                  )}
                </Td>
                <Td className="tabular-nums font-medium text-warning">{b.counts.warnings}</Td>
                <Td className="tabular-nums font-medium text-flag">{b.counts.flags}</Td>
                <Td>
                  <Button variant="ghost" onClick={() => go(`/inst/batch/${b.batch_id}`)}>
                    Inspect issues →
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function ProgrammeSeats({ p }: { p: S["ProgrammeSeats"] }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 transition-all hover:border-slate-300">
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-200/60 pb-2">
        <h3 className="text-sm font-bold text-gov-900">{p.name}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 border border-slate-200">
          Intake: {p.approved_intake}
        </span>
      </div>
      <div className="mt-3.5 space-y-3.5">
        {p.lines.map((l) => (
          <SeatBar key={l.category_code} line={l} />
        ))}
      </div>
    </div>
  );
}

export function SeatBar({ line }: { line: S["SeatLine"] }) {
  const max = Math.max(line.cap, line.filled, 1);
  const within = Math.min(line.filled, line.cap);
  const sub = line.category_code.includes(":");
  const pct = Math.round((within / line.cap) * 100);

  return (
    <div className={sub ? "pl-4 border-l-2 border-accent-200" : ""}>
      <div className="flex justify-between text-xs font-medium">
        <span className="text-slate-700">{CATEGORY_LABEL[line.category_code] ?? line.category_code}</span>
        <span className="tabular-nums">
          <strong className="text-gov-900">{line.filled}</strong> <span className="text-slate-400">/</span> {line.cap}
          {line.excess > 0 && (
            <span className="ml-2 inline-flex items-center rounded-md bg-critical-bg px-1.5 py-0.2 text-[11px] font-bold text-critical border border-critical-border">
              +{line.excess} over cap
            </span>
          )}
        </span>
      </div>
      <div
        className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-slate-200/70"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={line.cap}
        aria-valuenow={line.filled}
        aria-label={`${CATEGORY_LABEL[line.category_code] ?? line.category_code}: ${line.filled} of ${line.cap}`}
      >
        <div
          className={`transition-all duration-500 ${
            line.filled >= line.cap ? "bg-amber-500" : "bg-accent-600"
          }`}
          style={{ width: `${(within / max) * 100}%` }}
        />
        {line.excess > 0 && (
          <div className="bg-critical animate-pulse" style={{ width: `${(line.excess / max) * 100}%` }} />
        )}
      </div>
    </div>
  );
}

function Upload({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<S["BatchOut"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await uploadCsv(file));
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.text : "Upload failed: cannot reach the API.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <UploadCloud className="h-4 w-4 text-accent-600" />
          <span>Upload Student Enrolment Registry</span>
        </div>
      }
      actions={
        <Button variant="secondary" onClick={() => download("/v1/batches/template.csv", "apaar-upload-template.csv")}>
          <FileSpreadsheet className="h-3.5 w-3.5 text-accent-600" />
          <span>Download CSV Template</span>
        </Button>
      }
    >
      {/* Polished Drag and Drop Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          send(e.dataTransfer.files[0]);
        }}
        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-8 py-10 text-center transition-all ${
          drag
            ? "border-accent-600 bg-accent-50/70 scale-[1.01]"
            : "border-slate-300 hover:border-accent-400 bg-slate-50/40"
        }`}
      >
        <div className={`mb-3 flex h-14 w-14 items-center justify-center rounded-2xl ${drag ? "bg-accent-600 text-white" : "bg-accent-100 text-accent-700"} shadow-sm transition-colors`}>
          <UploadCloud className="h-7 w-7" />
        </div>
        <h4 className="text-base font-bold text-gov-900">Drag & drop your student CSV file here</h4>
        <p className="mt-1 text-xs text-slate-500 max-w-md">
          Standard CSV with mandatory columns: <code>student_id, full_name, dob, programme, category, apaar_id</code>
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => input.current?.click()} disabled={busy}>
            {busy ? "Validating & Ingesting…" : "Browse File"}
          </Button>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="CSV file"
            onChange={(e) => send(e.target.files?.[0])}
          />
        </div>
        <p className="mt-3 text-[11px] text-slate-400 font-medium">
          Idempotent ingestion: Re-uploading identical files returns original batch verification.
        </p>
      </div>

      {/* Validation Result Display */}
      <div aria-live="polite" className="mt-4 space-y-3">
        {error && <ErrorNote>{error}</ErrorNote>}
        {result && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 pb-3">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ingestion Complete</span>
                <p className="text-base font-bold text-gov-900">
                  Batch #{result.batch_id}{" "}
                  {result.replayed ? (
                    <Badge tone="brand">Already uploaded: Original batch returned</Badge>
                  ) : (
                    <Badge tone="ok" dot>Validated against AICTE & APAAR</Badge>
                  )}
                </p>
              </div>
              <Button variant="secondary" onClick={() => go(`/inst/batch/${result.batch_id}`)}>
                <span>View Row-Level Issues</span>
                <span>→</span>
              </Button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
              {(
                [
                  ["Total Rows", result.counts.rows, "text-gov-900"],
                  ["Accepted", result.counts.accepted, "text-success"],
                  ["Rejected", result.counts.rejected, "text-critical"],
                  ["With Warnings", result.counts.warnings, "text-warning"],
                  ["Flagged for AICTE", result.counts.flags, "text-flag"],
                ] as const
              ).map(([k, v, c]) => (
                <div key={k} className="rounded-xl border border-slate-200/60 bg-white p-3">
                  <dt className="text-xs font-medium text-slate-500">{k}</dt>
                  <dd className={`mt-1 text-xl font-bold tabular-nums ${c}`}>{v.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </Card>
  );
}
