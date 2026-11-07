import pytest

from gridskills import api
from gridskills.paths import OUTPUTS

needs_outputs = pytest.mark.skipif(not (OUTPUTS / "scores.csv").exists(), reason="run scripts/build_all.py first")


@needs_outputs
def test_score_shape():
    out = api.score("teacher", "Red Deer")
    assert out["occupation"]["code"] == "4122"
    assert out["region"] == "Red Deer"
    low, high = out["tailwind"]["range"]
    assert low <= out["tailwind"]["score"] <= high
    added = out["tailwind"]["added_jobs_per_year"]
    assert added["low"] <= added["base"] <= added["high"]
    assert 0 <= out["exposure"]["score"] <= 100
    assert isinstance(out["adjacent_roles"], list)


@needs_outputs
def test_town_resolves_to_region():
    assert api.score("7220", "Medicine Hat")["region"] == "Lethbridge-Medicine Hat"


@needs_outputs
@pytest.mark.parametrize("text,code", [
    ("nurses", "3130"), ("Electrician", "7220"), ("7330", "7330"), ("cooks, butchers", "6320"),
])
def test_find_occupation(text, code):
    assert api.find_occupation(text) == code


@needs_outputs
def test_bad_input_raises():
    with pytest.raises(ValueError):
        api.find_occupation("dragon tamer")
    with pytest.raises(ValueError):
        api.score("nurse", "Atlantis")


@needs_outputs
def test_aliases_point_at_real_codes():
    known = {o["code"] for o in api.occupations()}
    assert set(api.ALIASES.values()) <= known


@needs_outputs
def test_trades_outrank_police_on_tailwind():
    trades = api.score("7230", "Edmonton")["tailwind"]["score"]
    police = api.score("4131", "Edmonton")["tailwind"]["score"]
    assert trades > police
