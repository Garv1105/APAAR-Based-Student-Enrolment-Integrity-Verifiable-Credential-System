// A3: shared-student network (AICTE only). Colleges are nodes; edges count shared students (counts only, never
// student data). A small deterministic force layout drawn as SVG, no dependency.
import { useMemo, useState } from "react";
import { Share2 } from "lucide-react";
import { getJson, type S } from "./api/client";
import { Badge, Button, Card, Empty, ErrorNote, Loading, usePoll } from "./ui";

const W = 720, H = 380, PAD = 36;

/** Fruchterman-Reingold style layout: nodes start on a circle (deterministic), fixed number of iterations. */
function layout(n: number, links: [number, number, number][]) {
  const pos = Array.from({ length: n }, (_, i) => ({
    x: W / 2 + Math.cos((2 * Math.PI * i) / Math.max(n, 1)) * (W / 2 - PAD * 2),
    y: H / 2 + Math.sin((2 * Math.PI * i) / Math.max(n, 1)) * (H / 2 - PAD * 2),
  }));
  const k = Math.sqrt((W * H) / Math.max(n, 1)) * 0.55;
  for (let it = 0; it < 220; it++) {
    const d = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y, dist = Math.max(1, Math.hypot(dx, dy)), f = (k * k) / dist;
        d[i].x += (dx / dist) * f; d[i].y += (dy / dist) * f; d[j].x -= (dx / dist) * f; d[j].y -= (dy / dist) * f;
      }
    for (const [a, b, w] of links) {
      const dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y, dist = Math.max(1, Math.hypot(dx, dy)), f = ((dist * dist) / k) * Math.min(3, 1 + Math.log1p(w) / 2);
      d[a].x -= (dx / dist) * f; d[a].y -= (dy / dist) * f; d[b].x += (dx / dist) * f; d[b].y += (dy / dist) * f;
    }
    const t = (W / 12) * (1 - it / 220);
    pos.forEach((p, i) => {
      const len = Math.max(1, Math.hypot(d[i].x, d[i].y));
      p.x = Math.min(W - PAD, Math.max(PAD, p.x + (d[i].x / len) * Math.min(len, t)));
      p.y = Math.min(H - PAD, Math.max(PAD, p.y + (d[i].y / len) * Math.min(len, t)));
    });
  }
  return pos;
}

export function NetworkCard() {
  const q = usePoll(() => getJson<S["NetworkOut"]>("/v1/network"), 15000);
  const [showAll, setShowAll] = useState(false);
  const [sel, setSel] = useState<S["NetworkEdge"] | null>(null);
  const data = q.data;

  const view = useMemo(() => {
    if (!data) return null;
    const nodes = data.nodes.filter((n) => showAll || n.connected);
    const idx = new Map(nodes.map((n, i) => [n.id, i]));
    const edges = data.edges.filter((e) => idx.has(e.inst_a) && idx.has(e.inst_b));
    const pos = layout(nodes.length, edges.filter((e) => e.kept).map((e) => [idx.get(e.inst_a)!, idx.get(e.inst_b)!, e.weight]));
    return { nodes, idx, edges, pos };
  }, [data, showAll]);

  const name = (id: string) => data?.nodes.find((n) => n.id === id)?.name ?? id;
  const blocking = new Set((data?.flags ?? []).filter((f) => f.type === "SEAT_BLOCKING").map((f) => f.institution_id));
  const rings = (data?.components ?? []).filter((c) => c.flagged);

  return (
    <Card title="Shared-student network" icon={<Share2 />}
      actions={<label className="flex items-center gap-2"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        Show all colleges</label>}>
      {q.error ? <ErrorNote>{q.error}</ErrorNote> : !data || !view ? <Loading /> : (<>
        <p className="mb-3 text-xs text-mute">
          Edges count students shared between two colleges (weight = active + ½ × historical + 2 × carousel; kept at weight ≥ {data.edge_min}).
          Counts only: no student is identified here. {data.note}
        </p>
        {view.nodes.length === 0 ? <Empty>No colleges share students above the threshold.</Empty> : (
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-lg border border-line" role="img"
            aria-label={`Network of ${view.nodes.length} colleges and ${view.edges.filter((e) => e.kept).length} kept edges`}>
            {view.edges.map((e) => {
              const a = view.pos[view.idx.get(e.inst_a)!], b = view.pos[view.idx.get(e.inst_b)!];
              const active = sel?.inst_a === e.inst_a && sel?.inst_b === e.inst_b;
              return (
                <g key={`${e.inst_a}-${e.inst_b}`} onClick={() => setSel(e)} className="cursor-pointer">
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={12} />
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeDasharray={e.kept ? undefined : "4 4"}
                    stroke={active ? "var(--color-champagne)" : e.active_shared >= 5 ? "#f87171" : e.kept ? "var(--color-gold)" : "var(--color-mute)"}
                    strokeWidth={e.kept ? Math.min(8, 1.5 + e.weight / 4) : 1} strokeOpacity={e.kept ? 0.9 : 0.5} />
                </g>
              );
            })}
            {view.nodes.map((n, i) => (
              <g key={n.id} transform={`translate(${view.pos[i].x},${view.pos[i].y})`}>
                <title>{`${n.name} (${n.state}) · ${n.active} active enrolments${n.ring ? ` · ring ${n.ring}` : ""}`}</title>
                <circle r={n.ring ? 11 : 8} fill="var(--color-raised)" strokeWidth={n.ring ? 3 : 1.5}
                  stroke={n.ring ? "var(--color-gold)" : blocking.has(n.id) ? "#f87171" : "var(--color-mute)"} />
                {(n.connected || view.nodes.length <= 40) && (
                  <text y={22} textAnchor="middle" fontSize={11} fill="var(--color-ink)">{n.name.length > 22 ? `${n.name.slice(0, 21)}…` : n.name}</text>
                )}
              </g>
            ))}
          </svg>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-mute">
          <span><span className="inline-block h-2 w-4 align-middle" style={{ background: "var(--color-gold)" }} /> kept edge</span>
          <span><span className="inline-block h-2 w-4 align-middle bg-red-400" /> 5+ students active at both (seat blocking)</span>
          <span>dashed: below threshold · thick gold ring: member of a flagged ring</span>
        </div>
        {sel && (
          <div className="mt-4 rounded-lg border border-line p-3 text-sm">
            <p className="font-medium">{name(sel.inst_a)} ↔ {name(sel.inst_b)}</p>
            <p className="mt-1 text-mute">
              {sel.active_shared} students active at both now · {sel.historical_shared} enrolled at both in the last 3 years ·
              {" "}{sel.carousel} moved A → B → A · weight {sel.weight}{sel.kept ? "" : " (below threshold)"}
            </p>
            <p className="mt-1 text-xs text-mute">Counts only. Identities are visible only by unmasking a duplicate case with a recorded reason.</p>
            <Button variant="secondary" className="mt-2" onClick={() => document.getElementById("cases")?.scrollIntoView({ behavior: "smooth" })}>
              Review duplicate cases</Button>
          </div>
        )}
        {rings.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm">
            {rings.map((r) => (
              <li key={r.id} className="rounded-lg border border-line p-3">
                <Badge tone="warning">Ring {r.id}</Badge>{" "}
                {r.colleges} colleges · density {r.density} · {r.shared_students} shared students ({(r.shared_ratio * 100).toFixed(1)}% of their
                enrolments) · {r.active_shared_inside} active at two colleges · {r.carousel} in a loop
                <p className="mt-1 text-xs text-mute">{r.members.map(name).join(" · ")}</p>
                <p className="mt-1 text-xs text-mute">Risk indicator for review, not proof of misconduct.</p>
              </li>
            ))}
          </ul>
        )}
      </>)}
    </Card>
  );
}
