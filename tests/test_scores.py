import numpy as np
import pandas as pd
import pytest

from gridskills import scores


@pytest.fixture
def occ_given_sector():
    t = pd.DataFrame({"23": [0.8, 0.2, 0.0], "62": [0.0, 0.2, 0.8]}, index=["7202", "6221", "3012"])
    t.index.name, t.columns.name = "code", "sector"
    return t


def _jobs(region, sector, n):
    return pd.DataFrame([dict(region=region, sector=sector, tech="wind", phase="construction", channel="direct", jobs=n)])


def test_occupation_jobs_add_up(occ_given_sector):
    out = scores.jobs_by_occupation(_jobs("Calgary", "23", 100.0), occ_given_sector)
    assert out.loc["Calgary", "7202"] == pytest.approx(80)
    assert out.loc["Calgary"].sum() == pytest.approx(100)


def test_score_against_reference():
    ref = pd.Series([1.0, 2.0, 3.0, 4.0])
    out = scores.score_against(pd.Series([0.0, 2.5, 9.0]), ref)
    assert list(out) == [0.0, 50.0, 100.0]


def test_tailwind_scenarios_and_percent(occ_given_sector):
    employment = pd.DataFrame({"Calgary": [1000.0, 2000.0, 4000.0]}, index=occ_given_sector.index)
    jobs = {s: _jobs("Calgary", "23", n) for s, n in (("low", 50.0), ("base", 100.0), ("high", 200.0))}
    out = scores.tailwind(jobs, occ_given_sector, employment).set_index("code")
    assert out.pct_of_workforce_base["7202"] == pytest.approx(8.0)
    assert out.added_jobs_high["7202"] == pytest.approx(160)
    assert out.tailwind_low["7202"] <= out.tailwind_base["7202"] <= out.tailwind_high["7202"]


def test_exposure_ranks_resource_jobs_higher():
    sectors = pd.DataFrame({"21": [0.9, 0.0], "62": [0.1, 1.0]}, index=["8222", "3012"])
    from gridskills.labour import LFS_GROUP
    momentum = pd.Series({LFS_GROUP["21"]: -2.0, LFS_GROUP["62"]: 3.0})
    load = pd.Series({"Calgary": 1.0, "Edmonton": -1.0})
    out = scores.exposure(sectors, momentum, load, ["Calgary", "Edmonton"])
    calgary = out[out.region == "Calgary"].set_index("code")
    assert calgary.exposure["8222"] > calgary.exposure["3012"]
    # same job scores the same everywhere, load growth is display only
    assert out[out.code == "8222"].exposure.nunique() == 1
    assert calgary.region_load_growth_pct["8222"] == 1.0


def test_adjacent_roles_respect_training_level_and_tailwind():
    sectors = pd.DataFrame(
        {"23": [1.0, 0.9, 1.0], "62": [0.0, 0.1, 0.0]},
        index=pd.Index(["7202", "7303", "3012"], name="code"),
    )
    # 3012 is TEER 0 vs 7202's TEER 2, so it can't be suggested even though it matches
    tw = pd.DataFrame(dict(region="Calgary", code=["7202", "7303", "3012"], tailwind_base=[50.0, 80.0, 90.0]))
    out = scores.adjacent_roles(sectors, tw)
    mine = out[out.code == "7202"]
    assert list(mine.adjacent_code) == ["7303"]
    assert np.isclose(mine.closeness.iloc[0], 1.0, atol=0.01)
