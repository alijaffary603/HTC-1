import numpy as np
import pandas as pd
import pytest

from gridskills import jobs
from gridskills.params import load_assumptions
from gridskills.regions import REGIONS


@pytest.fixture
def assumptions():
    return load_assumptions()


@pytest.fixture
def multipliers():
    codes = ["BS23C300", "BS23C200", "BS23C500", "BS23B000", "BS221100", "BS518000"]
    return pd.DataFrame({"direct": 2.0, "indirect": 1.0, "induced": 1.0, "total": 4.0}, index=codes)


def _project(**kw):
    base = dict(project_id="P1", name="Test", tech="wind", pa_code=42, state="late",
                snapshot=pd.Timestamp("2026-11-01"), p_low=0.3, p_base=0.5, p_high=0.7,
                sts_1=100.0, dts_1=0.0, isd_1=pd.Timestamp("2028-01-01"),
                sts_2=0.0, dts_2=0.0, isd_2=pd.NaT, sts_3=0.0, dts_3=0.0, isd_3=pd.NaT)
    base.update(kw)
    return base


def test_overlap_years():
    assert jobs.overlap_years(2026.0, 2028.0, 2027, 2030) == 1.0
    assert jobs.overlap_years(2031.0, 2033.0, 2027, 2030) == 0.0
    assert jobs.overlap_years(2020.0, 2040.0, 2027, 2030) == 3.0


def test_energized_stages_are_dropped(assumptions):
    rows = pd.DataFrame([_project(isd_1=pd.Timestamp("2024-01-01"), sts_2=50.0, isd_2=pd.Timestamp("2028-06-01"))])
    en = jobs.energizations(rows, assumptions)
    assert list(en.mw) == [50.0]


def test_station_service_and_charging_are_ignored(assumptions):
    rows = pd.DataFrame([_project(tech="storage", sts_1=100.0, dts_1=100.0)])
    assert list(jobs.energizations(rows, assumptions).mw) == [100.0]


def test_data_centre_with_own_gas_splits_in_two(assumptions):
    rows = pd.DataFrame([_project(tech="data_centre", sts_1=600.0, dts_1=500.0)])
    en = jobs.energizations(rows, assumptions).set_index("tech")
    assert en.mw["data_centre"] == 500.0
    assert en.mw["gas"] == 600.0


def test_contract_only_projects_get_no_jobs(assumptions):
    rows = pd.DataFrame([_project(tech="wind"), _project(project_id="P2", tech="contract_only")])
    assert list(jobs.energizations(rows, assumptions).project_id) == ["P1"]


def test_project_outside_horizon_contributes_nothing(assumptions, multipliers):
    rows = pd.DataFrame([_project(sts_1=100.0, isd_1=pd.Timestamp("2040-01-01"))])
    out = jobs.project_jobs(jobs.energizations(rows, assumptions), multipliers, assumptions)
    assert out.jobs.sum() == 0


def test_probability_scales_jobs_linearly(assumptions, multipliers):
    en = jobs.energizations(pd.DataFrame([_project()]), assumptions)
    half = jobs.project_jobs(en, multipliers, assumptions).jobs.sum()
    one = jobs.project_jobs(en, multipliers, assumptions, overrides={"p_equals_one": True}).jobs.sum()
    assert one == pytest.approx(half / en.p_base[0])


def test_scenarios_are_ordered(assumptions, multipliers):
    en = jobs.energizations(pd.DataFrame([_project()]), assumptions)
    totals = [jobs.project_jobs(en, multipliers, assumptions, s).jobs.sum() for s in ("low", "base", "high")]
    assert totals[0] < totals[1] < totals[2]


def test_to_sectors_conserves_jobs(assumptions, multipliers):
    en = jobs.energizations(pd.DataFrame([_project()]), assumptions)
    pj = jobs.project_jobs(en, multipliers, assumptions)
    sector_emp = pd.Series(1000.0, index=assumptions["induced_sectors"])
    shares = {r: 1 / len(REGIONS) for r in REGIONS}
    out = jobs.to_sectors(pj, sector_emp, assumptions, shares)
    assert out.jobs.sum() == pytest.approx(pj.jobs.sum())
    direct = out[(out.channel == "direct") & (out.phase == "construction")]
    assert set(direct.sector) == {"23"}
    by_region = direct.groupby("region").jobs.sum()
    assert by_region.idxmax() == "Camrose-Drumheller"
    local = assumptions["local_capture"]["direct"]
    assert by_region.max() / by_region.sum() > local


def test_indirect_mix_sums_to_one(assumptions):
    assert np.isclose(sum(assumptions["indirect_mix"].values()), 1.0)


def test_capex_blends_cover_every_technology(assumptions):
    from gridskills.params import tech_costs
    costs = tech_costs(assumptions)
    assert (costs.capex_per_kw > 0).all()
    assert set(costs.index) == jobs.BUILDABLE
