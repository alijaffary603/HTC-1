"""Rebuild everything in outputs/ from the raw data. Takes a couple of minutes.

Needs data/processed/census_alberta.parquet, see scripts/extract_census.py.
"""
import json

import pandas as pd

from gridskills import completion, jobs, labour, load, multipliers, project_list, scores
from gridskills.params import load_assumptions
from gridskills.paths import OUTPUTS, PROCESSED, PROJECT_LISTS
from gridskills.regions import REGIONS


def build_inputs():
    panel = project_list.read_all(PROJECT_LISTS)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    panel.to_parquet(PROCESSED / "panel.parquet", index=False)
    clean = completion.add_features(completion.clean_panel(panel))
    census = labour.load_census()
    lfs = labour.load_lfs_industry()
    yearly = load.build_yearly()
    return dict(
        panel=panel, clean=clean, census=census, lfs=lfs, yearly=yearly,
        mult=multipliers.load(),
        assumptions=load_assumptions(),
    )


def run_scenarios(inputs, overrides_by_scenario=None, en=None):
    a = inputs["assumptions"]
    census = inputs["census"]
    region_emp = labour.region_totals(inputs["lfs"], 2025)
    shares = (region_emp / region_emp.sum()).to_dict()
    sector_emp = labour.sector_employment(census)
    out = {}
    for scenario in ("low", "base", "high"):
        o = (overrides_by_scenario or {}).get(scenario)
        pj = jobs.project_jobs(en, inputs["mult"], a, scenario, o)
        out[scenario] = jobs.to_sectors(pj, sector_emp, a, shares, o)
    return out


def main():
    inputs = build_inputs()
    a, clean, census, lfs = inputs["assumptions"], inputs["clean"], inputs["census"], inputs["lfs"]

    model = completion.fit_logit(clean)
    chain = completion.fit_chain(clean, window=24)
    open_rows = jobs.score_projects(jobs.open_projects(clean), model, chain, a)
    en = jobs.energizations(open_rows, a)
    en.to_parquet(PROCESSED / "energizations.parquet", index=False)

    scenario_jobs = run_scenarios(inputs, en=en)

    occ_sector = labour.occupation_given_sector(census)
    sector_occ = labour.sector_given_occupation(census)
    employment = labour.region_occupation_employment(census, lfs)
    titles = labour.occupation_titles(census)

    tw = scores.tailwind(scenario_jobs, occ_sector, employment)
    momentum = labour.sector_momentum(lfs)
    growth = load.region_growth(inputs["yearly"])
    exp = scores.exposure(sector_occ, momentum, growth, REGIONS)
    adj = scores.adjacent_roles(sector_occ, tw)
    by_region, overall = labour.employment_growth(lfs)
    trend = scores.job_trend(labour.occupation_trend(lfs, titles.index), by_region, overall, REGIONS)

    table = tw.merge(exp, on=["region", "code"]).merge(trend, on=["region", "code"])
    table.insert(2, "title", table.code.map(titles))
    table["thin_data"] = table.workforce < scores.THIN_WORKFORCE

    OUTPUTS.mkdir(exist_ok=True)
    table.round(3).to_csv(OUTPUTS / "scores.csv", index=False)
    adj.to_csv(OUTPUTS / "adjacent_roles.csv", index=False)
    occ_sector.round(5).to_csv(OUTPUTS / "occupation_by_sector.csv")

    # what's behind each region's number, for the "why" panel
    base = scenario_jobs["base"]
    drivers = base.groupby(["region", "sector", "tech"], as_index=False).jobs.sum().round(3)
    drivers.to_csv(OUTPUTS / "region_sector_tech_jobs.csv", index=False)

    # one row per project for the map and for sanity checking
    pj = jobs.project_jobs(en, inputs["mult"], a, "base")
    by_project = pj.groupby("project_id").jobs.sum().rename("jobs_per_year")
    projects = (
        en.groupby("project_id")
        .agg(name=("name", "first"), tech=("tech", "first"), region=("region", "first"), pa_code=("pa_code", "first"),
             mw=("mw", "sum"), isd=("isd", "min"), state=("state", "first"),
             p_low=("p_low", "first"), p_base=("p_base", "first"), p_high=("p_high", "first"))
        .join(by_project)
        .reset_index()
        .sort_values("jobs_per_year", ascending=False)
    )
    projects["expected_mw"] = projects.mw * projects.p_base
    projects["isd"] = projects.isd.dt.strftime("%Y-%m")
    projects.round(3).to_csv(OUTPUTS / "projects.csv", index=False)

    jobs.jobs_per_mw(inputs["mult"], a).to_csv(OUTPUTS / "jobs_per_mw.csv", index=False)

    summary = {
        "snapshot": str(clean.snapshot.max().date()),
        "horizon": [a["horizon_start"], a["horizon_end"]],
        "jobs_per_year": {s: round(j.jobs.sum()) for s, j in scenario_jobs.items()},
        "queued_mw": round(en.mw.sum()),
        "expected_mw_base": round((en.mw * en.p_base).sum()),
        "by_region": [],
    }
    workforce = labour.region_totals(lfs, 2025)
    for region in REGIONS:
        counts = {s: j[j.region == region].jobs.sum() for s, j in scenario_jobs.items()}
        techs = base[base.region == region].groupby("tech").jobs.sum().sort_values(ascending=False)
        summary["by_region"].append({
            "region": region,
            "workforce": round(workforce[region]),
            "jobs_per_year": {s: round(v) for s, v in counts.items()},
            "pct_of_workforce_base": round(counts["base"] / workforce[region] * 100, 3),
            "load_growth_pct_2019_2025": round(float(growth[region]), 2),
            "top_technologies": {k: round(v) for k, v in techs.head(4).items()},
        })
    (OUTPUTS / "regions.json").write_text(json.dumps(summary, indent=2))

    # real responses the front end can build against
    from gridskills.api import score
    people = [("teacher", "Red Deer"), ("electrician", "Fort Saskatchewan"), ("retail", "Calgary"),
              ("accountant", "Lethbridge"), ("8310", "Grande Prairie")]
    samples = [score(job, place) for job, place in people]
    (OUTPUTS / "sample_scores.json").write_text(json.dumps(samples, indent=2))

    print(json.dumps({k: v for k, v in summary.items() if k != "by_region"}, indent=2))
    print(pd.DataFrame(summary["by_region"]).drop(columns="top_technologies").to_string())


if __name__ == "__main__":
    main()
