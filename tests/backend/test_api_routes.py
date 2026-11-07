import json

from conftest import event

from gridapi import api

TEACHER = {"code": "41221", "title": "Elementary school and kindergarten teachers"}
TRADES = {"code": "7220", "title": "Technical electrical trades"}
RED_DEER = {"id": "4850", "name": "Red Deer"}


def body(resp):
    return json.loads(resp["body"])


def test_score_accepts_five_digit_codes_and_echoes_them(aws):
    resp = api.handler(event("GET /api/score", query={"occupation": "41221", "region": "4850"}), None)
    assert resp["statusCode"] == 200
    out = body(resp)
    assert out["occupation"]["code"] == "41221"
    assert out["occupation"]["title"].startswith("Secondary")


def test_score_accepts_region_names_the_app_sends(aws):
    resp = api.handler(event("GET /api/score", query={"occupation": "7220", "region": "Red Deer"}), None)
    assert body(resp)["tailwind"]["score"] == 90


def test_score_unknown_is_404(aws):
    resp = api.handler(event("GET /api/score", query={"occupation": "9999", "region": "4850"}), None)
    assert resp["statusCode"] == 404
    resp = api.handler(event("GET /api/score", query={"occupation": "41221", "region": "1234"}), None)
    assert resp["statusCode"] == 404


def test_signed_in_routes_need_a_user(aws):
    assert api.handler(event("GET /api/pathways"), None)["statusCode"] == 401


def test_postings_are_empty_until_there_is_a_source(aws):
    assert body(api.handler(event("GET /api/postings", query={"occupation": "7220", "region": "4850"}), None)) == []


def test_pathways_round_trip_and_dedupe(aws):
    p = {"from": TEACHER, "to": TRADES, "region": RED_DEER}
    first = body(api.handler(event("POST /api/pathways", "ana", body=p), None))
    again = body(api.handler(event("POST /api/pathways", "ana", body=p), None))
    assert first["id"] == again["id"]
    assert first["share"] is False
    assert len(body(api.handler(event("GET /api/pathways", "ana"), None))) == 1
    # another user's list is separate
    assert body(api.handler(event("GET /api/pathways", "ben"), None)) == []

    api.handler(event("DELETE /api/pathways/{id}", "ana", path={"id": first["id"]}), None)
    assert body(api.handler(event("GET /api/pathways", "ana"), None)) == []


def test_only_shared_pathways_show_up_as_matches(aws):
    p = body(api.handler(event("POST /api/pathways", "ana", body={"from": TEACHER, "to": TRADES, "region": RED_DEER}), None))
    q = {"region": "4850", "from": "41221", "to": "7220"}
    assert body(api.handler(event("GET /api/matches", "ben", query=q), None)) == []

    resp = api.handler(event("PATCH /api/pathways/{id}", "ana", path={"id": p["id"]}, body={"share": True}), None)
    assert body(resp)["share"] is True
    found = body(api.handler(event("GET /api/matches", "ben", query=q), None))
    assert [m["firstName"] for m in found] == ["Ana"]
    assert "email" not in found[0]
    # you don't match yourself
    assert body(api.handler(event("GET /api/matches", "ana", query=q), None)) == []

    api.handler(event("PATCH /api/pathways/{id}", "ana", path={"id": p["id"]}, body={"share": False}), None)
    assert body(api.handler(event("GET /api/matches", "ben", query=q), None)) == []


def test_someone_else_cannot_change_your_pathway(aws):
    p = body(api.handler(event("POST /api/pathways", "ana", body={"from": TEACHER, "to": TRADES, "region": RED_DEER}), None))
    resp = api.handler(event("PATCH /api/pathways/{id}", "ben", path={"id": p["id"]}, body={"share": True}), None)
    assert resp["statusCode"] == 404


def test_intro_emails_the_person_with_reply_to(aws):
    p = body(api.handler(event("POST /api/pathways", "ana", body={"from": TEACHER, "to": TRADES, "region": RED_DEER}), None))
    api.handler(event("PATCH /api/pathways/{id}", "ana", path={"id": p["id"]}, body={"share": True}), None)
    resp = api.handler(event("POST /api/intros", "ben", body={"matchId": p["id"], "region": "4850"}), None)
    assert resp["statusCode"] == 204
    sent = aws["ses"].get_send_statistics()["SendDataPoints"]
    assert sent and sent[0]["DeliveryAttempts"] == 1


def test_alerts_crud(aws):
    a = {"occupation": TRADES, "region": RED_DEER, "frequency": "weekly"}
    created = body(api.handler(event("POST /api/alerts", "ana", body=a), None))
    assert created["created"] is True
    again = body(api.handler(event("POST /api/alerts", "ana", body=a), None))
    assert again == {"alert": created["alert"], "created": False}

    alert_id = created["alert"]["id"]
    paused = body(api.handler(event("PATCH /api/alerts/{id}", "ana", path={"id": alert_id}, body={"active": False}), None))
    assert paused["active"] is False
    api.handler(event("DELETE /api/alerts/{id}", "ana", path={"id": alert_id}), None)
    assert body(api.handler(event("GET /api/alerts", "ana"), None)) == []


def test_bad_json_is_a_400(aws):
    e = event("POST /api/alerts", "ana")
    e["body"] = "{not json"
    assert api.handler(e, None)["statusCode"] == 400
