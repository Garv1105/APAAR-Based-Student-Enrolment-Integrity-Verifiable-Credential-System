"""A3: shared-student network (docs/ANOMALY_V2_SPEC.md §A3). Pure functions over edge COUNTS only.

Colleges are nodes; an edge counts students shared between two colleges (from the regulator-only SQL function
shared_student_edges, which joins on the APAAR blind index). Normal migration makes thin, scattered edges. A ring
(several colleges densely sharing the same students) points to ghost students or seat blocking.

  weight = active_shared + 0.5 * historical_shared + 2 * carousel; edges with weight >= EDGE_MIN are kept
  rings: 2-core of the kept graph (iteratively drop colleges with < 2 kept edges), then connected components (union-find);
         SHARED_STUDENT_RING if size >= 3 and (density >= 0.5 or carousel >= 5) and shared_ratio >= 0.02
  SEAT_BLOCKING: a pair with >= 5 students active at both, unless both colleges are in the same flagged ring
                 (then those students are part of the ring flag: active_shared_inside)
historical_shared and carousel need multi-year migration data; on single-year data they are ~0.
"""
from .rules import LABEL

EDGE_MIN = 3.0            # minimum edge weight kept in the graph
RING_MIN_SIZE = 3         # colleges
RING_DENSITY = 0.5        # kept edges / possible edges
RING_CAROUSEL = 5         # students who moved A -> B -> A inside the component
RING_SHARED_RATIO = 0.02  # shared students / active enrolments of the component's colleges
SEAT_BLOCKING_MIN = 5     # students active at both colleges of a pair


def weight(e: dict) -> float:
    return e["active_shared"] + 0.5 * e["historical_shared"] + 2 * e["carousel"]


def components(nodes, edges) -> list[list[str]]:
    """Connected components by union-find; deterministic order (each sorted, then by first member)."""
    parent = {n: n for n in nodes}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)
    groups: dict[str, list[str]] = {}
    for n in nodes:
        groups.setdefault(find(n), []).append(n)
    return sorted((sorted(g) for g in groups.values()), key=lambda g: g[0])


def two_core(nodes, edges) -> set[str]:
    """Colleges left after repeatedly removing those with fewer than 2 edges (strips chains and pendant pairs)."""
    alive = set(nodes)
    while True:
        deg = {n: 0 for n in alive}
        for a, b in edges:
            if a in alive and b in alive:
                deg[a] += 1
                deg[b] += 1
        drop = {n for n, d in deg.items() if d < 2}
        if not drop:
            return alive
        alive -= drop


def analyse(edges: list[dict], enrolments: dict[str, int]) -> dict:
    """edges: {inst_a, inst_b, active_shared, historical_shared, carousel}; enrolments: active enrolments per college."""
    es = [{**e, "weight": weight(e), "kept": weight(e) >= EDGE_MIN} for e in edges]
    kept = [e for e in es if e["kept"]]
    kept_pairs = [(e["inst_a"], e["inst_b"]) for e in kept]
    core = two_core({n for p in kept_pairs for n in p}, kept_pairs)
    core_edges = [e for e in kept if e["inst_a"] in core and e["inst_b"] in core]

    comps, ring_of, flags = [], {}, []
    for idx, members in enumerate(components(core, [(e["inst_a"], e["inst_b"]) for e in core_edges]), start=1):
        mset = set(members)
        ce = [e for e in core_edges if e["inst_a"] in mset and e["inst_b"] in mset]
        n = len(members)
        possible = n * (n - 1) / 2
        shared = sum(e["active_shared"] + e["historical_shared"] for e in ce)
        total = sum(enrolments.get(m, 0) for m in members)
        c = {"id": f"R{idx}", "members": members, "colleges": n, "density": round(len(ce) / possible, 2) if possible else 0.0,
             "shared_students": shared, "carousel": sum(e["carousel"] for e in ce),
             "active_shared_inside": sum(e["active_shared"] for e in ce),
             "shared_ratio": round(shared / total, 4) if total else 0.0, "has_cycle": len(ce) >= n}
        c["flagged"] = (n >= RING_MIN_SIZE and (c["density"] >= RING_DENSITY or c["carousel"] >= RING_CAROUSEL)
                        and c["shared_ratio"] >= RING_SHARED_RATIO)
        comps.append(c)
        if c["flagged"]:
            evidence = {k: c[k] for k in ("colleges", "density", "shared_students", "carousel", "shared_ratio", "has_cycle",
                                          "active_shared_inside")} | {"component": c["id"]}
            text = (f"{n} colleges share {shared} students; {c['carousel']} moved in a loop between them; "
                    f"{c['active_shared_inside']} of them are active at two of these colleges right now")
            for m in members:
                ring_of[m] = c["id"]
                flags.append({"type": "SHARED_STUDENT_RING", "institution_id": m, "programme": None,
                              "score": round(min(1.0, c["shared_ratio"] * 10), 2), "evidence": evidence, "explanation": text,
                              "label": LABEL})

    for e in es:
        a, b = e["inst_a"], e["inst_b"]
        if e["active_shared"] < SEAT_BLOCKING_MIN or (a in ring_of and ring_of[a] == ring_of.get(b)):
            continue
        for me, other in ((a, b), (b, a)):
            flags.append({"type": "SEAT_BLOCKING", "institution_id": me, "programme": None,
                          "score": round(min(1.0, e["active_shared"] / 20), 2),
                          "evidence": {"active_shared": e["active_shared"], "historical_shared": e["historical_shared"],
                                       "with_institution": other},
                          "explanation": f"{e['active_shared']} students are active here and at another college at the same time",
                          "label": LABEL})
    return {"edges": es, "components": comps, "ring_of": ring_of, "flags": flags}
