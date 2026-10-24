"""Build src/components/indiaGeo.ts from DataMeet India boundaries (https://github.com/datameet/maps, CC BY 4.0).
Download Country/india-composite.geojson and States/Admin2.shp + Admin2.dbf, then:
    python -I scripts/build_india_path.py india-composite.geojson Admin2.shp src/components/indiaGeo.ts
Stdlib only: the shapefile is read with struct (polygon records, WGS84)."""
import json, math, struct, sys

SRC, SHP, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
LON0, LAT1, S = 68.0, 37.2, 20.0          # left edge, top edge, px per degree
KX = math.cos(math.radians(22.0))
TOL, TOL_STATE = 0.9, 1.1                   # simplification tolerance in px
MIN_AREA, MIN_AREA_STATE = 0.4, 3.0         # drop specks smaller than this (px^2); keeps island groups in the outline


def proj(lon, lat):
    return ((lon - LON0) * KX * S, (LAT1 - lat) * S)


def dp(pts, tol):
    """Douglas-Peucker on an open polyline."""
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


def simplify_ring(pts, tol):
    m = len(pts) // 2                       # closed ring: simplify two open halves
    return dp(pts[:m + 1], tol)[:-1] + dp(pts[m:], tol)


def area(pts):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]))) / 2


def to_d(polys):
    return " ".join("M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in p) + "Z" for p in polys)


def read_shp(path):
    """Yield (record_index, [ring, ...]) for polygon shapefile records; rings are lists of (lon, lat)."""
    data = open(path, "rb").read()
    pos, idx = 100, 0
    while pos < len(data):
        _, words = struct.unpack(">ii", data[pos:pos + 8])
        content = data[pos + 8:pos + 8 + words * 2]
        pos += 8 + words * 2
        stype = struct.unpack("<i", content[:4])[0]
        if stype in (5, 15, 25):
            nparts, npoints = struct.unpack("<ii", content[36:44])
            parts = list(struct.unpack(f"<{nparts}i", content[44:44 + 4 * nparts]))
            off = 44 + 4 * nparts
            xy = struct.unpack(f"<{2 * npoints}d", content[off:off + 16 * npoints])
            pts = list(zip(xy[0::2], xy[1::2]))
            yield idx, [pts[s:e] for s, e in zip(parts, parts[1:] + [npoints])]
        idx += 1


def read_dbf_names(path):
    """First character field of each record (the state name in DataMeet Admin2)."""
    data = open(path, "rb").read()
    nrec, hlen, rlen = struct.unpack("<IHH", data[4:12])
    fields, p = [], 32
    while data[p] != 0x0D:
        name = data[p:p + 11].split(b"\0")[0].decode()
        ftype, flen = chr(data[p + 11]), data[p + 16]
        fields.append((name, ftype, flen)); p += 32
    names = []
    for r in range(nrec):
        rec = data[hlen + r * rlen + 1: hlen + (r + 1) * rlen]
        o = 0
        for _, ftype, flen in fields:
            if ftype == "C":
                names.append(rec[o:o + flen].decode("utf-8", "replace").strip()); break
            o += flen
    return names


# country outline
g = json.load(open(SRC, encoding="utf-8"))
outline = []
for f in g["features"]:
    geom = f["geometry"]
    for poly in ([geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]):
        pts = simplify_ring([proj(lon, lat) for lon, lat in poly[0]], TOL)
        if len(pts) >= 4 and area(pts) >= MIN_AREA:
            outline.append(pts)

# states: one path per state, for faint internal borders
names = read_dbf_names(SHP[:-4] + ".dbf")
states = []
for i, rings in read_shp(SHP):
    polys = []
    for ring in rings:
        pts = simplify_ring([proj(lon, lat) for lon, lat in ring], TOL_STATE)
        if len(pts) >= 4 and area(pts) >= MIN_AREA_STATE:
            polys.append(pts)
    if polys:
        states.append((names[i] if i < len(names) else f"state-{i}", polys))

xs = [x for p in outline for x, _ in p]; ys = [y for p in outline for _, y in p]
W, H = math.ceil(max(xs)) + 2, math.ceil(max(ys)) + 2
npts = sum(len(p) for p in outline) + sum(len(p) for _, ps in states for p in ps)
with open(OUT, "w", encoding="utf-8") as fh:
    fh.write("// Generated from DataMeet India boundaries (india-composite.geojson, States/Admin2.shp),\n")
    fh.write("// https://github.com/datameet/maps by the DataMeet India community, CC BY 4.0.\n")
    fh.write(f"// Equirectangular, x scaled by cos(22deg); Douglas-Peucker simplified; {npts} points.\n")
    fh.write("// Regenerate with frontend/scripts/build_india_path.py; do not hand-edit.\n")
    fh.write(f"export const INDIA_VIEWBOX = {{ w: {W}, h: {H} }};\n")
    fh.write(f"export const INDIA_PROJ = {{ lon0: {LON0}, lat1: {LAT1}, s: {S}, kx: {KX:.6f} }};\n")
    fh.write("/** [lon, lat] -> SVG [x, y] in the same space as INDIA_PATH. */\n")
    fh.write("export const project = (lon: number, lat: number): [number, number] => [(lon - INDIA_PROJ.lon0) * INDIA_PROJ.kx * INDIA_PROJ.s, (INDIA_PROJ.lat1 - lat) * INDIA_PROJ.s];\n")
    fh.write(f'export const INDIA_PATH = "{to_d(outline)}";\n')
    fh.write("/** One path per state or UT, for internal borders. */\n")
    fh.write("export const STATE_PATHS: { name: string; d: string }[] = [\n")
    for name, polys in states:
        fh.write(f"  {{ name: {json.dumps(name)}, d: \"{to_d(polys)}\" }},\n")
    fh.write("];\n")
print(f"outline rings={len(outline)} states={len(states)} points={npts} viewBox={W}x{H}")
print("names:", ", ".join(n for n, _ in states))
