"""MOCK government adapters (PRD §12.4). Replace these classes to go live.
AICTE approvals (EOA intake, institution status) are the seeded registry tables in Postgres.
"""
import json
import os
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data/seed"


class MockApaarRegistry:
    source = "mock"

    def __init__(self, path: Path = DATA / "apaar_registry.json"):
        paths = [path] + ([Path(os.environ["WORLD_DIR"]) / "seed/apaar_registry.json"] if os.environ.get("WORLD_DIR") else [])
        self._by_id = {p["apaar"]: {"name": p["name"], "dob": p["dob"]} for f in paths for p in json.loads(f.read_text())["people"]}

    def lookup(self, apaar: str) -> dict | None:
        return self._by_id.get(apaar)


@lru_cache
def apaar_registry() -> MockApaarRegistry:
    return MockApaarRegistry()


MOCK_OTP = "123456"
