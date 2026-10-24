"""Give a generated world's colleges realistic but fictional names (founder/trust name + type + real city).

    .venv\\Scripts\\python.exe tools/rename_world.py --dir <world>               rewrite <world>/seed/registry.json
    .venv\\Scripts\\python.exe tools/rename_world.py --dir <world> --update-db   also rename an already-loaded database

The first run keeps the original as registry.json.orig; later runs start from it, so the names are stable (same seed,
same names). Only institution names and account display names change; ids, states and data stay as they are.
--update-db writes institutions, users and the trust registry of APAAR_DB (default apaar) as the admin role.
Names are invented; a real college could still share one by chance (no registry of real names is checked).
"""
import argparse
import json
import random
import shutil
import sys
from pathlib import Path

CITIES = {
    "Tamil Nadu": ["Madurai", "Tiruchirappalli", "Salem", "Erode", "Vellore", "Tirunelveli", "Thanjavur", "Karur", "Namakkal",
                   "Dindigul", "Kumbakonam", "Hosur", "Pollachi", "Sivakasi"],
    "Maharashtra": ["Nashik", "Aurangabad", "Solapur", "Kolhapur", "Amravati", "Akola", "Jalgaon", "Sangli", "Latur",
                    "Nanded", "Satara", "Ahmednagar", "Wardha", "Baramati"],
    "Uttar Pradesh": ["Kanpur", "Agra", "Bareilly", "Aligarh", "Moradabad", "Gorakhpur", "Jhansi", "Meerut", "Mathura",
                      "Sitapur", "Etawah", "Azamgarh", "Saharanpur", "Firozabad"],
    "Karnataka": ["Hubballi", "Belagavi", "Davanagere", "Ballari", "Tumakuru", "Shivamogga", "Kalaburagi", "Hassan",
                  "Udupi", "Vijayapura", "Mandya", "Chitradurga"],
    "Rajasthan": ["Jodhpur", "Kota", "Bikaner", "Ajmer", "Udaipur", "Bhilwara", "Alwar", "Sikar", "Pali", "Sri Ganganagar"],
    "Andhra Pradesh": ["Guntur", "Nellore", "Kurnool", "Rajahmundry", "Kakinada", "Kadapa", "Anantapur", "Ongole", "Eluru",
                       "Chittoor"],
    "Telangana": ["Warangal", "Karimnagar", "Nizamabad", "Khammam", "Nalgonda", "Mahabubnagar", "Siddipet", "Adilabad"],
    "Bihar": ["Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia", "Arrah", "Begusarai", "Chapra", "Sasaram"],
    "Madhya Pradesh": ["Indore", "Jabalpur", "Gwalior", "Ujjain", "Sagar", "Rewa", "Satna", "Ratlam", "Dewas"],
    "Kerala": ["Kollam", "Thrissur", "Kannur", "Palakkad", "Kottayam", "Alappuzha", "Malappuram", "Kasaragod"],
}
SOUTH = ["Tamil Nadu", "Karnataka", "Andhra Pradesh", "Telangana", "Kerala"]
FOUNDERS = {
    "Tamil Nadu": (["Ramalingam", "Sundaresan", "Meenakshi", "Arumugam", "Senthil", "Valliammai", "Chidambaram", "Ponnusamy"],
                   ["Pillai", "Mudaliar", "Chettiar", "Gounder", "Nadar", "Iyer"]),
    "Kerala": (["Gopalan", "Lakshmikutty", "Raghavan", "Madhavi", "Sreedharan", "Kunjamma"], ["Nair", "Menon", "Pillai", "Kurup"]),
    "Karnataka": (["Kalyani Devi", "Basavaraj", "Siddappa", "Shantamma", "Mallikarjun", "Veerabhadra"],
                  ["Hegde", "Patil", "Gowda", "Shetty", "Kamath", "Desai"]),
    "Andhra Pradesh": (["Venkata Subbaiah", "Kotaiah", "Ramanamma", "Seshagiri", "Narasimha"], ["Naidu", "Reddy", "Chowdary", "Raju"]),
    "Telangana": (["Lakshma", "Narsimha", "Yadagiri", "Sammaiah", "Pochamma"], ["Reddy", "Rao", "Goud", "Yadav"]),
    "Maharashtra": (["Anandrao", "Shankarrao", "Vasantdada", "Sumatibai", "Dattatray", "Bhausaheb", "Kamalabai"],
                    ["Kulkarni", "Deshmukh", "Jadhav", "Shinde", "Pawar", "Bhosale", "Joshi"]),
    "NORTH": (["Saraswati Narain", "Ram Lakhan", "Jagdish Prasad", "Kamla Devi", "Shiv Charan", "Hari Shankar", "Gyanvati",
               "Brij Mohan", "Rameshwar Dayal", "Sushila Devi"],
              ["Sinha", "Mishra", "Agarwal", "Tiwari", "Shukla", "Srivastava", "Chaturvedi", "Rathore", "Bhargava"]),
}
KINDS = {  # type word in the generated name -> realistic name endings
    "Technology": ["Institute of Technology", "College of Engineering", "Institute of Engineering and Technology",
                   "College of Engineering and Technology"],
    "Polytechnic": ["Polytechnic", "Polytechnic College", "Institute of Diploma Studies"],
    "Management": ["Institute of Management Studies", "School of Business", "Institute of Management and Research"],
    "Pharmacy": ["College of Pharmacy", "Institute of Pharmaceutical Sciences"],
}


def kind_of(name: str) -> str:
    return next((k for k in KINDS if k in name), "Technology")


def new_name(rng: random.Random, state: str, old: str, taken: set[str]) -> str:
    firsts, lasts = FOUNDERS.get(state) or FOUNDERS["NORTH" if state not in SOUTH else "Karnataka"]
    cities = CITIES.get(state, ["Nagpur", "Bhopal", "Raipur"])
    for _ in range(1000):
        founder = f"{rng.choice(firsts)} {rng.choice(lasts)}" if rng.random() < 0.75 else f"{rng.choice(firsts)} Memorial"
        name = f"{founder} {rng.choice(KINDS[kind_of(old)])}, {rng.choice(cities)}"
        if name not in taken:
            taken.add(name)
            return name
    raise SystemExit(f"ran out of unique names for {state}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="world folder holding seed/registry.json")
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--update-db", action="store_true", help="also rename institutions in APAAR_DB (already loaded)")
    a = ap.parse_args()
    reg = Path(a.dir) / "seed" / "registry.json"
    orig = reg.with_name("registry.json.orig")
    if not orig.exists():
        shutil.copyfile(reg, orig)
    w = json.loads(orig.read_text(encoding="utf-8"))
    rng, taken = random.Random(a.seed), set()
    names = {i["id"]: new_name(rng, i["state"], i["name"], taken) for i in w["institutions"]}
    for i in w["institutions"]:
        i["name"] = names[i["id"]]
    for u in w["users"]:
        if u.get("institution_id") in names:
            u["display_name"] = f"Institution Admin, {names[u['institution_id']]}"
    reg.write_text(json.dumps(w, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"renamed {len(names)} colleges in {reg}")
    for iid in list(names)[:5]:
        print(f"  {iid}  {names[iid]}")

    if a.update_db:
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
        from app import db
        with db.connect() as c:
            for iid, n in names.items():
                c.execute("UPDATE institutions SET name=%s WHERE id=%s", (n, iid))
                c.execute("UPDATE users SET display_name=%s WHERE institution_id=%s AND role='institution_admin'",
                          (f"Institution Admin, {n}", iid))
                c.execute("UPDATE issuer_registry SET name=%s WHERE institution_id=%s", (n, iid))
        print(f"updated {db.DB_NAME}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
