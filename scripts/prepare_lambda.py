"""Prepare only the files needed by the Lambda; excludes raw data and secrets."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "deployment" / "package"
DEST.mkdir(parents=True, exist_ok=True)
for directory, pattern in (("gridskills", "*.py"), ("outputs", "*.csv"), ("outputs", "*.json"), ("config", "advisor_*.json")):
    (DEST / directory).mkdir(exist_ok=True)
    for source in (ROOT / directory).glob(pattern):
        shutil.copy2(source, DEST / directory / source.name)
(DEST / "requirements.txt").write_text("pandas>=2.2,<4\n", encoding="utf-8")
print(f"Lambda source prepared at {DEST}")
