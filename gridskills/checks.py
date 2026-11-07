"""Sanity checks run before a monthly build is published.

AESO has changed its file format three times since 2023. When it happens again the
parser may quietly produce nonsense, so a build that fails any of these stays
unpublished and the app keeps serving last month's numbers.
"""
import json

import pandas as pd

from .paths import OUTPUTS
from .regions import REGIONS

OCCUPATIONS = 162
MIN_PROJECTS = 100
# month to month the base job estimate shouldn't jump by more than this factor
MAX_SWING = 3.0


def check_outputs(outputs=OUTPUTS, previous_meta=None):
    """Returns a list of problems. Empty means safe to publish."""
    problems = []
    scores = pd.read_csv(outputs / "scores.csv", dtype={"code": str})
    meta = json.loads((outputs / "regions.json").read_text())
    projects = pd.read_csv(outputs / "projects.csv")

    expected = OCCUPATIONS * len(REGIONS)
    if len(scores) != expected:
        problems.append(f"scores.csv has {len(scores)} rows, expected {expected}")
    for col in ("tailwind_low", "tailwind_base", "tailwind_high", "exposure", "job_trend"):
        if scores[col].isna().any():
            problems.append(f"{col} has missing values")
        elif not scores[col].between(0, 100).all():
            problems.append(f"{col} is outside 0-100")
    if not (scores.tailwind_low <= scores.tailwind_base + 1e-9).all() or not (
        scores.tailwind_base <= scores.tailwind_high + 1e-9
    ).all():
        problems.append("tailwind low/base/high are out of order")
    if len(projects) < MIN_PROJECTS:
        problems.append(f"only {len(projects)} projects scored, the parser may have broken")

    jobs = meta["jobs_per_year"]["base"]
    if jobs <= 0:
        problems.append("no jobs at all in the base case")
    if previous_meta:
        before = previous_meta.get("jobs_per_year_base")
        if before and not (before / MAX_SWING <= jobs <= before * MAX_SWING):
            problems.append(f"base jobs moved from {before} to {jobs}, more than {MAX_SWING}x")
        if previous_meta.get("snapshot", "") > meta["snapshot"]:
            problems.append(f"snapshot {meta['snapshot']} is older than the published {previous_meta['snapshot']}")
    return problems


def check_bundle(bundle):
    problems = []
    expected = OCCUPATIONS * len(REGIONS)
    if len(bundle["responses"]) != expected:
        problems.append(f"bundle has {len(bundle['responses'])} responses, expected {expected}")
    return problems
