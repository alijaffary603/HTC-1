import json

import pytest

from gridskills import api, checks, contract
from gridskills.paths import OUTPUTS
from gridskills.regions import REGIONS

needs_outputs = pytest.mark.skipif(not (OUTPUTS / "scores.csv").exists(), reason="run scripts/build_all.py first")


@pytest.fixture(scope="module")
def bundle():
    return contract.build(OUTPUTS)


@needs_outputs
def test_every_job_and_region_has_a_response(bundle):
    assert len(bundle["responses"]) == 162 * len(REGIONS)
    assert checks.check_bundle(bundle) == []


@needs_outputs
def test_response_is_exactly_score(bundle):
    """The app's ModelScore type is score()'s output, so the bundle must not reshape it."""
    assert bundle["responses"]["4122|Red Deer"] == api.score("4122", "Red Deer")


@needs_outputs
def test_response_has_the_fields_the_app_reads(bundle):
    r = bundle["responses"]["7220|Edmonton"]
    assert set(r) >= {"occupation", "region", "tailwind", "exposure", "job_trend", "adjacent_roles", "caveats"}
    low, high = r["tailwind"]["range"]
    assert low <= r["tailwind"]["score"] <= high


@needs_outputs
def test_summary_has_what_alerts_compare(bundle):
    s = contract.summary(bundle)["7220|Edmonton"]
    assert set(s) == {"tailwind", "jobTrend", "exposure", "title", "region"}


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
    assert any("moved" in p for p in checks.check_outputs(tmp_path, previous))


@needs_outputs
def test_checks_catch_a_broken_parse(tmp_path):
    for f in OUTPUTS.glob("*"):
        if f.is_file():
            (tmp_path / f.name).write_bytes(f.read_bytes())
    lines = (tmp_path / "projects.csv").read_text(encoding="utf-8").splitlines()
    (tmp_path / "projects.csv").write_text("\n".join(lines[:5]), encoding="utf-8")
    assert any("projects" in p for p in checks.check_outputs(tmp_path))
