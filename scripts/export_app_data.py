"""Export the model's results for the frontend as static JSON.

Runs gridskills.api.score() for every occupation and region and writes:
  frontend/src/data/reference.json        occupations, aliases, regions, towns, province totals
  frontend/public/data/scores/<code>.json  {region: score(...)} for one occupation
  frontend/public/data/projects.json       projects waiting on AESO's list (for grid update previews)
  frontend/public/data/energy-map.json     map projects and regional occupation estimates

The app reads these files directly, so it needs no Python or server at request time.
Rerun after rebuilding outputs/ (python scripts/build_all.py):
  python scripts/export_app_data.py
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from gridskills.api import ALIASES, occupations, score  # noqa: E402
from gridskills.paths import OUTPUTS  # noqa: E402
from gridskills.regions import NORTHWEST, PLACES, REGIONS  # noqa: E402

FRONTEND = ROOT / "frontend"
REFERENCE = FRONTEND / "src" / "data" / "reference.json"
SCORES_DIR = FRONTEND / "public" / "data" / "scores"
PROJECTS = FRONTEND / "public" / "data" / "projects.json"

# Shorter names for sentences like "in the ___ region". Full names stay in `name`.
SHORT = {NORTHWEST: "Northwest Alberta"}


def display(region):
    return region.replace("-", "–")


def town_name(key):
    words = []
    for w in key.split():
        if w.startswith("mc") and len(w) > 2:
            words.append("Mc" + w[2:].capitalize())
        else:
            words.append(w.capitalize())
    return " ".join(words)


def main():
    overview = json.loads((OUTPUTS / "regions.json").read_text())
    by_region = {r["region"]: r for r in overview["by_region"]}

    regions = []
    for r in REGIONS:
        info = by_region.get(r, {})
        regions.append(
            {
                "id": r,
                "name": display(r),
                "short": SHORT.get(r, display(r)),
                "workforce": info.get("workforce"),
                "jobsPerYear": info.get("jobs_per_year"),
                "topTechnologies": [
                    {"technology": t, "jobs": j} for t, j in (info.get("top_technologies") or {}).items()
                ],
            }
        )

    towns = sorted(
        ({"name": town_name(k), "region": v} for k, v in PLACES.items() if k != "st albert"),
        key=lambda t: t["name"],
    )

    occs = occupations()
    reference = {
        "snapshot": overview["snapshot"],
        "horizon": overview["horizon"],
        "province": {
            "queuedMw": overview["queued_mw"],
            "expectedMwBase": overview["expected_mw_base"],
            "jobsPerYear": overview["jobs_per_year"],
        },
        "occupations": occs,
        "aliases": ALIASES,
        "regions": regions,
        "towns": towns,
    }
    REFERENCE.parent.mkdir(parents=True, exist_ok=True)
    REFERENCE.write_text(json.dumps(reference, ensure_ascii=False, indent=1) + "\n")

    SCORES_DIR.mkdir(parents=True, exist_ok=True)
    for old in SCORES_DIR.glob("*.json"):
        old.unlink()
    for occ in occs:
        per_region = {r: score(occ["code"], r) for r in REGIONS}
        (SCORES_DIR / f"{occ['code']}.json").write_text(json.dumps(per_region, ensure_ascii=False, separators=(",", ":")))

    with open(OUTPUTS / "projects.csv", newline="") as f:
        projects = [
            {
                "projectId": r["project_id"],
                "name": r["name"].strip() or r["project_id"],
                "tech": r["tech"],
                "region": r["region"],
                "mw": round(float(r["mw"] or 0), 1),
                "isd": r["isd"] or "",
                "state": r["state"],
                "likelihood": round(float(r["p_base"] or 0), 2),
            }
            for r in csv.DictReader(f)
        ]
    PROJECTS.write_text(json.dumps(projects, ensure_ascii=False, separators=(",", ":")))

    from export_map_data import export_map_data
    export_map_data()

    print(f"{len(occs)} occupations x {len(REGIONS)} regions, {len(towns)} towns, {len(projects)} projects")
    print(f"wrote {REFERENCE.relative_to(ROOT)} and {SCORES_DIR.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
