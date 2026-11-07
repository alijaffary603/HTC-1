"""Checks that can be scored against real outcomes. Writes outputs/validation_*.csv.

1. Completion model on later data (each fit only sees what was known at the cutoff)
2. Did the queue predict where electricity use actually grew?
3. Do the jobs we'd assign to the MW actually built line up with construction hiring?
4. Our jobs per MW against published figures
"""
import json

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

from gridskills import completion, jobs, labour, multipliers
from gridskills.params import load_assumptions
from gridskills.paths import OUTPUTS, PROCESSED
from gridskills.regions import PLANNING_AREA_TO_REGION, REGIONS, lfs_region

CUTOFFS = [("2025-05-01", 18), ("2025-05-01", 12), ("2025-11-01", 12)]

# wind-only and solar-only figures from studies; direct + indirect unless noted
PUBLISHED = [
    ("wind", "construction", 2.0, "Ontario, Wolfe Island project (construction only)"),
    ("wind", "construction", 3.3, "Delphi Group 2017 for CanWEA, Alberta, ~15,000 jobs at ~4,500 MW"),
    ("wind", "construction", 10.6, "Pembina 2015, BC, direct + indirect"),
    ("solar", "construction", 11.0, "Ontario, 9.1 MW solar park (construction only)"),
    ("solar", "construction", 28.5, "Pembina 2015, BC, direct + indirect, 2013-era solar costs"),
    ("wind", "operations", 0.37, "Pembina 2015, BC, direct + indirect, includes a transmission share"),
    ("solar", "operations", 0.30, "Pembina 2015, BC, direct + indirect, includes a transmission share"),
]


def spearman(a, b):
    return pd.Series(a).corr(pd.Series(b), method="spearman")


def completion_backtest(clean):
    rows = []
    for cut, h in CUTOFFS:
        test = completion.landmark(clean, cut, h)
        y = test.y
        preds = {"base rate": np.full(len(test), y.mean())}
        for label, chain in (
            ("markov, all history", completion.fit_chain(clean, until=cut)),
            ("markov, last 24 months", completion.fit_chain(clean, until=cut, window=24)),
        ):
            table = completion.probability_table(chain, h).set_index(["family", "state"]).p_energized
            preds[label] = np.array([table[k] for k in zip(test.family, test.state)])
        logit = completion.fit_logit(clean, horizon=h, until=cut)
        preds["logit (used)"] = completion.predict_logit(logit, test)
        # the model excludes data centres, none have energized, so don't flatter it with easy zeros
        scored = (test.family != "data_centre").to_numpy()
        for name, p in preds.items():
            rows.append(dict(
                cutoff=cut, horizon_months=h, model=name, projects=int(scored.sum()),
                actual=int(y[scored].sum()), predicted=round(float(p[scored].sum()), 1),
                auc=round(roc_auc_score(y[scored], p[scored]), 3) if name != "base rate" else 0.5,
                brier=round(float(((p[scored] - y[scored]) ** 2).mean()), 4),
            ))
    return pd.DataFrame(rows)


def queue_vs_load(panel, yearly):
    """Queued load MW in Jan 2023 against the change in actual load by 2025, by planning area."""
    start = panel[(panel.snapshot == panel.snapshot.min()) & panel.status.isin(["active", "isd_review", "on_hold"])]
    start = start[start.tech.isin(["distribution_load", "industrial_load", "contract_only"])]
    queued = start.groupby("pa_code").dts_mw.sum()
    included = start[start.inclusion].groupby("pa_code").dts_mw.sum()

    table = yearly.pivot_table(index="pa_code", columns="year", values="avg_mw")
    change = table[2025] - table[2022]
    df = pd.DataFrame({"queued_mw": queued, "included_mw": included, "load_change_mw": change}).fillna(0)
    df = df[df.index.isin(table.index)]
    df["previous_change_mw"] = (table[2022] - table[2019]).reindex(df.index)
    df = df.dropna()

    # does the queue add anything once you already know the trend? partial rank correlation
    r = df.rank()
    resid_y = r.load_change_mw - np.polyval(np.polyfit(r.previous_change_mw, r.load_change_mw, 1), r.previous_change_mw)
    resid_q = r.queued_mw - np.polyval(np.polyfit(r.previous_change_mw, r.queued_mw, 1), r.previous_change_mw)
    return dict(
        planning_areas=len(df),
        spearman_all_queued=round(float(spearman(df.queued_mw, df.load_change_mw)), 3),
        spearman_included_only=round(float(spearman(df.included_mw, df.load_change_mw)), 3),
        spearman_previous_trend_baseline=round(float(spearman(df.previous_change_mw, df.load_change_mw)), 3),
        partial_queue_given_trend=round(float(np.corrcoef(resid_q, resid_y)[0, 1]), 3),
    ), df.reset_index()


def load_vs_employment(yearly, lfs):
    """Is electricity use a proxy for jobs at all? Region growth 2019 to 2025, seven regions."""
    load = yearly.groupby(["region", "year"]).avg_mw.sum().unstack("year")
    load_growth = (load[2025] / load[2019] - 1) * 100
    total = lfs[lfs.series == "Total employed"].copy()
    total["region"] = total.GEO.map(lfs_region)
    jobs_wide = total.dropna(subset=["region"]).pivot_table(index="region", columns="year", values="VALUE")
    job_growth = (jobs_wide[2025] / jobs_wide[2019] - 1) * 100
    table = pd.DataFrame({"load_growth_pct": load_growth, "employment_growth_pct": job_growth}).reindex(REGIONS)
    return dict(spearman=round(float(spearman(table.load_growth_pct, table.employment_growth_pct)), 3)), table.round(2)


def sector_trend_persistence(lfs):
    """Exposure leans on recent sector trends. Did past trends predict the next period?"""
    groups = sorted(set(labour.LFS_GROUP.values()))
    wide = lfs[lfs.series.isin(groups)].pivot_table(index=["GEO", "series"], columns="year", values="VALUE")
    avg = lambda a, b: wide[list(range(a, b + 1))].mean(axis=1)
    first = np.log(avg(2017, 2019) / avg(2012, 2014)) / 5
    second = np.log(avg(2023, 2025) / avg(2017, 2019)) / 6
    both = pd.DataFrame({"first": first, "second": second}).replace([np.inf, -np.inf], np.nan).dropna()
    provincial = both[both.index.get_level_values("GEO") == "Alberta"]
    return dict(
        pairs=len(both),
        spearman_region_sector=round(float(spearman(both["first"], both["second"])), 3),
        spearman_alberta_sector=round(float(spearman(provincial["first"], provincial["second"])), 3),
    )


def built_vs_hiring(clean, lfs, mult, a):
    """MW that really energized 2023-2025, converted to construction jobs, against LFS.

    Seven regions, so this is a sanity check and not evidence of much on its own.
    """
    done = clean[(clean.state == "energized") & (clean.snapshot.dt.year <= 2025)].copy()
    done["region"] = done.pa_code.map(PLANNING_AREA_TO_REGION)
    specs = a["tech"]
    costs = jobs.tech_costs(a)
    rows = []
    for r in done.itertuples():
        mw = abs(r.dts_mw) if r.tech in jobs.LOAD_TECHS else r.sts_mw
        if r.tech not in specs or not r.region or mw <= 0:
            continue
        spec = specs[r.tech]
        spend = mw * costs.capex_per_kw[r.tech] * 1000 / 1e6 * spec["local_share"][1] * a["deflator_to_2022"]
        rows.append((r.region, spend * mult.loc[spec["construction_code"], "direct"], mw))
    built = pd.DataFrame(rows, columns=["region", "direct_jobs", "mw"]).groupby("region")[["direct_jobs", "mw"]].sum()

    con = lfs[lfs.series == "Construction [23]"].copy()
    con["region"] = con.GEO.map(lfs_region)
    wide = con.dropna(subset=["region"]).pivot_table(index="region", columns="year", values="VALUE") * 1000
    before = wide[[2021, 2022]].mean(axis=1)
    after = wide[[2024, 2025]].mean(axis=1)
    table = pd.DataFrame({
        "mw_built": built.mw,
        "model_job_years": built.direct_jobs,
        "construction_jobs_before": before,
        "construction_change": after - before,
    }).reindex(REGIONS).fillna(0)
    table["model_as_pct"] = table.model_job_years / table.construction_jobs_before * 100
    table["actual_change_pct"] = table.construction_change / table.construction_jobs_before * 100
    return dict(
        spearman_jobs_vs_change=round(float(spearman(table.model_job_years, table.construction_change)), 3),
        spearman_pct_vs_pct=round(float(spearman(table.model_as_pct, table.actual_change_pct)), 3),
        spearman_region_size_baseline=round(float(spearman(table.construction_jobs_before, table.construction_change)), 3),
    ), table.round(1).reset_index().rename(columns={"index": "region"})


def job_trend_backtest(lfs):
    """Would the job trend signal have worked as a forecast?

    Take the trend from an earlier window and compare with what came next. COVID lands
    in the later window either way, so this is about as fair as the data allows.
    """
    mapping = labour.occupation_series(lfs)
    names = sorted(set(mapping.values()))
    wide = lfs[lfs.series.isin(names)].pivot_table(index=["GEO", "series"], columns="year", values="VALUE")
    rows = []
    for name, first, middle, last in (
        ("2012-14 to 2017-19, then to 2023-25", (2012, 2014), (2017, 2019), (2023, 2025)),
        ("2011-13 to 2016-18, then to 2023-25", (2011, 2013), (2016, 2018), (2023, 2025)),
        ("2014-16 to 2017-19, then to 2023-25", (2014, 2016), (2017, 2019), (2023, 2025)),
    ):
        earlier = labour.annual_growth(wide, first, middle)
        later = labour.annual_growth(wide, middle, last)
        frame = pd.DataFrame({"earlier": earlier, "later": later}).replace([np.inf, -np.inf], np.nan)

        ab = frame.xs("Alberta", level="GEO").dropna()
        regional = frame.drop(index="Alberta", level="GEO").dropna().reset_index()
        regional["ab_earlier"] = regional.series.map(ab.earlier)
        regional["region"] = regional.GEO.map(lfs_region)
        by_region, overall = labour.employment_growth(lfs, first, middle)
        regional["with_region"] = regional.ab_earlier + regional.region.map(by_region) - overall
        regional = regional.dropna()

        rows.append(dict(
            windows=name, groups=len(ab),
            alberta_rank_corr=round(float(spearman(ab.earlier, ab.later)), 3),
            alberta_median_error_trend=round(float((ab.earlier - ab.later).abs().median()), 2),
            alberta_median_error_average=round(float((ab.later.mean() - ab.later).abs().median()), 2),
            regional_cells=len(regional),
            region_own_trend_rank_corr=round(float(spearman(regional.earlier, regional.later)), 3),
            region_alberta_trend_rank_corr=round(float(spearman(regional.ab_earlier, regional.later)), 3),
            region_alberta_plus_region_rank_corr=round(float(spearman(regional.with_region, regional.later)), 3),
        ))
    return pd.DataFrame(rows)


def tailwind_vs_occupation_growth(lfs, before=(2021, 2022), after=(2024, 2025)):
    """Did the occupations we favour actually grow? Alberta, by LFS occupation group.

    Not a clean forecast test: tailwind looks at 2027-29 and this compares it to 2022-25.
    Construction was active in both, so a real signal should still show up.
    """
    scores_table = pd.read_csv(OUTPUTS / "scores.csv", dtype={"code": str})
    wide = lfs[lfs.GEO == "Alberta"].pivot_table(index="series", columns="year", values="VALUE")
    rows = []
    for series in wide.index:
        prefixes = labour.bracket_codes(series)
        if not prefixes or series in labour.LFS_GROUP.values():
            continue
        members = scores_table[scores_table.code.str.startswith(tuple(prefixes))]
        if members.empty or len(prefixes[0]) != 2:
            continue
        rows.append(dict(
            group=series,
            tailwind_pct=members.added_jobs_base.sum() / members.workforce.sum() * 100,
            growth_pct=(wide.loc[series, list(after)].mean() / wide.loc[series, list(before)].mean() - 1) * 100,
            people=wide.loc[series, list(after)].mean(),
        ))
    table = pd.DataFrame(rows)
    # the LFS nests its groups, so keep the two-digit ones and drop the catch-all headers
    table = table[~table.group.str.contains("except management|^Management occupations")]
    return dict(groups=len(table), spearman=round(float(spearman(table.tailwind_pct, table.growth_pct)), 3)), table.round(2)


def cross_check(mult, a):
    ours = jobs.jobs_per_mw(mult, a).set_index("tech")
    rows = []
    for tech, phase, value, source in PUBLISHED:
        mine = ours.loc[tech, "construction_total" if phase == "construction" else "operations_total"]
        rows.append(dict(tech=tech, phase=phase, ours=mine, published=value, ratio=round(mine / value, 2), source=source))
    return pd.DataFrame(rows)


def main():
    a = load_assumptions()
    panel = pd.read_parquet(PROCESSED / "panel.parquet")
    yearly = pd.read_parquet(PROCESSED / "load_yearly.parquet")
    clean = completion.add_features(completion.clean_panel(panel))
    lfs = labour.load_lfs_industry()
    mult = multipliers.load()

    bt = completion_backtest(clean)
    bt.to_csv(OUTPUTS / "validation_completion.csv", index=False)
    print(bt.to_string())

    load_stats, load_table = queue_vs_load(panel, yearly)
    load_table.round(2).to_csv(OUTPUTS / "validation_queue_vs_load.csv", index=False)
    print(load_stats)

    hire_stats, hire_table = built_vs_hiring(clean, lfs, mult, a)
    hire_table.to_csv(OUTPUTS / "validation_built_vs_hiring.csv", index=False)
    print(hire_stats)
    print(hire_table.to_string())

    lve_stats, lve_table = load_vs_employment(yearly, lfs)
    lve_table.to_csv(OUTPUTS / "validation_load_vs_employment.csv")
    print(lve_stats)
    print(lve_table.to_string())

    persistence = sector_trend_persistence(lfs)
    print(persistence)

    occ_stats, occ_table = tailwind_vs_occupation_growth(lfs)
    occ_table.to_csv(OUTPUTS / "validation_tailwind_vs_growth.csv", index=False)
    print(occ_stats)
    print(occ_table.sort_values("tailwind_pct", ascending=False).to_string())

    trend_test = job_trend_backtest(lfs)
    trend_test.to_csv(OUTPUTS / "validation_job_trend.csv", index=False)
    print(trend_test.T.to_string())

    summary = dict(queue_vs_load=load_stats, built_vs_hiring=hire_stats, load_vs_employment=lve_stats,
                   sector_trend_persistence=persistence, tailwind_vs_occupation_growth=occ_stats)
    (OUTPUTS / "validation_summary.json").write_text(json.dumps(summary, indent=2))

    check = cross_check(mult, a)
    check.to_csv(OUTPUTS / "validation_jobs_per_mw.csv", index=False)
    print(check.to_string())


if __name__ == "__main__":
    main()
