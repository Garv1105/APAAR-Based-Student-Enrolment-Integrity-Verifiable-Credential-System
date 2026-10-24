"""Build src/components/indiaGeo.ts from the DataMeet India composite boundary (CC BY 4.0).
Download https://raw.githubusercontent.com/datameet/maps/master/Country/india-composite.geojson, then:
    python -I scripts/build_india_path.py india-composite.geojson src/components/indiaGeo.ts"""
import json, math, sys

SRC, OUT = sys.argv[1], sys.argv[2]
LON0, LAT1, S = 68.0, 37.2, 20.0          # left edge, top edge, px per degree
KX = math.cos(math.radians(22.0))
TOL = 0.9                                   # simplification tolerance in px
MIN_AREA = 0.4                              # drop specks smaller than this (px^2), keeps island groups

def proj(lon, lat):
    return ((lon - LON0) * KX * S, (LAT1 - lat) * S)

def dp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-9
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / L
            if d > best:
                best, idx = d, i
        if best > tol and idx > 0:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]

def area(pts):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]))) / 2

g = json.load(open(SRC, encoding="utf-8"))
polys = []
for f in g["features"]:
    geom = f["geometry"]
    rings = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    for poly in rings:
        outer = poly[0]                     # holes are irrelevant at this scale
        pts = [proj(lon, lat) for lon, lat in outer]
        m = len(pts) // 2                   # closed ring: simplify two open halves
        pts = dp(pts[:m + 1], TOL)[:-1] + dp(pts[m:], TOL)
        if len(pts) >= 4 and area(pts) >= MIN_AREA:
            polys.append(pts)

xs = [x for p in polys for x, _ in p]; ys = [y for p in polys for _, y in p]
W, H = math.ceil(max(xs)) + 2, math.ceil(max(ys)) + 2
d = " ".join("M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in p) + "Z" for p in polys)
npts = sum(len(p) for p in polys)
with open(OUT, "w", encoding="utf-8") as fh:
    fh.write("// Generated from DataMeet India composite boundary (india-composite.geojson),\n")
    fh.write("// https://github.com/datameet/maps by the DataMeet India community, CC BY 4.0.\n")
    fh.write(f"// Equirectangular, x scaled by cos(22deg); simplified (Douglas-Peucker, {TOL}px): {len(polys)} rings, {npts} points.\n")
    fh.write("// Regenerate with scratch tooling; do not hand-edit.\n")
    fh.write(f"export const INDIA_VIEWBOX = {{ w: {W}, h: {H} }};\n")
    fh.write(f"export const INDIA_PROJ = {{ lon0: {LON0}, lat1: {LAT1}, s: {S}, kx: {KX:.6f} }};\n")
    fh.write("/** [lon, lat] -> SVG [x, y] in the same space as INDIA_PATH. */\n")
    fh.write("export const project = (lon: number, lat: number): [number, number] => [(lon - INDIA_PROJ.lon0) * INDIA_PROJ.kx * INDIA_PROJ.s, (INDIA_PROJ.lat1 - lat) * INDIA_PROJ.s];\n")
    fh.write(f'export const INDIA_PATH = "{d}";\n')
print(f"rings={len(polys)} points={npts} viewBox={W}x{H} bytes={len(d)}")
