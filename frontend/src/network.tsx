import { useMemo, useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { getJson, type S } from "./api/client";
import { Badge, Button, Card, Empty, ErrorNote, go, Loading, Table, Td, usePoll } from "./ui";

const TILE_W = 300, TILE_H = 210, COLS = 3;
const short = (s: string, n = 26) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function groups(nodes: string[], edges: S["NetworkEdge"][]) {
  const parent = new Map(nodes.map((n) => [n, n]));
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  for (const e of edges) parent.set(find(e.inst_a), find(e.inst_b));
  const by = new Map<string, string[]>();
  for (const n of nodes) by.set(find(n), [...(by.get(find(n)) ?? []), n]);
  return [...by.values()].sort((a, b) => b.length - a.length);
}

export function NetworkCard() {
  const q = usePoll(() => getJson<S["NetworkOut"]>("/v1/network"), 60000);
  const [sel, setSel] = useState<S["NetworkEdge"] | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const graph = useRef<HTMLDivElement>(null);
  const data = q.data;

  const view = useMemo(() => {
    if (!data) return null;
    const kept = data.edges.filter((e) => e.kept);
    const ids = data.nodes.filter((n) => n.connected).map((n) => n.id);
    const gs = groups(ids, kept);
    const pos = new Map<string, { x: number; y: number; dx: number; dy: number }>();
    gs.forEach((g, gi) => {
      const cx = (gi % COLS) * TILE_W + TILE_W / 2, cy = Math.floor(gi / COLS) * TILE_H + TILE_H / 2 - 12;
      const r = g.length === 2 ? 0 : 44;
      g.forEach((id, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / g.length;
        pos.set(id, g.length === 2 ? { x: cx, y: cy - 42 + i * 84, dx: 0, dy: i ? 1 : -1 }
          : { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), dx: Math.cos(a), dy: Math.sin(a) });
      });
    });
    return { kept, gs, pos, height: Math.max(1, Math.ceil(gs.length / COLS)) * TILE_H };
  }, [data]);

  const node = (id: string) => data?.nodes.find((n) => n.id === id);
  const name = (id: string) => node(id)?.name ?? id;
  const blocking = new Set((data?.flags ?? []).filter((f) => f.type === "SEAT_BLOCKING").map((f) => f.institution_id));
  const rings = (data?.components ?? []).filter((c) => c.flagged);
  const top = view ? [...view.kept].sort((a, b) => b.active_shared - a.active_shared || b.historical_shared - a.historical_shared).slice(0, 15) : [];

  return (
    <Card title="Colleges that share students" icon={<Share2 />}>
      {q.error && !data ? <ErrorNote>{q.error}</ErrorNote> : !data || !view ? <Loading /> : view.gs.length === 0 ? (
        <Empty>No colleges share more than a few students.</Empty>
      ) : (<>
        <p className="mb-3 text-[14px] text-mute">Each box is one group of linked colleges. Click a line for its numbers; point at a dot for the college's full name.</p>
        <div ref={graph} className="relative">
        <svg viewBox={`0 0 ${COLS * TILE_W} ${view.height}`} className="h-auto w-full rounded-xl border border-line" role="img"
          aria-label={`${view.gs.length} groups of colleges sharing students`} onClick={(ev) => ev.target === ev.currentTarget && setSel(null)}>
          {view.gs.map((g, gi) => (
            <rect key={gi} x={(gi % COLS) * TILE_W + 6} y={Math.floor(gi / COLS) * TILE_H + 6} width={TILE_W - 12} height={TILE_H - 12} rx={12}
              fill="rgba(255,255,255,0.02)" stroke={g.some((id) => node(id)?.ring) ? "rgba(212,175,55,0.45)" : "rgba(255,255,255,0.06)"} />
          ))}
          {view.kept.map((e) => {
            const a = view.pos.get(e.inst_a), b = view.pos.get(e.inst_b);
            if (!a || !b) return null;
            const on = sel?.inst_a === e.inst_a && sel?.inst_b === e.inst_b;
            return (
              <g key={`${e.inst_a}-${e.inst_b}`} onClick={() => setSel(on ? null : e)} className="cursor-pointer">
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14} />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={on ? "var(--color-champagne)" : e.active_shared >= 5 ? "#f87171" : "var(--color-gold)"}
                  strokeWidth={Math.min(7, 1.5 + e.weight / 5)} strokeOpacity={0.9} />
              </g>
            );
          })}
          {[...view.pos.entries()].map(([id, p]) => {
            const n = node(id)!;
            return (
              <g key={id} transform={`translate(${p.x},${p.y})`} className="cursor-default"
                onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover((h) => (h === id ? null : h))}>
                <circle r={16} fill="transparent" />
                <circle r={n.ring ? 10 : 8} fill="var(--color-raised)" strokeWidth={n.ring ? 3 : 2}
                  stroke={n.ring ? "var(--color-gold)" : blocking.has(id) ? "#f87171" : "var(--color-mute)"} />
                <text x={p.dx > 0.3 ? 15 : p.dx < -0.3 ? -15 : 0} y={p.dy > 0.5 ? 26 : p.dy < -0.5 ? -15 : 4}
                  textAnchor={p.dx > 0.3 ? "start" : p.dx < -0.3 ? "end" : "middle"} fontSize={11.5} fill="var(--color-ink)">
                  {short(n.name, Math.abs(p.dx) > 0.3 ? 14 : 30)}</text>
              </g>
            );
          })}
        </svg>
        {(() => {
          const W = COLS * TILE_W, H = view.height;
          const at = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`,
            transform: `translate(${x > W * 0.66 ? "-100%" : x < W * 0.33 ? "0" : "-50%"}, ${y > H / 2 ? "calc(-100% - 14px)" : "14px"})` });
          const hn = hover ? node(hover) : null, hp = hover ? view.pos.get(hover) : null;
          const a = sel && view.pos.get(sel.inst_a), b = sel && view.pos.get(sel.inst_b);
          return (<>
            {hn && hp && (
              <div role="tooltip" style={at(hp.x, hp.y)} className="pointer-events-none absolute z-20 w-64 rounded-xl border border-white/10 bg-[#16171b]/95 p-3 text-[13.5px] shadow-2xl backdrop-blur">
                <p className="font-semibold text-ink">{hn.name}</p>
                <p className="mt-0.5 text-mute">{hn.state} · {hn.active.toLocaleString("en-IN")} students</p>
                {hn.ring && <p className="mt-1 text-gold">Part of a suspected group</p>}
                {blocking.has(hn.id) && <p className="mt-1 text-red-300">Possible seat blocking</p>}
              </div>
            )}
            {sel && a && b && (
              <div style={at((a.x + b.x) / 2, (a.y + b.y) / 2)} className="absolute z-30 w-72 rounded-xl border border-gold/40 bg-[#16171b]/95 p-4 text-[14px] shadow-2xl backdrop-blur" aria-live="polite">
                <button type="button" onClick={() => setSel(null)} aria-label="Close" className="absolute right-2 top-1.5 px-1.5 text-lg leading-none text-mute hover:text-ink">×</button>
                <p className="pr-5 font-semibold text-ink">{name(sel.inst_a)} and {name(sel.inst_b)}</p>
                <ul className="mt-1.5 space-y-0.5 text-slate-700">
                  <li>{sel.active_shared} students listed as active at both right now</li>
                  <li>{sel.historical_shared} enrolled at both in the last 3 years</li>
                  <li>{sel.carousel} moved from one to the other and back</li>
                </ul>
                <Button variant="secondary" className="mt-3" onClick={() => go("/aicte/cases")}>Go to duplicate cases</Button>
              </div>
            )}
          </>);
        })()}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[13px] text-mute">
          <span><span className="mr-1.5 inline-block h-2 w-4 align-middle" style={{ background: "var(--color-gold)" }} />share several students</span>
          <span><span className="mr-1.5 inline-block h-2 w-4 align-middle bg-red-400" />5+ students active at both right now (possible seat blocking)</span>
          <span>gold ring and gold box: a suspected group</span>
        </div>


        {rings.length > 0 && (
          <ul className="mt-5 space-y-2">
            {rings.map((r) => (
              <li key={r.id} className="rounded-xl border border-line p-4 text-[14.5px]">
                <Badge tone="warning">Suspected group {r.id}</Badge>{" "}
                <span className="text-ink">{r.colleges} colleges share {r.shared_students} students ({(r.shared_ratio * 100).toFixed(1)}% of their students);
                  {" "}{r.active_shared_inside} are active at two of them right now{r.carousel ? `, ${r.carousel} moved in a loop` : ""}.</span>
                <p className="mt-1.5 text-[13.5px] text-mute">{r.members.map(name).join(" · ")}</p>
                <p className="mt-1 text-[12.5px] text-slate-400">A warning sign to look into, not proof of wrongdoing.</p>
              </li>
            ))}
          </ul>
        )}

        <h3 className="mb-2 mt-6 font-display text-[16px] font-bold text-ink">Biggest overlaps</h3>
        <Table head={["College", "College", "Active at both now", "Shared in last 3 years"]}>
          {top.map((e) => (
            <tr key={`${e.inst_a}-${e.inst_b}`} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => { setSel(e); graph.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
              <Td wrap className="min-w-56 text-ink">{name(e.inst_a)}</Td>
              <Td wrap className="min-w-56 text-ink">{name(e.inst_b)}</Td>
              <Td className={`tabular-nums ${e.active_shared >= 5 ? "font-semibold text-critical-text" : ""}`}>{e.active_shared}</Td>
              <Td className="tabular-nums">{e.historical_shared}</Td>
            </tr>
          ))}
        </Table>
      </>)}
    </Card>
  );
}
