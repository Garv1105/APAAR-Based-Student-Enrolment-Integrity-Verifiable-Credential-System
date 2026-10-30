import json
from functools import lru_cache
from pathlib import Path

DIR = Path(__file__).resolve().parent.parent / "i18n"


@lru_cache
def catalogue(locale: str) -> dict:
    p = DIR / f"{locale}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def render(code: str, params: dict | None, locale: str = "en") -> dict:
    entry = catalogue(locale).get(code) or catalogue("en")[code]
    p = {"field": "", "detail": "", **(params or {})}
    return {"title": entry.get("title") or catalogue("en")[code]["title"], "message": entry["template"].format(**p),
            "fix_hint": entry["fix_hint"]}
