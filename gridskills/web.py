"""Translate the offline scoring API to the web app contract."""
import csv
import json
from . import api
from .paths import OUTPUTS
from .regions import REGIONS, find_region

REGION_IDS = dict(zip(["4830", "4860", "4810", "4820", "4850", "4840", "4880"], REGIONS))
REGION_IDS["4870"] = REGION_IDS["4840"]


def resolve_region(value):
    return REGION_IDS[value] if value in REGION_IDS else find_region(value)


def resolve_occupation(value):
    # Unit-group codes entered by the UI aggregate to the model's minor groups.
    value = value.strip()
    if not value:
        raise ValueError("Choose an occupation first")
    return api.find_occupation(value[:4] if value.isdigit() and len(value) == 5 else value)


def model_score(occupation, region):
    return api.score(resolve_occupation(occupation), resolve_region(region))


def web_score(occupation, region):
    result = model_score(occupation, region)
    tailwind, exposure = result["tailwind"], result["exposure"]
    region_id = next(k for k, v in REGION_IDS.items() if v == result["region"])
    with (OUTPUTS / "regions.json").open() as stream:
        snapshot = json.load(stream)
    with (OUTPUTS / "projects.csv").open(newline="") as stream:
        projects = list(csv.DictReader(stream))
    drivers = []
    for project in projects:
        if project["region"] != result["region"] or not project["isd"][:4].isdigit():
            continue
        tech = project["tech"]
        if tech.startswith("storage"):
            tech = "storage"
        if tech not in {"solar", "wind", "storage", "gas", "data_centre", "industrial"}:
            continue
        drivers.append({"type": tech, "mw": float(project["mw"]),
                        "stage": {"early": "early_study", "approved": "approved", "construction": "under_construction"}.get(project["state"], "early_study"),
                        "probability": float(project["p_base"]), "inServiceYear": int(project["isd"][:4])})
    def role_range(role):
        evidence = model_score(role["code"], result["region"])["tailwind"]
        return {"low": evidence["range"][0], "base": evidence["score"], "high": evidence["range"][1]}

    return {
        "occupation": result["occupation"], "region": {"id": region_id, "name": result["region"]},
        "horizonYears": snapshot["horizon"][1] - snapshot["horizon"][0] + 1,
        "tailwind": {"range": {"low": tailwind["range"][0], "base": tailwind["score"], "high": tailwind["range"][1]},
                     "summary": "Estimated demand from energy projects, relative to other occupation-region pairs. This is not a hiring forecast."},
        "exposure": {"range": {"low": exposure["score"], "base": exposure["score"], "high": exposure["score"]},
                     "summary": "Historical industry exposure, shared across regions; not a probability of job loss."},
        "adjacentRoles": [{"occupation": {"code": role["code"], "title": role["title"]},
                           "similarity": role["closeness"], "tailwind": role_range(role),
                           "missingSkills": []} for role in result["adjacent_roles"]],
        "drivers": drivers, "confidence": "low", "modelVersion": snapshot["snapshot"],
        "caveats": result["caveats"], "jobTrend": result["job_trend"],
    }
