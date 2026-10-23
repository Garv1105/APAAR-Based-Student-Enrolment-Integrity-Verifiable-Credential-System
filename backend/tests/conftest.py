import os
import sys
import tempfile
from pathlib import Path

# Tests use a throwaway key file so they never touch the demo keys.
os.environ.setdefault("APAAR_KEY_FILE", str(Path(tempfile.mkdtemp()) / "keys.json"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
