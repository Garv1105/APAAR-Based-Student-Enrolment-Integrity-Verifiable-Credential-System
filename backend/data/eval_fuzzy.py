import itertools
import json
import sys
from collections import defaultdict
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND.parent))
from app.validation import probable_same_person  # noqa: E402
from synthetic.selfcheck import canon, read_batch  # noqa: E402


def evaluate(root: Path) -> dict:
    man = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    truth = json.loads((root / "ground_truth.json").read_text(encoding="utf-8"))
    by_dob = defaultdict(list)
    for b in man["batches"]:
        for n, raw in enumerate(read_batch(root, b), 1):
            r = canon(raw, b["dialect"])
            if r["status"] == "active" and r["dob"]:
                by_dob[r["dob"]].append({"key": (b["file"], n), "inst": b["institution_id"], "apaar": r["apaar"],
                                         "name": r["name"], "dob": r["dob"].isoformat(), "guardian": r["guardian"] or None})
    flagged = set()
    for rows in by_dob.values():
        for a, b in itertools.combinations(rows, 2):
            if a["inst"] != b["inst"] and not (a["apaar"] and b["apaar"]) and probable_same_person(a, b):
                flagged.add(frozenset((a["key"], b["key"])))
    pair = lambda g: frozenset((m["file"], m["row"]) for m in g["members"])  # noqa: E731
    labelled = {pair(g) for g in truth["duplicate_groups"] if g["code"] == "E204"}
    must_not = {pair(g) for g in truth["negatives"]}
    hits = flagged & labelled
    return {"labelled": len(labelled), "flagged": len(flagged), "correct": len(hits),
            "recall": len(hits) / max(1, len(labelled)), "precision": len(hits) / max(1, len(flagged)),
            "negatives_flagged": len(flagged & must_not)}


if __name__ == "__main__":
    print(evaluate(Path(sys.argv[1])))
