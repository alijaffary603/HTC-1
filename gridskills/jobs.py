"""Open projects -> expected jobs by region, sector and technology.

Construction:  MW x capex x local share x jobs per $1M, spread over the build period
Operations:    MW x fixed O&M x local share x jobs per $1M, from in-service onward

The result is the average number of jobs supported per year across the horizon, after
weighting each project by its chance of being built.
"""
import numpy as np
import pandas as pd

from . import completion
from .params import SCENARIOS, tech_costs
from .regions import PLANNING_AREA_TO_REGION

UTILITY_OPS_CODE = "BS221100"
BUILDABLE = {"solar", "solar_storage", "wind", "wind_storage", "storage", "storage_long", "gas", "cogen",
             "other_gen", "data_centre", "industrial_load", "distribution_load"}
LOAD_TECHS = {"industrial_load", "distribution_load"}


def open_projects(clean):
    latest = clean[clean.snapshot == clean.snapshot.max()]
    latest = latest[latest.state.isin(completion.OPEN_STATES)]
    return completion.add_features(latest)


def score_projects(rows, model, chain, assumptions):
    """Adds p_low, p_base and p_high to each open project."""
    rows = rows.copy()
    scored = rows.family != "data_centre"
    p = pd.Series(0.0, index=rows.index)
    if scored.any():
        p[scored] = completion.p_built(rows[scored], model, chain)
    rows["p_low"] = p * assumptions["p_scale_low"]
    rows["p_base"] = p * assumptions["p_scale_base"]
    rows["p_high"] = (p * assumptions["p_scale_high"]).clip(upper=1)

    dc = assumptions["data_centres"]
    for mask, key in (
        ((rows.family == "data_centre") & (rows.state == "isd_review"), "review_p"),
        ((rows.family == "data_centre") & (rows.state == "cluster"), "cluster_p"),
        ((rows.family == "data_centre") & ~rows.state.isin(["isd_review", "cluster"]), "active_p"),
        (rows.project_id.isin(dc["phase1_projects"]), "phase1_p"),
    ):
        rows.loc[mask, ["p_low", "p_base", "p_high"]] = dc[key]
    return rows


def energizations(rows, assumptions):
    """One row per energization still to come, with MW split by what's being built.

    Generators carry a sliver of DTS for station service and batteries list charging
    as DTS, so only STS counts for generation and only DTS for load. Projects that pair
    a data centre with its own gas plant become two lines.
    """
    slip = pd.DateOffset(months=assumptions["isd_slip_months"])
    no_date = rows.snapshot.max() + pd.DateOffset(months=assumptions["no_date_months"])
    out = []
    for _, r in rows.iterrows():
        if r.tech not in BUILDABLE:
            continue
        dated = []
        past = None
        for n in (1, 2, 3):
            sts, dts, isd = r[f"sts_{n}"], r[f"dts_{n}"], r[f"isd_{n}"]
            if sts == 0 and dts == 0:
                continue
            if pd.isna(isd):
                when = no_date
            elif isd < r.snapshot:
                past = (sts, dts, r.snapshot + slip)  # probably in service already
                continue
            else:
                when = isd + slip
            dated.append((sts, dts, when))
        # still open with every date behind it means it's late, not finished
        if not dated and past:
            dated.append(past)
        for sts, dts, when in dated:
            common = dict(project_id=r.project_id, name=r["name"], pa_code=r.pa_code, isd=when, state=r.state,
                          p_low=r.p_low, p_base=r.p_base, p_high=r.p_high)
            if r.tech == "data_centre":
                if dts > 0:
                    out.append(dict(common, tech="data_centre", mw=dts))
                if sts > 0:
                    out.append(dict(common, tech="gas", mw=sts))
            elif r.tech in LOAD_TECHS:
                if dts > 0:
                    out.append(dict(common, tech=r.tech, mw=dts))
            elif sts > 0:
                out.append(dict(common, tech=r.tech, mw=sts))
    df = pd.DataFrame(out)
    df["region"] = df.pa_code.map(PLANNING_AREA_TO_REGION)
    return df[df.region.notna()].reset_index(drop=True)


def overlap_years(start, end, h_start, h_end):
    """Years of [start, end) inside the horizon. Everything is in decimal years."""
    return np.clip(np.minimum(end, h_end) - np.maximum(start, h_start), 0, None)


def _decimal_year(dates):
    return dates.dt.year + (dates.dt.day_of_year - 1) / 365.25


def project_jobs(en, multipliers, assumptions, scenario="base", overrides=None):
    """Average jobs per year over the horizon for each energization, by phase and channel."""
    o = overrides or {}
    i = SCENARIOS[scenario]
    h_start = assumptions["horizon_start"]
    h_end = assumptions["horizon_end"] + 1
    years = h_end - h_start
    costs = tech_costs(assumptions, o.get("cer_scenario", "CM"))
    deflator = assumptions["deflator_to_2022"]
    specs = assumptions["tech"]

    df = en.copy()
    df["p"] = 1.0 if o.get("p_equals_one") else df[f"p_{scenario}"]
    df["isd_year"] = _decimal_year(df.isd)
    df["build_years"] = df.tech.map(lambda t: specs[t]["build_years"])
    df["local_share"] = df.tech.map(lambda t: specs[t]["local_share"][i]) * o.get("local_share_scale", 1.0)
    df["capex_m"] = df.mw * df.tech.map(costs.capex_per_kw) * 1000 / 1e6
    df["om_m"] = df.mw * df.tech.map(costs.fixed_om_per_kw) * 1000 / 1e6
    df["code"] = df.tech.map(lambda t: specs[t]["construction_code"])

    # share of the build that falls inside the horizon, then per year of horizon
    in_window = overlap_years(df.isd_year - df.build_years, df.isd_year, h_start, h_end)
    df["build_frac"] = in_window / df.build_years
    df["ops_years"] = overlap_years(df.isd_year, np.full(len(df), float(h_end)), h_start, h_end)

    spend = df.capex_m * df.local_share * deflator * df.p * df.build_frac / years
    om_spend = df.om_m * assumptions["ops_local_share"] * deflator * df.p * df.ops_years / years

    out = []
    for channel in ("direct", "indirect", "induced"):
        c = df[["project_id", "name", "region", "tech", "mw", "p"]].copy()
        c["channel"] = channel
        c["phase"] = "construction"
        c["jobs"] = spend * df.code.map(multipliers[channel])
        out.append(c)

        c = df[["project_id", "name", "region", "tech", "mw", "p"]].copy()
        c["channel"] = channel
        c["phase"] = "operations"
        c["jobs"] = om_spend * multipliers.loc[UTILITY_OPS_CODE, channel]
        # data centres state operating jobs per MW directly, scaled up with their own multipliers
        dc = df.tech == "data_centre"
        if dc.any():
            spec = specs["data_centre"]
            ratio = multipliers.loc[spec["ops_code"], channel] / multipliers.loc[spec["ops_code"], "direct"]
            c.loc[dc, "jobs"] = (df.mw * spec["ops_jobs_per_mw"][i] * ratio * df.p * df.ops_years / years)[dc]
        out.append(c)
    return pd.concat(out, ignore_index=True)


def to_sectors(jobs, sector_emp, assumptions, region_shares, overrides=None):
    """Spread jobs into sectors and regions. Returns region, sector, tech, phase, channel, jobs."""
    o = overrides or {}
    capture = {**assumptions["local_capture"], **o.get("local_capture", {})}
    specs = assumptions["tech"]

    indirect_mix = pd.Series(o.get("indirect_mix", assumptions["indirect_mix"]), dtype=float)
    induced = sector_emp.reindex(assumptions["induced_sectors"])
    induced_mix = induced / induced.sum()

    grouped = jobs.groupby(["region", "tech", "phase", "channel"], as_index=False).jobs.sum()
    rows = []
    for g in grouped.itertuples(index=False):
        if g.jobs == 0:
            continue
        if g.channel == "direct":
            mix = {"23": 1.0} if g.phase == "construction" else {specs[g.tech].get("ops_sector", "22"): 1.0}
        elif g.channel == "indirect":
            mix = indirect_mix.to_dict()
        else:
            mix = induced_mix.to_dict()
        local = capture[g.channel]
        for sector, share in mix.items():
            n = g.jobs * share
            rows.append((g.region, sector, g.tech, g.phase, g.channel, n * local))
            if local < 1:
                for region, r_share in region_shares.items():
                    rows.append((region, sector, g.tech, g.phase, g.channel, n * (1 - local) * r_share))
    out = pd.DataFrame(rows, columns=["region", "sector", "tech", "phase", "channel", "jobs"])
    return out.groupby(["region", "sector", "tech", "phase", "channel"], as_index=False).jobs.sum()


def jobs_per_mw(multipliers, assumptions):
    """Job-years per MW built and operating jobs per MW, base case. For the cross-check table."""
    costs = tech_costs(assumptions)
    rows = []
    for tech, spec in assumptions["tech"].items():
        code = spec["construction_code"]
        spend = costs.capex_per_kw[tech] * 1000 / 1e6 * spec["local_share"][1] * assumptions["deflator_to_2022"]
        direct = spend * multipliers.loc[code, "direct"]
        total = spend * multipliers.loc[code, "total"]
        if "ops_jobs_per_mw" in spec:
            ops_direct = spec["ops_jobs_per_mw"][1]
            ratio = multipliers.loc[spec["ops_code"], "total"] / multipliers.loc[spec["ops_code"], "direct"]
            ops_total = ops_direct * ratio
        else:
            om = costs.fixed_om_per_kw[tech] * 1000 / 1e6 * assumptions["ops_local_share"] * assumptions["deflator_to_2022"]
            ops_direct = om * multipliers.loc[UTILITY_OPS_CODE, "direct"]
            ops_total = om * multipliers.loc[UTILITY_OPS_CODE, "total"]
        rows.append(dict(tech=tech, capex_per_kw=round(costs.capex_per_kw[tech]), local_share=spec["local_share"][1],
                         construction_direct=round(direct, 2), construction_total=round(total, 2),
                         operations_direct=round(ops_direct, 3), operations_total=round(ops_total, 3)))
    return pd.DataFrame(rows)

