"""Change one assumption at a time and see whether the rankings move.

The product shows people where they stand relative to other jobs and regions, so
what matters most is whether the order survives, not the absolute job count.
"""
import pandas as pd

from gridskills import jobs, labour, multipliers, scores
from gridskills.params import load_assumptions
from gridskills.paths import OUTPUTS, PROCESSED


def main():
    a = load_assumptions()
    en = pd.read_parquet(PROCESSED / "energizations.parquet")
    mult = multipliers.load()
    census = labour.load_census()
    lfs = labour.load_lfs_industry()

    region_emp = labour.region_totals(lfs, 2025)
    shares = (region_emp / region_emp.sum()).to_dict()
    sector_emp = labour.sector_employment(census)
    occ_sector = labour.occupation_given_sector(census)
    employment = labour.region_occupation_employment(census, lfs)

    def run(energized=en, multipliers_=mult, overrides=None):
        pj = jobs.project_jobs(energized, multipliers_, a, "base", overrides)
        sectors = jobs.to_sectors(pj, sector_emp, a, shares, overrides)
        by_occ = scores.jobs_by_occupation(sectors, occ_sector)
        table = by_occ.stack().rename("jobs").reset_index()
        table.columns = ["region", "code", "jobs"]
        work = employment.stack().rename("workforce").reset_index()
        work.columns = ["code", "region", "workforce"]
        table = table.merge(work, on=["region", "code"])
        # leave out jobs with almost nobody in them, their percentages are just noise
        table = table[table.workforce >= scores.THIN_WORKFORCE]
        table["pct"] = table.jobs / table.workforce * 100
        return table.set_index(["region", "code"]).sort_index(), pj

    base, base_pj = run()
    dc_share = base_pj[base_pj.tech == "data_centre"].jobs.sum() / base_pj.jobs.sum()

    def with_dc(p_review=None, p_cluster=None, p_active=None):
        e = en.copy()
        dc = e.tech == "data_centre"
        if p_review is not None:
            e.loc[dc & (e.state == "isd_review") & ~e.project_id.isin(a["data_centres"]["phase1_projects"]), "p_base"] = p_review
        if p_cluster is not None:
            e.loc[dc & (e.state == "cluster"), "p_base"] = p_cluster
        if p_active is not None:
            e.loc[dc & e.state.isin(["early", "mid", "late"]) & ~e.project_id.isin(a["data_centres"]["phase1_projects"]), "p_base"] = p_active
        return e

    no_induced = mult.copy()
    no_induced["induced"] = 0.0
    even_mix = {k: 1 / len(a["indirect_mix"]) for k in a["indirect_mix"]}

    no_dc = en[en.tech != "data_centre"]
    cases = {
        "no data centres at all": dict(energized=no_dc),
        "data centres: Phase 1 only": dict(energized=with_dc(0, 0, 0)),
        "data centres: high case": dict(energized=with_dc(0.15, 0.25, 0.5)),
        "ignore completion odds (build the whole queue)": dict(overrides={"p_equals_one": True}),
        "local spend share x0.7": dict(overrides={"local_share_scale": 0.7}),
        "local spend share x1.3": dict(overrides={"local_share_scale": 1.3}),
        "CER net-zero costs instead of current measures": dict(overrides={"cer_scenario": "CNZ"}),
        "no induced jobs": dict(multipliers_=no_induced),
        "indirect jobs split evenly across supplier sectors": dict(overrides={"indirect_mix": even_mix}),
        "all jobs stay in the project's region": dict(overrides={"local_capture": {"direct": 1.0, "indirect": 1.0, "induced": 1.0}}),
        "no jobs are tied to the project's region": dict(overrides={"local_capture": {"direct": 0.0, "indirect": 0.0, "induced": 0.0}}),
    }

    def compare(other):
        joined = pd.DataFrame({"pct": base.pct, "pct_other": other.pct}).dropna()
        rho = joined.pct.corr(joined.pct_other, method="spearman")
        n = 100
        top_base = set(joined.pct.nlargest(n).index)
        top_other = set(joined.pct_other.nlargest(n).index)
        # occupation order inside each region, which is what one user actually sees
        within = joined.groupby(level="region").apply(lambda g: g.pct.corr(g.pct_other, method="spearman"))
        return rho, len(top_base & top_other) / n, within.min()

    rows = []
    for name, kw in cases.items():
        other, _ = run(**kw)
        rho, top, worst = compare(other)
        rows.append(dict(
            change=name,
            total_jobs_per_year=round(other.jobs.sum()),
            vs_base=round(other.jobs.sum() / base.jobs.sum(), 2),
            rank_correlation=round(rho, 3),
            top_100_overlap=round(top, 2),
            worst_region_rank_correlation=round(worst, 3),
        ))
    out = pd.DataFrame(rows)
    out.to_csv(OUTPUTS / "sensitivity.csv", index=False)
    print(f"base {base.jobs.sum():.0f} jobs per year, data centres are {dc_share:.0%} of that")
    print(out.to_string())


if __name__ == "__main__":
    main()
