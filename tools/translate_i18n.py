"""One-time translation of backend/i18n/en.json into another language with Gemini (through backend/app/ai.py).

    .venv\\Scripts\\python.exe tools/translate_i18n.py --locale hi --language Hindi

Only the message templates are sent (no data). Every field is checked: the {field}/{detail} placeholders, column names,
codes and fixed words (APAAR, YYYY-MM-DD, ...) must survive unchanged, otherwise that field stays in English. The output
is marked machine-translated: have a native speaker review it before relying on it.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app import ai  # noqa: E402

I18N = Path(__file__).resolve().parent.parent / "backend/i18n"
FIELDS = ("title", "template", "fix_hint")
KEEP = re.compile(r"\{[a-z]+\}|\b[a-z]+_[a-z_]+\b|\b[A-Z][A-Z_]{2,}\b|YYYY-MM-DD|DigiLocker")


def protected(text: str) -> set[str]:
    return set(KEEP.findall(text))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--locale", required=True, help="file name, e.g. hi")
    ap.add_argument("--language", required=True, help="language name for the model, e.g. Hindi")
    a = ap.parse_args()
    if not ai.enabled():
        sys.exit("GEMINI_API_KEY is not set (backend/.env)")
    en = json.loads((I18N / "en.json").read_text(encoding="utf-8"))
    entries = {k: {f: v[f] for f in FIELDS} for k, v in en.items() if not k.startswith("_")}
    got = ai.translate_catalogue(entries, a.language)
    if not got:
        sys.exit("Gemini returned no usable translation (free-tier limit or error); try again later")
    out, kept_english = {"_locale": a.locale, "_note": f"Machine-translated into {a.language} with Gemini; review by a native speaker "
                                                     "before production use. Fields that failed the checks stay in English."}, []
    for code, src in entries.items():
        tr = got.get(code) if isinstance(got.get(code), dict) else {}
        row = {}
        for f in FIELDS:
            t = tr.get(f) if isinstance(tr.get(f), str) and tr.get(f).strip() else None
            if t is None or not protected(src[f]) <= protected(t) or protected(t) - protected(src[f]) & {"{field}", "{detail}"}:
                kept_english.append(f"{code}.{f}")
                t = src[f]
            row[f] = t
        out[code] = row
    (I18N / f"{a.locale}.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {a.locale}.json: {len(entries)} codes, {len(kept_english)} field(s) kept in English {kept_english or ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
