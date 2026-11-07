import pandas as pd
import pytest

from gridskills import labour


def _lfs():
    rows = []
    series = {
        "Total employed": 1000.0,
        "Professional occupations in law, education, social, community and government services [41]": 100.0,
        "Professional occupations in education services [412]": 50.0,
        "Technical trades and transportation officers and controllers [72]": 200.0,
        "Care providers and crossing guards [44-45]": 20.0,
        "Natural and applied sciences and related occupations, except management [21-22]": 300.0,
        "Construction [23]": 150.0,
    }
    for geo, scale in (("Alberta", 1.0), ("Calgary, Alberta", 0.5), ("Red Deer, Alberta", 0.1)):
        for name, value in series.items():
            for year in range(2011, 2026):
                # Calgary grows, everything else stays flat
                growth = 1.02 ** (year - 2011) if geo == "Calgary, Alberta" else 1.0
                rows.append(dict(year=year, GEO=geo, series=name, VALUE=value * scale * growth))
    return pd.DataFrame(rows)


def test_bracket_codes():
    assert labour.bracket_codes("General trades [73]") == ["73"]
    assert labour.bracket_codes("Care providers [44-45]") == ["44", "45"]
    assert labour.bracket_codes("Middle management [70, 80, 90]") == ["70", "80", "90"]
    assert labour.bracket_codes("Employees") == []


def test_occupation_series_skips_industries_and_headline_groups():
    mapping = labour.occupation_series(_lfs())
    assert "72" in mapping
    assert "23" not in mapping
    assert "21" not in mapping


def test_most_detailed_group_wins():
    mapping = labour.occupation_series(_lfs())
    assert labour.series_for_code("4122", mapping).endswith("[412]")
    assert labour.series_for_code("4110", mapping).endswith("[41]")
    assert labour.series_for_code("4510", mapping).endswith("[44-45]")


def test_annual_growth():
    years = range(2011, 2026)
    wide = pd.DataFrame([[1.02 ** (y - 2011) for y in years]], columns=list(years))
    assert labour.annual_growth(wide, (2017, 2019), (2023, 2025)).iloc[0] == pytest.approx(2.0)


def test_occupation_trend_is_alberta_wide():
    table = labour.occupation_trend(_lfs(), ["7220", "4122"]).set_index("code")
    assert table.occupation_growth_pct["7220"] == pytest.approx(0.0)
    assert table.trend_group_people["4122"] == 50_000


def test_employment_growth_by_region():
    by_region, overall = labour.employment_growth(_lfs())
    assert by_region["Calgary"] == pytest.approx(2.0)
    assert by_region["Red Deer"] == pytest.approx(0.0)
    assert overall == pytest.approx(0.0)
