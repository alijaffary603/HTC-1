"""What the API serves: gridskills.api.score() for every occupation and region.

The web app's ModelScore type (frontend/src/types.ts) is exactly score()'s output,
so this just runs it for all 162 x 7 pairs once a month. The API then only has to
look answers up.
"""
import json
from datetime import datetime, timezone

import pandas as pd

from . import api
from .paths import OUTPUTS
from .regions import REGIONS


def build(outputs=OUTPUTS):
    """Every response, keyed '<4-digit code>|<model region name>'."""
    meta_in = json.loads((outputs / "regions.json").read_text())
    codes = pd.read_csv(outputs / "scores.csv", dtype={"code": str}).code.unique()
    responses = {f"{code}|{region}": api.score(code, region) for code in codes for region in REGIONS}
    meta = {
        "snapshot": meta_in["snapshot"],
        "modelVersion": f"aeso-{meta_in['snapshot'][:7]}",
        "horizon": meta_in["horizon"],
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "responses": len(responses),
    }
    return {"meta": meta, "responses": responses}


def summary(bundle):
    """The few numbers the monthly alert email compares, keyed like the responses."""
    return {
        key: {
            "tailwind": r["tailwind"]["score"],
            "jobTrend": r["job_trend"]["score"],
            "exposure": r["exposure"]["score"],
            "title": r["occupation"]["title"],
            "region": r["region"],
        }
        for key, r in bundle["responses"].items()
    }
