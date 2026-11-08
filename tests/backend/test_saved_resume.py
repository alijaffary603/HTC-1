"""Saving a résumé to a signed-in person's account: POST/GET/DELETE /api/resume and /api/resume/file."""
import base64
import json

import pytest

from conftest import RESUME_BUCKET, event

from gridapi import api, resume

READ = {
    "skills": [{"name": "Java", "confidence": 0.95}, {"name": "SQL", "confidence": 0.7}],
    "suggestedOccupations": [
        {"code": "2123", "title": "Computer, software and Web designers and developers", "confidence": 0.88},
    ],
}


def upload(sub, filename="cv.pdf", content=b"%PDF-1.7 ana"):
    boundary = "XyZ"
    raw = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"resume\"; filename=\"{filename}\"\r\n"
        f"Content-Type: application/octet-stream\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    e = event("POST /api/resume", sub)
    e.update({
        "headers": {"Content-Type": f"multipart/form-data; boundary={boundary}"},
        "body": base64.b64encode(raw).decode(),
        "isBase64Encoded": True,
    })
    return api.handler(e, None)


def body(resp):
    return json.loads(resp["body"])


def saved_files(s3, sub=""):
    listing = s3.list_objects_v2(Bucket=RESUME_BUCKET, Prefix=f"resumes/{sub}")
    return [o["Key"] for o in listing.get("Contents", [])]


@pytest.fixture
def gemini(monkeypatch):
    calls = []

    def fake(name, mime, content):
        calls.append((name, mime, content))
        return READ

    monkeypatch.setattr(resume, "extract", fake)
    return calls


def test_saving_needs_an_account(aws, gemini):
    assert upload(None)["statusCode"] == 401
    for route in ("GET /api/resume", "GET /api/resume/file", "DELETE /api/resume"):
        assert api.handler(event(route), None)["statusCode"] == 401
    assert saved_files(aws["s3"]) == []
    assert gemini == []


def test_save_and_read_back(aws, gemini):
    resp = upload("ana", "Ana CV.pdf", b"%PDF-1.7 ana")
    assert resp["statusCode"] == 200
    saved = body(resp)["resume"]
    assert saved["fileName"] == "Ana CV.pdf"
    assert saved["size"] == len(b"%PDF-1.7 ana")
    # floats survive the round trip through DynamoDB
    assert saved["skills"] == READ["skills"]
    assert saved["suggestedOccupations"] == READ["suggestedOccupations"]
    # where the file lives stays on the server
    assert "fileKey" not in saved

    assert body(api.handler(event("GET /api/resume", "ana"), None))["resume"] == saved
    files = saved_files(aws["s3"], "ana/")
    assert len(files) == 1 and files[0].endswith(".pdf")
    obj = aws["s3"].get_object(Bucket=RESUME_BUCKET, Key=files[0])
    assert obj["Body"].read() == b"%PDF-1.7 ana"
    assert obj["ContentType"] == "application/pdf"

    # nobody else sees it
    assert body(api.handler(event("GET /api/resume", "ben"), None)) == {"resume": None}


def test_a_new_upload_replaces_the_old_one(aws, gemini):
    upload("ana", "old.pdf", b"%PDF old")
    resp = upload("ana", "new.docx", b"PK new")
    assert body(resp)["resume"]["fileName"] == "new.docx"
    files = saved_files(aws["s3"], "ana/")
    assert len(files) == 1 and files[0].endswith(".docx")


def test_download_link_is_short_lived_and_named(aws, gemini):
    upload("ana", "Ana CV.pdf")
    resp = api.handler(event("GET /api/resume/file", "ana"), None)
    url = body(resp)["url"]
    assert RESUME_BUCKET in url and "resumes/ana/" in url
    assert "response-content-disposition" in url
    assert "X-Amz-Expires=300" in url
    assert api.handler(event("GET /api/resume/file", "ben"), None)["statusCode"] == 404


def test_delete_removes_the_file_and_the_record(aws, gemini):
    upload("ana")
    upload("ben", content=b"%PDF ben")
    assert api.handler(event("DELETE /api/resume", "ana"), None)["statusCode"] == 204
    assert body(api.handler(event("GET /api/resume", "ana"), None)) == {"resume": None}
    assert saved_files(aws["s3"], "ana/") == []
    # ben's résumé is untouched
    assert len(saved_files(aws["s3"], "ben/")) == 1
    # deleting again is fine
    assert api.handler(event("DELETE /api/resume", "ana"), None)["statusCode"] == 204


def test_nothing_is_stored_when_reading_fails(aws, monkeypatch):
    def broken(*a, **k):
        raise RuntimeError("upstream exploded with résumé text inside")

    monkeypatch.setattr(resume, "extract", broken)
    resp = upload("ana")
    assert resp["statusCode"] == 502
    assert "résumé text" not in resp["body"]
    assert saved_files(aws["s3"]) == []
    assert body(api.handler(event("GET /api/resume", "ana"), None)) == {"resume": None}


def test_bad_files_are_rejected_before_anything_is_stored(aws, gemini):
    resp = upload("ana", "cv.exe", b"MZ")
    assert resp["statusCode"] == 400
    assert gemini == []
    assert saved_files(aws["s3"]) == []


def test_pathways_keep_the_short_region_name(aws):
    p = {
        "from": {"code": "4122", "title": "Teachers"},
        "to": {"code": "7220", "title": "Technical electrical trades"},
        "region": {"id": "Banff-Jasper-Rocky Mountain House and Athabasca-Grande Prairie-Peace River",
                   "name": "Banff–Jasper–Rocky Mountain House and Athabasca–Grande Prairie–Peace River",
                   "short": "Northwest Alberta"},
    }
    saved = body(api.handler(event("POST /api/pathways", "ana", body=p), None))
    assert saved["region"]["short"] == "Northwest Alberta"
