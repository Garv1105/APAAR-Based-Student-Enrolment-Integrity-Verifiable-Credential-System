"""Vercel Python entry: the FastAPI app from backend/. vercel.json routes /v1, /status, /dids and /healthz here."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402,F401
