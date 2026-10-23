import { useRef, useState } from "react";
import { ApiError, download, getJson, uploadCsv, type S } from "../api/client";
import { EnrolmentLookup } from "./Registrar";
import { ReportsCard } from "../ui";
import { Badge, Button, CATEGORY_LABEL, Card, Empty, ErrorNote, fmtTime, go, Loading, Stat, Table, Td, Updated, usePoll } from "../ui";

export default function InstitutionHome() {
  const { data, error, updatedAt, refresh } = usePoll(() => getJson<S["InstitutionDashboard"]>("/v1/dashboard/institution"));

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Loading />;
  const active = Object.values(data.apaar_coverage).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{data.name}</h1>
          <p className="text-sm text-slate-500">AICTE ID {data.institution_id} · academic year {data.programmes[0]?.academic_year ?? "—"}</p>
        </div>
        <Updated at={updatedAt} />
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}

      <Upload onDone={refresh} />

      <EnrolmentLookup mode="institution" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active enrolments" value={active} />
        <Stat label="APAAR verified" value={data.apaar_coverage.VERIFIED ?? 0} tone="ok" />
        <Stat label="Without APAAR (with reason)" value={(data.apaar_coverage.REFUSED ?? 0) + (data.apaar_coverage.NOT_GENERATED ?? 0) + (data.apaar_coverage.PENDING ?? 0)}
          hint="Counted toward intake" />
        <Stat label="Rows rejected (all batches)" value={data.rejected_rows_total} tone={data.rejected_rows_total ? "error" : "neutral"}
          hint="Not counted until corrected" />
      </div>

      {data.open_notices.length > 0 && (
        <Card title={<span className="flex items-center gap-2">Notices from AICTE <Badge tone="flag">{data.open_notices.length}</Badge></span>}>
          <ul className="space-y-2 text-sm">
            {data.open_notices.map((n) => (
              <li key={n} className="flex gap-2"><span aria-hidden className="text-flag">●</span>{n}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">These notices never reveal another institution's data. AICTE reviews each case.</p>
        </Card>
      )}

      <Card title="Seats: intake vs filled" actions={<span className="text-xs text-slate-500">Approved intake from AICTE registry (MOCK), never from uploads</span>}>
        {data.programmes.length === 0 ? <Empty>No approved programmes for this year.</Empty> : (
          <div className="grid gap-6 lg:grid-cols-2">
            {data.programmes.map((p) => <ProgrammeSeats key={p.programme_id} p={p} />)}
          </div>
        )}
      </Card>

      <ReportsCard />

      <Card title="Upload history">
        {data.batches.length === 0 ? <Empty>No uploads yet.</Empty> : (
          <Table head={["Batch", "Uploaded", "Channel", "Rows", "Accepted", "Rejected", "Warnings", "Flags", ""]}>
            {data.batches.map((b) => (
              <tr key={b.batch_id} className="hover:bg-slate-50">
                <Td className="font-medium">#{b.batch_id}</Td>
                <Td>{fmtTime(b.created_at)}</Td>
                <Td>{b.channel === "portal_csv" ? "CSV" : "API"}</Td>
                <Td className="tabular-nums">{b.counts.rows}</Td>
                <Td className="tabular-nums text-ok">{b.counts.accepted}</Td>
                <Td className="tabular-nums text-err">{b.counts.rejected}</Td>
                <Td className="tabular-nums text-warn">{b.counts.warnings}</Td>
                <Td className="tabular-nums text-flag">{b.counts.flags}</Td>
                <Td><Button variant="ghost" onClick={() => go(`/inst/batch/${b.batch_id}`)}>View issues →</Button></Td>
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
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{p.name}</h3>
        <span className="text-xs text-slate-500">intake {p.approved_intake}</span>
      </div>
      <div className="mt-3 space-y-3">
        {p.lines.map((l) => <SeatBar key={l.category_code} line={l} />)}
      </div>
    </div>
  );
}

export function SeatBar({ line }: { line: S["SeatLine"] }) {
  const max = Math.max(line.cap, line.filled, 1);
  const within = Math.min(line.filled, line.cap);
  const sub = line.category_code.includes(":");
  return (
    <div className={sub ? "pl-4" : ""}>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">{CATEGORY_LABEL[line.category_code] ?? line.category_code}</span>
        <span className="tabular-nums">
          <strong>{line.filled}</strong> / {line.cap}
          {line.excess > 0 && <span className="ml-2 font-semibold text-err">+{line.excess} over cap</span>}
        </span>
      </div>
      <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuemin={0} aria-valuemax={line.cap} aria-valuenow={line.filled}
        aria-label={`${CATEGORY_LABEL[line.category_code] ?? line.category_code}: ${line.filled} of ${line.cap}`}>
        <div className={line.filled >= line.cap ? "bg-amber-500" : "bg-brand-600"} style={{ width: `${(within / max) * 100}%` }} />
        {line.excess > 0 && <div className="bg-err" style={{ width: `${(line.excess / max) * 100}%` }} />}
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
    <Card title="Upload student records" actions={<Button variant="ghost" onClick={() => download("/v1/batches/template.csv", "apaar-upload-template.csv")}>Download CSV template</Button>}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files[0]); }}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${drag ? "border-brand-600 bg-brand-50" : "border-slate-300"}`}
      >
        <p className="text-sm text-slate-700">Drag a CSV file here, or</p>
        <Button onClick={() => input.current?.click()} disabled={busy}>{busy ? "Validating…" : "Choose file"}</Button>
        <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file" onChange={(e) => send(e.target.files?.[0])} />
        <p className="text-xs text-slate-500">Every row is validated against the APAAR registry (MOCK) and AICTE intake. Re-uploading the same file is safe: it returns the original batch.</p>
      </div>
      <div aria-live="polite" className="mt-4 space-y-3">
        {error && <ErrorNote>{error}</ErrorNote>}
        {result && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Batch #{result.batch_id} {result.replayed ? <Badge tone="brand">already uploaded: original batch returned</Badge> : <Badge tone="ok">validated</Badge>}
              </p>
              <Button variant="secondary" onClick={() => go(`/inst/batch/${result.batch_id}`)}>See row-level issues →</Button>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              {([["Rows", result.counts.rows, ""], ["Accepted", result.counts.accepted, "text-ok"], ["Rejected", result.counts.rejected, "text-err"],
                ["With warnings", result.counts.warnings, "text-warn"], ["Flagged for AICTE", result.counts.flags, "text-flag"]] as const).map(([k, v, c]) => (
                <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className={`text-lg font-semibold tabular-nums ${c}`}>{v}</dd></div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </Card>
  );
}
