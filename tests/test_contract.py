import json

import pytest

from gridskills import checks, contract
from gridskills.paths import OUTPUTS

needs_outputs = pytest.mark.skipif(not (OUTPUTS / "scores.csv").exists(), reason="run scripts/build_all.py first")


@pytest.fixture(scope="module")
def bundle():
    return contract.build(OUTPUTS)


@needs_outputs
def test_every_job_and_region_has_a_response(bundle):
    assert len(bundle["responses"]) == 162 * 8
    assert checks.check_bundle(bundle) == []


@needs_outputs
def test_response_matches_the_frontend_types(bundle):
    r = bundle["responses"]["4122|4850"]
    assert set(r) >= {"occupation", "region", "horizonYears", "tailwind", "exposure", "adjacentRoles",
                      "drivers", "confidence", "modelVersion", "jobTrend", "caveats"}
    assert r["region"] == {"id": "4850", "name": "Red Deer"}
    rng = r["tailwind"]["range"]
    assert rng["low"] <= rng["base"] <= rng["high"]
    assert r["confidence"] in ("low", "medium", "high")
    for d in r["drivers"]:
        assert 0 <= d["probability"] <= 1
        assert d["stage"] in ("cluster", "early", "mid", "late", "isd_review", "on_hold")
    for a in r["adjacentRoles"]:
        assert set(a) == {"occupation", "similarity", "tailwind", "missingSkills"}


@needs_outputs
def test_merged_regions_share_numbers_and_say_so(bundle):
    a, b = bundle["responses"]["7220|4840"], bundle["responses"]["7220|4870"]
    assert a["tailwind"] == b["tailwind"]
    assert a["region"]["id"] != b["region"]["id"]
    assert any("together" in c for c in a["caveats"])


@needs_outputs
def test_job_trend_is_past_tense(bundle):
    for r in list(bundle["responses"].values())[:50]:
        assert " will " not in r["jobTrend"]["summary"]
        assert "2017-19 to 2023-25" in r["jobTrend"]["summary"]


def test_missing_skills_drops_what_you_already_have():
    skills = {
        "1110": [{"skill": "Excel", "importance": "core"}],
        "2121": [{"skill": "Excel", "importance": "core"}, {"skill": "Python", "importance": "core"}],
    }
    out = contract.missing_skills("1110", "2121", skills)
    assert [s["skill"] for s in out] == ["Python"]
    assert out[0]["resources"][0]["url"].startswith("https://alis.alberta.ca")
    assert contract.missing_skills("1110", "2121", None) == []


def test_summaries_never_promise():
    for s in (0, 50, 90):
        assert "will" not in contract.tailwind_summary(s).lower().split()
    assert contract.trend_summary(-1.2).startswith("This kind of job shrank about 1.2%")


@needs_outputs
def test_checks_pass_on_current_outputs():
    assert checks.check_outputs(OUTPUTS) == []


@needs_outputs
def test_checks_catch_a_wild_swing(tmp_path):
    for f in OUTPUTS.glob("*.csv"):
        (tmp_path / f.name).write_bytes(f.read_bytes())
    meta = json.loads((OUTPUTS / "regions.json").read_text())
    (tmp_path / "regions.json").write_text(json.dumps(meta))
    previous = {"jobs_per_year_base": meta["jobs_per_year"]["base"] * 10, "snapshot": meta["snapshot"]}
    problems = checks.check_outputs(tmp_path, previous)
    assert any("moved" in p for p in problems)


@needs_outputs
def test_checks_catch_a_broken_parse(tmp_path):
    for f in OUTPUTS.glob("*"):
        if f.is_file():
            (tmp_path / f.name).write_bytes(f.read_bytes())
    lines = (tmp_path / "projects.csv").read_text(encoding="utf-8").splitlines()
    (tmp_path / "projects.csv").write_text("\n".join(lines[:5]), encoding="utf-8")
    assert any("projects" in p for p in checks.check_outputs(tmp_path))
