import argparse
import csv
import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from app.contracts import CSV_COLUMNS  # noqa: E402

ERRORS = {"E001", "E101", "E102", "E103", "E105", "E201", "E202", "E205", "E304", "E401", "E404"}
FEMALE = ["Asha", "Priya", "Meera", "Kavya", "Ananya", "Divya", "Sneha", "Pooja", "Lakshmi", "Nandini",
          "Shreya", "Aishwarya", "Ritu", "Swati", "Neha", "Sowmya", "Bhavana", "Deepa", "Isha", "Tanvi"]
MALE = ["Ravi", "Arjun", "Rahul", "Vikram", "Suresh", "Karthik", "Aditya", "Rohan", "Manoj", "Nikhil",
        "Siddharth", "Varun", "Harish", "Pranav", "Ganesh", "Ajay", "Mohit", "Imran", "Farhan", "Tarun"]
SURNAMES = ["Rao", "Kumar", "Sharma", "Iyer", "Reddy", "Nair", "Patel", "Gupta", "Singh", "Joshi",
            "Menon", "Das", "Khan", "Verma", "Pillai", "Bose", "Shetty", "Kulkarni", "Mishra", "Yadav",
            "Chatterjee", "Banerjee", "Hegde", "Naidu", "Desai", "Agarwal", "Saxena", "Pandey", "Bhat", "Gowda"]
INST = {"A": "1-0000000001", "B": "1-0000000002", "C": "1-0000000003", "D": "1-0000000004"}
INTAKE = {("A", "CSE"): 60, ("A", "ECE"): 60, ("B", "CSE"): 120, ("B", "ME"): 60, ("C", "MBA"): 120}
SN_CAP = {k: v * 15 // 100 for k, v in INTAKE.items()}


class Gen:
    def __init__(self, seed):
        self.r = random.Random(seed)
        self.registry, self.used = [], set()
        self.seq = {}
        for _ in range(2000):
            self.registry.append(self._person(self._dob(date(2006, 1, 1), date(2008, 6, 30))))
        self.young = [self._person(self._dob(date(2012, 1, 1), date(2013, 6, 30))) for _ in range(4)]
        self.old = [self._person(self._dob(date(1983, 1, 1), date(1986, 12, 31))) for _ in range(4)]
        self.registry += self.young + self.old
        self.pool = iter(self.registry[:2000])

    def _dob(self, a, b):
        return a + timedelta(days=self.r.randrange((b - a).days))

    def _apaar(self):
        while True:
            a = str(self.r.randrange(10**11, 10**12))
            if a not in self.used:
                self.used.add(a)
                return a

    def _person(self, dob):
        female = self.r.random() < 0.45
        first = self.r.choice(FEMALE if female else MALE)
        sur = self.r.choice(SURNAMES)
        return {"apaar": self._apaar(), "name": f"{first} {sur}", "dob": dob.isoformat(), "female": female,
                "guardian": f"{self.r.choice(MALE)} {sur}"}

    def next_person(self):
        return next(self.pool)

    def row(self, inst, prog, p, *, expected=(), **over):
        n = self.seq[inst] = self.seq.get(inst, 0) + 1
        adm = date(2026, 7, 15) + timedelta(days=self.r.randrange(77))
        r = {"apaar_id": p["apaar"], "apaar_reason": "", "institution_student_id": f"{inst}/{prog}/2026/{n:04d}",
             "student_name": p["name"], "dob": p["dob"], "guardian_name": p["guardian"],
             "programme_code": prog, "academic_year": "2026-27", "year_of_study": "1",
             "seat_category": "REGULAR", "is_supernumerary": "N", "is_lateral_entry": "N",
             "is_nri": "N", "is_oci": "N", "is_fn": "N", "is_ciwg": "N",
             "admission_date": adm.isoformat(), "declared_intake": ""}
        r.update(over)
        return {"raw": r, "static": set(expected), "inst": inst, "prog": prog}

    def noisy_name(self, p):
        first, sur = p["name"].split()
        hon = ("Ms." if p["female"] else "Mr.") if self.r.random() < 0.5 else ("Kumari" if p["female"] else "Shri")
        return self.r.choice([p["name"].upper(), f"{hon} {p['name']}", f"{first}  {sur}", f"{sur} {first}", f"{p['name']}."])

    def wrong_name(self, p):
        first, sur = p["name"].split()
        lst = FEMALE if p["female"] else MALE
        f2 = self.r.choice([x for x in lst if x[0] != first[0]])
        s2 = self.r.choice([x for x in SURNAMES if x[0] != sur[0]])
        return f"{f2} {s2}"

    def sn(self, **flags):
        return dict(seat_category="SN_FN_OCI_CIWG", is_supernumerary="Y", **{k: "Y" for k in flags})


def derive_positional(rows, own_prior=()):
    seen, counters, e303 = set(), {}, set()
    for r in rows:
        exp, raw = r["static"], r["raw"]
        key = raw["apaar_id"] or (raw["student_name"].casefold(), raw["dob"])
        if not exp & ERRORS:
            if key in seen:
                exp.add("E201")
            else:
                seen.add(key)
        if exp & ERRORS:
            continue
        ip = (r["inst"], r["prog"])
        if raw["seat_category"] == "REGULAR":
            counters[ip] = counters.get(ip, 0) + 1
            if counters[ip] > INTAKE[ip]:
                exp.add("E301")
        else:
            k = ip + ("SN",)
            counters[k] = counters.get(k, 0) + 1
            over = counters[k] > SN_CAP[ip]
            if raw["is_ciwg"] == "Y":
                ks = ip + ("CIWG",)
                counters[ks] = counters.get(ks, 0) + 1
                over = over or counters[ks] > SN_CAP[ip] // 3
            if over:
                exp.add("E302")
        if raw["declared_intake"] and int(raw["declared_intake"]) != INTAKE[ip] and ip not in e303:
            e303.add(ip)
            exp.add("E303")


def build(seed):
    g = Gen(seed)
    files = {}

    a = []
    dup_ab = [g.next_person() for _ in range(3)]
    withdrawn, migrated = g.next_person(), g.next_person()
    for p in dup_ab + [withdrawn, migrated]:
        a.append(g.row("A", "CSE", p, declared_intake="60"))
    for i in range(48):
        p = g.next_person()
        a.append(g.row("A", "CSE", p, declared_intake="60", **({"student_name": g.noisy_name(p)} if i % 5 == 0 else {})))
    for reason in ("REFUSED", "NOT_GENERATED"):
        a.append(g.row("A", "CSE", g.next_person(), expected={"E101W"}, apaar_id="", apaar_reason=reason, declared_intake="60"))
    for fl in ({"is_fn": 1}, {"is_oci": 1}, {"is_ciwg": 1}):
        a.append(g.row("A", "CSE", g.next_person(), declared_intake="60", **g.sn(**fl)))
    for _ in range(48):
        a.append(g.row("A", "ECE", g.next_person(), declared_intake="60"))
    g.r.shuffle(a)
    files["A1.csv"] = a

    b, clean_b = [], []
    for _ in range(110):
        p = g.next_person()
        clean_b.append(p)
        b.append(g.row("B", "CSE", p))
    for p in dup_ab:
        b.append(g.row("B", "CSE", p, expected={"E203"}))
    for p in (withdrawn, migrated):
        b.append(g.row("B", "CSE", p))
    for p in [g.next_person() for _ in range(2)]:
        b.append(g.row("B", "CSE", p, expected={"E104"}, student_name=g.wrong_name(p)))
    p = g.next_person()
    b.append(g.row("B", "CSE", p, expected={"E104"}, dob=(date.fromisoformat(p["dob"]) + timedelta(days=1)).isoformat()))
    for p in (g.young[0], g.old[0]):
        b.append(g.row("B", "CSE", p, expected={"E402"}))
    for _ in range(2):
        b.append(g.row("B", "CSE", g.next_person(), expected={"E403"}, admission_date="2026-12-15"))
    for reason in ("REFUSED", "NOT_GENERATED", "PENDING"):
        b.append(g.row("B", "CSE", g.next_person(), expected={"E101W"}, apaar_id="", apaar_reason=reason))
    for _ in range(3):
        b.append(g.row("B", "CSE", g.next_person(), expected={"E101"}, apaar_id=""))
    for bad in ("12345", "1234567890123", "12345678901X"):
        b.append(g.row("B", "CSE", g.next_person(), expected={"E102"}, apaar_id=bad))
    for _ in range(3):
        p = dict(g.next_person())
        p["apaar"] = g._apaar()
        b.append(g.row("B", "CSE", p, expected={"E103"}))
    for fl in ({"is_fn": "Y", "is_oci": "Y"}, {"is_nri": "Y", "is_fn": "Y"}, {"is_nri": "Y", "is_oci": "Y"}):
        b.append(g.row("B", "CSE", g.next_person(), expected={"E401"}, **fl))
    for _ in range(2):
        b.append(g.row("B", "CSE", g.next_person(), expected={"E404"}, is_lateral_entry="Y", year_of_study="1"))
    for _ in range(2):
        b.append(g.row("B", "XYZ", g.next_person(), expected={"E304"}))
    for _ in range(2):
        p = g.next_person()
        d = date.fromisoformat(p["dob"])
        b.append(g.row("B", "CSE", p, expected={"E001"}, dob=d.strftime("%d/%m/%Y")))
    for p in g.r.sample(clean_b[:60], 3):
        b.append(g.row("B", "CSE", p))
    for i in range(14):
        b.append(g.row("B", "CSE", g.next_person(), **g.sn(**[{"is_fn": 1}, {"is_oci": 1}, {"is_nri": 1}][i % 3])))
    for _ in range(8):
        b.append(g.row("B", "CSE", g.next_person(), **g.sn(is_ciwg=1)))
    for _ in range(40):
        b.append(g.row("B", "ME", g.next_person(), declared_intake="90"))
    g.r.shuffle(b)
    files["B1.csv"] = b

    c = [g.row("C", "MBA", g.next_person()) for _ in range(116)]
    c += [g.row("C", "MBA", g.next_person(), expected={"E403"}, admission_date="2026-06-20") for _ in range(2)]
    g.r.shuffle(c)
    c += [g.row("C", "MBA", g.next_person(), expected={"E105"}, institution_student_id="") for _ in range(2)]
    c += [g.row("C", "MBA", g.next_person(), expected={"E205"}, institution_student_id=c[k]["raw"]["institution_student_id"])
          for k in (0, 1)]
    files["C1.csv"] = c

    files["D1.csv"] = [g.row("D", "CE", g.next_person(), expected={"E304"}) for _ in range(10)]

    for name in ("A1.csv", "B1.csv", "C1.csv", "D1.csv"):
        derive_positional(files[name])

    accepted_b = [r for r in files["B1.csv"] if r["prog"] == "CSE" and not r["static"] and r["raw"]["seat_category"] == "REGULAR"]
    b2 = [g.row("B", "CSE", {"apaar": r["raw"]["apaar_id"], "name": r["raw"]["student_name"], "dob": r["raw"]["dob"],
                             "guardian": r["raw"]["guardian_name"]}, expected={"E202"}) for r in accepted_b[:5]]
    b2 += [g.row("B", "ME", g.next_person()) for _ in range(3)]
    b2.append(g.row("B", "ME", g.next_person(), expected={"E205"},
                    institution_student_id=accepted_b[20]["raw"]["institution_student_id"]))
    files["B2.csv"] = b2

    post = accepted_b[10]["raw"]["apaar_id"]
    pre = accepted_b[11]["raw"]["apaar_id"]
    scenario = {"steps": [
        {"op": "set_deadline", "academic_year": "2026-27", "deadline": "2030-01-01T00:00:00+05:30"},
        {"op": "upload", "user": "inst-a", "file": "A1.csv"},
        {"op": "patch", "user": "inst-a", "apaar": withdrawn["apaar"],
         "body": {"status": "withdrawn", "ended_on": "2026-08-30", "reason": "Student withdrew"}, "expected": []},
        {"op": "patch", "user": "inst-a", "apaar": migrated["apaar"],
         "body": {"status": "migrated", "ended_on": "2026-08-30", "reason": "Migrated to another institution"}, "expected": []},
        {"op": "upload", "user": "inst-b", "file": "B1.csv"},
        {"op": "upload", "user": "inst-c", "file": "C1.csv"},
        {"op": "upload", "user": "inst-d", "file": "D1.csv"},
        {"op": "upload", "user": "inst-b", "file": "B2.csv"},
        {"op": "patch", "user": "inst-b", "apaar": pre,
         "body": {"status": "withdrawn", "ended_on": "2026-10-01", "reason": "Withdrawal before deadline"}, "expected": []},
        {"op": "set_deadline", "academic_year": "2026-27", "deadline": "2026-10-01T00:00:00+05:30"},
        {"op": "patch", "user": "inst-b", "apaar": post,
         "body": {"status": "withdrawn", "ended_on": "2026-09-01", "reason": "Backdated withdrawal"}, "expected": ["E501"]},
    ]}
    truth = [{"file": f, "row_no": i, "expected": sorted(r["static"])}
             for f, rows in files.items() for i, r in enumerate(rows, start=1)]
    registry = [{"apaar": p["apaar"], "name": p["name"], "dob": p["dob"]} for p in g.registry]
    return files, scenario, truth, registry


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    files, scenario, truth, registry = build(args.seed)
    out = ROOT / "synthetic"
    out.mkdir(exist_ok=True)
    for name, rows in files.items():
        with open(out / name, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
            w.writeheader()
            w.writerows(r["raw"] for r in rows)
    (out / "scenario.json").write_text(json.dumps(scenario, indent=1))
    (out / "ground_truth.json").write_text(json.dumps({"seed": args.seed, "rows": truth}, indent=0))
    (ROOT / "seed" / "apaar_registry.json").write_text(json.dumps(
        {"_note": "MOCK APAAR registry, synthetic people only", "people": registry}))
    counts = {}
    for t in truth:
        for c in t["expected"]:
            counts[c] = counts.get(c, 0) + 1
    print("rows:", len(truth), "labelled codes:", dict(sorted(counts.items())))


if __name__ == "__main__":
    main()
