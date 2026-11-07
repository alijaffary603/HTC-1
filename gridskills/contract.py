"""Turns the model's outputs into the exact responses the web app expects.

The app's types live in frontend/src/types.ts. Everything here is precomputed once a
month, so the API only has to look answers up.
"""
import json
from datetime import datetime, timezone

import pandas as pd

from . import api
from .paths import OUTPUTS
from .regions import ECONOMIC_REGIONS, MERGED_NOTE

HORIZON_YEARS = 3
ALIS = {"title": "Find programs for this on ALIS", "provider": "Government of Alberta", "url": "https://alis.alberta.ca/"}

DRIVER_TYPE = {
    "solar": "solar", "solar_storage": "solar", "wind": "wind", "wind_storage": "wind",
    "storage": "storage", "storage_long": "storage", "gas": "gas", "cogen": "gas", "other_gen": "other",
    "data_centre": "data_centre", "industrial_load": "industrial", "distribution_load": "grid",
}


def tailwind_summary(score):
    if score >= 70:
        return "Planned energy projects could add noticeable demand for this job here."
    if score >= 40:
        return "Planned energy projects could add some demand for this job here."
    return "Planned energy projects won’t change much for this job here."


def exposure_summary(score):
    if score >= 70:
        return "This job leans on sectors that have grown slowly or on mining, oil and gas."
    if score >= 40:
        return "Some of the sectors this job sits in have grown slowly."
    return "This job sits mostly in sectors that have been growing."


def trend_summary(growth):
    if abs(growth) < 0.25:
        return "This kind of job held about steady here from 2017-19 to 2023-25."
    direction = "grew" if growth > 0 else "shrank"
    return f"This kind of job {direction} about {abs(growth):.1f}% a year here from 2017-19 to 2023-25."


def confidence(row):
    width = row.tailwind_high - row.tailwind_low
    if row.thin_data or width > 60:
        return "low"
    return "medium" if width > 30 else "high"


def _range(low, base, high, digits=0):
    r = lambda v: round(float(v), digits) if digits else round(float(v))
    return {"low": r(low), "base": r(base), "high": r(high)}


def drivers_by_region(projects, limit=6):
    out = {}
    for region, g in projects.groupby("region"):
        top = g.sort_values("jobs_per_year", ascending=False).head(limit)
        out[region] = [
            {
                "name": p.name,
                "type": DRIVER_TYPE.get(p.tech, "other"),
                "mw": round(float(p.mw)),
                "stage": p.state,
                "probability": round(float(p.p_base), 2),
                "inServiceYear": int(str(p.isd)[:4]),
            }
            for p in top.itertuples()
        ]
    return out


def missing_skills(source_code, target_code, skills):
    """Core and helpful skills of the target job that the source job doesn't list."""
    if not skills or target_code not in skills:
        return []
    have = {s["skill"].lower() for s in skills.get(source_code, [])}
    return [
        {"skill": s["skill"], "importance": s["importance"], "resources": [ALIS]}
        for s in skills[target_code]
        if s["skill"].lower() not in have
    ][:4]


def build(outputs=OUTPUTS, skills=None):
    """Every response the API can give, keyed '<code>|<region id>'."""
    regions_meta = json.loads((outputs / "regions.json").read_text())
    scores = pd.read_csv(outputs / "scores.csv", dtype={"code": str})
    projects = pd.read_csv(outputs / "projects.csv")
    drivers = drivers_by_region(projects)
    snapshot = regions_meta["snapshot"]
    version = f"aeso-{snapshot[:7]}"
    lookup = scores.set_index(["region", "code"])

    responses = {}
    for row in scores.itertuples():
        raw = api.score(row.code, row.region)
        for region_id, (name, model_region) in ECONOMIC_REGIONS.items():
            if model_region != row.region:
                continue
            adjacent = []
            for a in raw["adjacent_roles"]:
                target = lookup.loc[(row.region, a["code"])]
                adjacent.append({
                    "occupation": {"code": a["code"], "title": a["title"]},
                    "similarity": a["closeness"],
                    "tailwind": _range(target.tailwind_low, target.tailwind_base, target.tailwind_high),
                    "missingSkills": missing_skills(row.code, a["code"], skills),
                })
            caveats = list(raw["caveats"])
            if region_id in ("4840", "4870"):
                caveats.append(MERGED_NOTE)
            t = raw["tailwind"]
            trend = raw["job_trend"]
            exposure = raw["exposure"]
            responses[f"{row.code}|{region_id}"] = {
                "occupation": raw["occupation"],
                "region": {"id": region_id, "name": name},
                "horizonYears": HORIZON_YEARS,
                "tailwind": {
                    "range": _range(row.tailwind_low, row.tailwind_base, row.tailwind_high),
                    "summary": tailwind_summary(row.tailwind_base),
                },
                "exposure": {
                    "range": _range(row.exposure, row.exposure, row.exposure),
                    "summary": exposure_summary(row.exposure),
                },
                "jobTrend": {
                    "score": trend["score"],
                    "summary": trend_summary(trend["growth_pct_per_year"]),
                    "growthPctPerYear": trend["growth_pct_per_year"],
                    "occupationGrowthPctPerYearAlberta": trend["occupation_growth_pct_per_year_alberta"],
                    "regionEmploymentGrowthPctPerYear": trend["region_employment_growth_pct_per_year"],
                    "period": trend["period"],
                    "basedOnGroup": trend["based_on_group"],
                },
                "addedJobsPerYear": t["added_jobs_per_year"],
                "percentOfWorkforce": t["percent_of_workforce"],
                "workforce": t["workforce"],
                "topTechnologies": t["top_technologies"],
                "exposureDetail": {
                    "sectorGrowthPctPerYear": exposure["sector_growth_pct_per_year"],
                    "shareInMiningOilGas": exposure["share_in_mining_oil_gas"],
                },
                "adjacentRoles": adjacent,
                "drivers": drivers.get(row.region, []),
                "confidence": confidence(row),
                "caveats": caveats,
                "modelVersion": version,
            }
    meta = {
        "snapshot": snapshot,
        "modelVersion": version,
        "horizon": list(regions_meta["horizon"]),
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "responses": len(responses),
        "skillsIncluded": bool(skills),
    }
    return {"meta": meta, "responses": responses}


def summary(bundle):
    """The few numbers the monthly alert email compares, keyed like the responses."""
    return {
        key: {
            "tailwind": r["tailwind"]["range"]["base"],
            "jobTrend": r["jobTrend"]["score"],
            "exposure": r["exposure"]["range"]["base"],
            "title": r["occupation"]["title"],
            "region": r["region"]["name"],
        }
        for key, r in bundle["responses"].items()
    }
