"""Turn jobs by sector into the numbers people see: tailwind, exposure, adjacent roles."""
import numpy as np
import pandas as pd

# judgement: weights on the exposure components, documented in docs/methodology.md
EXPOSURE_WEIGHTS = {"sector_trend": 0.6, "resource_reliance": 0.4}
RESOURCE_SECTORS = ["21"]
THIN_WORKFORCE = 500
THIN_TREND_GROUP = 15000  # survey estimates for smaller groups jump around from year to year


def jobs_by_occupation(sector_jobs, occ_given_sector):
    """region x occupation matrix of jobs per year."""
    wide = sector_jobs.groupby(["region", "sector"]).jobs.sum().unstack("sector").fillna(0)
    wide = wide.reindex(columns=occ_given_sector.columns, fill_value=0)
    return wide.dot(occ_given_sector.T)


def percentile_rank(values):
    return values.rank(pct=True) * 100


def score_against(values, reference):
    """Where each value would sit in the reference distribution, 0-100."""
    ref = np.sort(reference.to_numpy())
    return pd.Series(np.searchsorted(ref, values.to_numpy(), side="right") / len(ref) * 100, index=values.index)


def tailwind(scenario_jobs, occ_given_sector, employment):
    """Long table with added jobs and percent of workforce under each scenario."""
    frames = []
    for scenario, sector_jobs in scenario_jobs.items():
        j = jobs_by_occupation(sector_jobs, occ_given_sector)
        long = j.stack().rename("added_jobs").reset_index()
        long.columns = ["region", "code", "added_jobs"]
        long["scenario"] = scenario
        frames.append(long)
    df = pd.concat(frames, ignore_index=True)
    workforce = employment.stack().rename("workforce").reset_index()
    workforce.columns = ["code", "region", "workforce"]
    df = df.merge(workforce, on=["region", "code"], how="left")
    df["pct_of_workforce"] = df.added_jobs / df.workforce.replace(0, np.nan) * 100

    wide = df.pivot(index=["region", "code"], columns="scenario", values=["added_jobs", "pct_of_workforce"])
    wide.columns = [f"{a}_{b}" for a, b in wide.columns]
    wide = wide.join(df[df.scenario == "base"].set_index(["region", "code"]).workforce)
    reference = wide.pct_of_workforce_base.fillna(0)
    for s in ("low", "base", "high"):
        wide[f"tailwind_{s}"] = score_against(wide[f"pct_of_workforce_{s}"].fillna(0), reference)
    return wide.reset_index()


def exposure(sector_given_occ, momentum, load_growth, regions):
    """Long table of exposure for each occupation and region.

    sector_trend:      Alberta employment growth of the sectors this job sits in
    resource_reliance: share of the job's workers in mining, oil and gas

    Each is ranked 0-100 with higher meaning more exposed, then weighted. It's a score
    about the job rather than the place, so it's the same in every region. Regional load
    growth gets passed through for display only: it showed no link to employment.
    """
    from .labour import LFS_GROUP

    columns = [c for c in sector_given_occ.columns if c in LFS_GROUP]
    by_sector = pd.Series({c: momentum[LFS_GROUP[c]] for c in columns})
    jobs = pd.DataFrame({
        "code": sector_given_occ.index,
        "sector_growth_pct": sector_given_occ[columns].dot(by_sector).to_numpy(),
        "resource_share": sector_given_occ[[c for c in RESOURCE_SECTORS if c in sector_given_occ]].sum(axis=1).to_numpy(),
    })
    combined = (
        EXPOSURE_WEIGHTS["sector_trend"] * percentile_rank(-jobs.sector_growth_pct)
        + EXPOSURE_WEIGHTS["resource_reliance"] * percentile_rank(jobs.resource_share)
    )
    jobs["exposure"] = percentile_rank(combined)

    df = pd.concat([jobs.assign(region=r) for r in regions], ignore_index=True)
    df["region_load_growth_pct"] = df.region.map(load_growth)
    return df


def job_trend(occupation_trend, region_growth, alberta_growth, regions):
    """How this job has been doing lately, for every job whether energy touches it or not.

    Alberta's trend for the occupation group, shifted by how far the region's total
    employment ran ahead of or behind Alberta's. A region's own figure per occupation is
    too noisy to use. This describes the recent past. It's not a forecast, see validation.
    """
    df = pd.concat([occupation_trend.assign(region=r) for r in regions], ignore_index=True)
    df["region_growth_pct"] = df.region.map(region_growth)
    df["trend_growth_pct"] = df.occupation_growth_pct + df.region_growth_pct - alberta_growth
    df["job_trend"] = percentile_rank(df.trend_growth_pct)
    df["thin_trend_data"] = df.trend_group_people < THIN_TREND_GROUP
    return df


def adjacent_roles(sector_given_occ, tailwinds, top=5):
    """Nearby jobs worth moving to, with a tailwind at least as good as yours.

    This is a stand-in until the skills matching lands. Two occupations count as close
    when they work in the same industries and the NOC says the training level (TEER,
    second digit of the code) is within one step. Same broad field (first digit) gets
    a bonus. It won't catch skill overlap between fields that don't share industries.
    """
    m = sector_given_occ.to_numpy()
    norm = np.linalg.norm(m, axis=1, keepdims=True)
    norm[norm == 0] = 1
    sim = (m / norm) @ (m / norm).T
    codes = list(sector_given_occ.index)

    rows = []
    for region, g in tailwinds.groupby("region"):
        score = g.set_index("code").tailwind_base
        for i, code in enumerate(codes):
            mine = score.get(code, 0)
            candidates = []
            for j, other in enumerate(codes):
                if other == code or abs(int(code[1]) - int(other[1])) > 1:
                    continue
                if score.get(other, 0) < mine:
                    continue
                closeness = sim[i, j] * (1.15 if code[0] == other[0] else 1.0)
                candidates.append((0.7 * closeness + 0.3 * score.get(other, 0) / 100, other, closeness))
            candidates.sort(reverse=True)
            for rank_, (_, other, closeness) in enumerate(candidates[:top], start=1):
                rows.append((region, code, rank_, other, round(min(closeness, 1.0), 3)))
    return pd.DataFrame(rows, columns=["region", "code", "rank", "adjacent_code", "closeness"])
