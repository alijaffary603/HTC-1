"""Grid update emails and /api/developments: what changed on AESO's list, by region."""
import json

import pytest

from conftest import BUCKET, event

from gridapi import alerts, api, developments, emails, store

COLUMNS = "project_id,name,tech,region,pa_code,mw,isd,state,p_low,p_base,p_high,jobs_per_year,expected_mw"


def row(pid, name, region="Red Deer", tech="solar", mw=100, isd="2028-01", state="mid", p=0.5):
    return f"{pid},{name},{tech},{region},35,{mw},{isd},{state},{p / 2},{p},{min(p * 1.2, 1)},10,{mw * p}"


def put_month(s3, month, rows, tailwind=50, trend=50):
    s3.put_object(Bucket=BUCKET, Key=f"history/{month}/outputs/projects.csv", Body=("\n".join([COLUMNS, *rows]) + "\n").encode())
    summary = {"7220|Red Deer": {"tailwind": tailwind, "jobTrend": trend, "exposure": 10, "title": "x", "region": "Red Deer"}}
    s3.put_object(Bucket=BUCKET, Key=f"history/{month}/summary.json", Body=json.dumps(summary).encode())


BEFORE = [
    row("P1", "Pine Solar", state="mid"),
    row("P2", "Elk Gas", tech="gas", mw=300, isd="2028-01", state="mid"),
    row("P3", "Aspen Wind", tech="wind", mw=150, state="early"),
    row("P4", "Birch Storage", tech="storage", mw=80, isd="2027-06", state="late"),
    row("P5", "Cedar Load", tech="industrial_load", mw=60, state="mid"),
    row("C1", "Calgary Thing", region="Calgary", state="early"),
]
AFTER = [
    row("P1", "Pine Solar", state="late"),  # advanced
    row("P2", "Elk Gas", tech="gas", mw=300, isd="2028-09", state="mid"),  # delayed
    row("P4", "Birch Storage", tech="storage", mw=80, isd="2027-03", state="late"),  # earlier
    row("P5", "Cedar Load", tech="industrial_load", mw=60, state="on_hold"),  # on hold
    row("P6", "Larch Data Centre", tech="data_centre", mw=450, state="early", p=0.25),  # new
    row("C1", "Calgary Thing", region="Calgary", state="late"),  # other region
    # P3 is gone: left
]


def rows(lines):
    import csv
    import io

    return list(csv.DictReader(io.StringIO("\n".join([COLUMNS, *lines]))))


def test_changes_finds_each_kind_in_order_and_ignores_other_regions():
    found = developments.changes(rows(BEFORE), rows(AFTER), "Red Deer")
    assert [(d["kind"], d["projectId"]) for d in found] == [
        ("new", "P6"), ("advanced", "P1"), ("earlier", "P4"), ("delayed", "P2"), ("on_hold", "P5"), ("left", "P3"),
    ]
    by_id = {d["projectId"]: d for d in found}
    assert by_id["P1"]["previousState"] == "mid" and by_id["P1"]["state"] == "late"
    assert by_id["P2"]["previousIsd"] == "2028-01" and by_id["P2"]["isd"] == "2028-09"
    assert by_id["P6"]["likelihood"] == 0.25 and by_id["P6"]["mw"] == 450
    assert "C1" not in by_id


def test_unchanged_lists_have_no_changes():
    assert developments.changes(rows(BEFORE), rows(BEFORE), "Red Deer") == []


def test_left_projects_dont_claim_to_know_why():
    line = emails.development_line({**developments._project(rows(BEFORE)[2]), "kind": "left"})
    assert "built, cancelled or withdrawn" in line


@pytest.fixture
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(emails, "send", lambda ses, sender, to, email, reply_to=None: sent.append((to, email)))
    return sent


def _alert(sub, region_id="4850", region_name="Red Deer"):
    store.create_alert(sub, {"email": f"{sub}@example.com", "name": sub.capitalize()},
                       {"occupation": {"code": "72200", "title": "Electricians"},
                        "region": {"id": region_id, "name": region_name}})


def test_project_changes_are_emailed_even_when_the_outlook_is_flat(aws, outbox):
    _alert("ana")
    put_month(aws["s3"], "2026-10-01", BEFORE)
    put_month(aws["s3"], "2026-11-01", AFTER)
    assert alerts.run()["sent"] == 1
    to, email = outbox[0]
    assert to == "ana@example.com"
    assert email["subject"] == "6 grid project updates in the Red Deer region"
    for text in ("New on AESO’s list", "Larch Data Centre", "Moving ahead", "Pine Solar", "Delayed", "No longer waiting"):
        assert text in email["text"], text
    assert "Calgary Thing" not in email["text"]
    assert "Signal" in email["html"] and "GridSkills" not in email["html"]
    # no outlook section when the scores didn't move
    assert "Energy project demand" not in email["text"]
    assert alerts.run()["sent"] == 0  # marker stops a second send


def test_quiet_regions_get_no_email(aws, outbox):
    _alert("ben", region_id="Lethbridge-Medicine Hat", region_name="Lethbridge–Medicine Hat")
    put_month(aws["s3"], "2026-10-01", BEFORE)
    put_month(aws["s3"], "2026-11-01", AFTER)
    assert alerts.run()["sent"] == 0
    assert outbox == []


def test_outlook_moves_still_send_without_project_lists(aws, outbox):
    _alert("ana")
    for month, tailwind in (("2026-10-01", 50), ("2026-11-01", 62)):
        summary = {"7220|Red Deer": {"tailwind": tailwind, "jobTrend": 50, "exposure": 10, "title": "x", "region": "Red Deer"}}
        aws["s3"].put_object(Bucket=BUCKET, Key=f"history/{month}/summary.json", Body=json.dumps(summary).encode())
    assert alerts.run()["sent"] == 1
    assert "outlook" in outbox[0][1]["subject"]
    assert "up 12" in outbox[0][1]["text"]


def test_developments_route_is_public_and_uses_region_names_or_codes(aws):
    put_month(aws["s3"], "2026-10-01", BEFORE)
    resp = api.handler(event("GET /api/developments", query={"region": "Red Deer"}), None)
    assert json.loads(resp["body"]) == {"snapshot": "2026-10-01", "previous": None, "region": "Red Deer", "developments": []}

    put_month(aws["s3"], "2026-11-01", AFTER)
    out = json.loads(api.handler(event("GET /api/developments", query={"region": "4850"}), None)["body"])
    assert out["snapshot"] == "2026-11-01" and out["previous"] == "2026-10-01"
    assert len(out["developments"]) == 6 and out["developments"][0]["name"] == "Larch Data Centre"
    assert api.handler(event("GET /api/developments", query={}), None)["statusCode"] == 400
