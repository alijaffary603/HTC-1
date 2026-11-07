"""What the app calls. Reads the tables in outputs/, doesn't need the raw data.

    from gridskills.api import score
    score("teacher", "Red Deer")

Command line: python -m gridskills.api teacher "Red Deer"
"""
import json
import re
import sys
from functools import lru_cache

import pandas as pd

from .paths import OUTPUTS
from .regions import find_region

# everyday words -> NOC minor group. The computer scientist's résumé matcher should
# replace this, it only exists so typed searches work in the demo.
ALIASES = {
    "accountant": "1110", "actuary": "2121", "admin": "1311", "administrative assistant": "1311",
    "analyst": "4140", "auditor": "1110", "barista": "6520", "bookkeeper": "1220", "carpenter": "7231",
    "cashier": "6510", "chef": "6320", "cleaner": "6531", "cook": "6320", "data scientist": "2121",
    "dentist": "3111", "developer": "2123", "doctor": "3110", "electrician": "7220", "engineer": "2130",
    "graphic designer": "5212", "hr": "1120", "human resources": "1120", "lawyer": "4110", "lineman": "7220",
    "marketing": "1120", "mechanic": "7241", "nurse": "3130", "paramedic": "3210", "pharmacist": "3112",
    "physician": "3110", "pipefitter": "7230", "plumber": "7230", "police": "4210", "professor": "4120",
    "programmer": "2123", "realtor": "6310", "receptionist": "1410", "retail": "6410", "sales": "6410",
    "server": "6520", "social worker": "4130", "software": "2123", "teacher": "4122", "truck driver": "7330",
    "trucker": "7330", "waiter": "6520", "welder": "7210",
}


@lru_cache(maxsize=1)
def _tables():
    scores = pd.read_csv(OUTPUTS / "scores.csv", dtype={"code": str})
    adjacent = pd.read_csv(OUTPUTS / "adjacent_roles.csv", dtype={"code": str, "adjacent_code": str})
    drivers = pd.read_csv(OUTPUTS / "region_sector_tech_jobs.csv", dtype={"sector": str})
    return scores, adjacent, drivers


def occupations():
    scores, _, _ = _tables()
    titles = scores.drop_duplicates("code").sort_values("code")
    return [{"code": c, "title": t} for c, t in zip(titles.code, titles.title)]


def find_occupation(text):
    """Accepts a 4-digit NOC minor group, an alias, or words from the title."""
    scores, _, _ = _tables()
    titles = scores.groupby("code").agg(title=("title", "first"), workforce=("workforce", "sum"))
    query = text.strip().lower()

    if re.fullmatch(r"\d{4}", query):
        if query in titles.index:
            return query
        raise ValueError(f"no occupation with code {text}")
    singular = query[:-1] if query.endswith("s") else query
    for key in (query, singular):
        if key in ALIASES:
            return ALIASES[key]

    words = re.findall(r"[a-z]+", singular)
    hits = titles[titles.title.str.lower().apply(lambda t: all(w in t for w in words))]
    if hits.empty:
        raise ValueError(f"couldn't match {text!r} to an occupation, see occupations() for the list")
    # lots of titles can match one word, the biggest occupation is the safest guess
    return hits.workforce.idxmax()


def _top_technologies(drivers, region, code, occ_shares, limit=3):
    rows = drivers[drivers.region == region]
    jobs = rows.assign(here=rows.jobs * rows.sector.map(occ_shares).fillna(0)).groupby("tech").here.sum()
    jobs = jobs[jobs > 0].sort_values(ascending=False)
    total = jobs.sum()
    return [{"technology": t, "share": round(v / total, 3)} for t, v in jobs.head(limit).items()] if total else []


def score(occupation, region):
    """Everything the results page needs for one person. Raises ValueError on bad input."""
    scores, adjacent, drivers = _tables()
    code = find_occupation(occupation)
    place = find_region(region)
    row = scores[(scores.code == code) & (scores.region == place)].iloc[0]

    nearby = adjacent[(adjacent.code == code) & (adjacent.region == place)].sort_values("rank")
    lookup = scores[scores.region == place].set_index("code")
    roles = [
        {
            "code": a.adjacent_code,
            "title": lookup.title[a.adjacent_code],
            "closeness": float(a.closeness),
            "tailwind": round(float(lookup.tailwind_base[a.adjacent_code])),
        }
        for a in nearby.itertuples()
    ]

    # how many of each sector's new jobs would be this occupation, from the Alberta mix
    occ_shares = _occupation_shares(code)

    technologies = _top_technologies(drivers, place, code, occ_shares)

    caveats = []
    if row.thin_data:
        caveats.append("Few people do this job in this region, so treat these numbers as rough.")
    if technologies and technologies[0]["technology"] == "data_centre" and technologies[0]["share"] > 0.5:
        caveats.append("Most of this comes from data centres. None has connected to the Alberta grid yet, so it's the least certain part.")
    if not roles:
        caveats.append("No similar job nearby has a stronger outlook than this one.")

    return {
        "occupation": {"code": code, "title": row.title},
        "region": place,
        "tailwind": {
            "score": round(float(row.tailwind_base)),
            "range": [round(float(row.tailwind_low)), round(float(row.tailwind_high))],
            "added_jobs_per_year": {
                "low": round(float(row.added_jobs_low), 1),
                "base": round(float(row.added_jobs_base), 1),
                "high": round(float(row.added_jobs_high), 1),
            },
            "percent_of_workforce": round(float(row.pct_of_workforce_base), 2),
            "workforce": round(float(row.workforce)),
            "top_technologies": technologies,
        },
        "exposure": {
            "score": round(float(row.exposure)),
            "sector_growth_pct_per_year": round(float(row.sector_growth_pct), 2),
            "share_in_mining_oil_gas": round(float(row.resource_share), 3),
            "region_load_growth_pct_per_year": round(float(row.region_load_growth_pct), 2),
        },
        "adjacent_roles": roles,
        "caveats": caveats,
    }


@lru_cache(maxsize=256)
def _occupation_shares(code):
    table = pd.read_csv(OUTPUTS / "occupation_by_sector.csv", dtype={"code": str}, index_col="code")
    return table.loc[code].to_dict()


if __name__ == "__main__":
    print(json.dumps(score(sys.argv[1], sys.argv[2]), indent=2))
