"""Turn jobs by sector into the numbers people see: tailwind, exposure, adjacent roles."""
import numpy as np
import pandas as pd

# judgement: weights on the exposure components, documented in docs/methodology.md
EXPOSURE_WEIGHTS = {"sector_trend": 0.5, "resource_reliance": 0.3, "load_trend": 0.2}
RESOURCE_SECTORS = ["21"]
THIN_WORKFORCE = 500


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
    """Long table of exposure components for each occupation and region.

    sector_trend:      employment growth of the sectors this job sits in, here
    resource_reliance: share of the job's workers in mining, oil and gas
    load_trend:        growth of electricity use in the region

    The first two are job-specific, the last only differs by region. Each is ranked
    0-100 with higher meaning more exposed, then combined with EXPOSURE_WEIGHTS.
    """
    from .labour import LFS_GROUP

    weights = sector_given_occ.copy()
    columns = [c for c in weights.columns if c in LFS_GROUP]
    rows = []
    for region in regions:
        by_sector = pd.Series({c: momentum[region][LFS_GROUP[c]] for c in columns})
        trend = weights[columns].dot(by_sector)
        for code in weights.index:
            rows.append((region, code, trend[code]))
    df = pd.DataFrame(rows, columns=["region", "code", "sector_growth_pct"])

    resource = weights[[c for c in RESOURCE_SECTORS if c in weights]].sum(axis=1)
    df["resource_share"] = df.code.map(resource)
    df["region_load_growth_pct"] = df.region.map(load_growth)

    df["sector_trend_rank"] = percentile_rank(-df.sector_growth_pct)
    df["resource_reliance_rank"] = percentile_rank(df.resource_share)
    df["load_trend_rank"] = percentile_rank(-df.region_load_growth_pct)
    combined = (
        EXPOSURE_WEIGHTS["sector_trend"] * df.sector_trend_rank
        + EXPOSURE_WEIGHTS["resource_reliance"] * df.resource_reliance_rank
        + EXPOSURE_WEIGHTS["load_trend"] * df.load_trend_rank
    )
    df["exposure"] = percentile_rank(combined)
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
