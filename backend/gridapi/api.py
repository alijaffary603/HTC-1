"""Lambda behind API Gateway. One function, routed on the route key.

Routes match what frontend/src/api/client.ts calls, under /api because CloudFront
sends /api/* here and everything else to the site bucket. Signed-in routes are
protected by the Cognito JWT authorizer in API Gateway, so by the time a request gets
here its claims are already checked.
"""
import json
import logging

import boto3

from . import config, data, developments, emails, resume, resume_files, store
from .uploads import UploadError, resume_file

log = logging.getLogger()
log.setLevel(logging.INFO)


def respond(status, body=None):
    if body is None:
        return {"statusCode": status}
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", "Cache-Control": "no-store"},
        "body": json.dumps(body),
    }


def error(status, message):
    # the app's advisor code reads "error", the rest reads "message"
    return respond(status, {"message": message, "error": message})


def _claims(event):
    return event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})


def _query(event):
    return event.get("queryStringParameters") or {}


def _body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        import base64

        raw = base64.b64decode(raw).decode()
    return json.loads(raw)


def get_score(event):
    q = _query(event)
    found = data.lookup(q.get("occupation", ""), q.get("region", ""))
    if found is None:
        return error(404, "No outlook for that job and region. Pick a job and town from the list.")
    return respond(200, found)


def post_skills(event):
    try:
        name, mime, content = resume_file(event)
    except UploadError as e:
        return error(400, str(e))
    try:
        return respond(200, resume.extract(name, mime, content))
    except Exception:
        # log the failure, never the resume
        log.exception("resume extraction failed")
        return error(502, "We couldn't read that resume right now. Pick your job from the list instead.")


def post_resume(event, sub):
    """Reads the resume like /skills, then keeps it on the person's account.

    Nothing is stored unless the read works. A new upload replaces the old one, file and all.
    """
    try:
        name, mime, content = resume_file(event)
    except UploadError as e:
        return error(400, str(e))
    try:
        result = resume.extract(name, mime, content)
    except Exception:
        log.exception("resume extraction failed")
        return error(502, "We couldn't read that resume right now, so it wasn't saved. Try again, or pick your job from the list.")

    previous = store.get_resume(sub)
    key = resume_files.put(sub, name, mime, content)
    try:
        item = store.put_resume(sub, name, mime, len(content), key, result)
    except Exception:
        resume_files.delete(key)
        raise
    if previous and previous.get("fileKey") and previous["fileKey"] != key:
        resume_files.delete(previous["fileKey"])
    return respond(200, {"resume": store.resume_out(item)})


def get_resume(sub):
    item = store.get_resume(sub)
    return respond(200, {"resume": store.resume_out(item) if item else None})


def get_resume_file(sub):
    item = store.get_resume(sub)
    if not item:
        return error(404, "You don't have a saved resume.")
    url = resume_files.download_url(item["fileKey"], item["fileName"], item.get("mimeType", "application/octet-stream"))
    return respond(200, {"url": url})


def delete_resume(sub):
    item = store.get_resume(sub)
    if item:
        if item.get("fileKey"):
            resume_files.delete(item["fileKey"])
        store.delete_resume(sub)
    return respond(204)


def get_developments(event):
    """What changed on AESO's list in a region between the two latest months. Public."""
    region = data.region_name(_query(event).get("region", ""))
    if not region:
        return error(400, "region is required")
    return respond(200, developments.latest(region))


def get_postings(event):
    # no postings source has been chosen yet, so there's honestly nothing to return
    return respond(200, [])


def get_matches(event, sub):
    q = _query(event)
    if not q.get("region") or not q.get("from"):
        return error(400, "region and from are required")
    return respond(200, store.matches(q["region"], q["from"], q.get("to"), viewer=sub))


def post_intro(event, sub):
    body = _body(event)
    pathway = store.shared_pathway(body.get("region", ""), body.get("matchId", ""))
    if not pathway:
        return error(404, "That person isn't sharing this move any more.")
    claims = _claims(event)
    sender = config.SENDER_EMAIL()
    if not sender:
        return error(503, "Introductions aren't switched on yet.")
    requester = claims.get("name") or "Someone on Signal"
    emails.send(boto3.client("ses"), sender, pathway["email"],
                emails.intro_request(requester, claims.get("email", ""), pathway), reply_to=claims.get("email"))
    return respond(204)


def _owned(sub, event, fn, *args):
    found = fn(sub, event["pathParameters"]["id"], *args)
    return respond(200, found) if found else error(404, "Not found.")


def handler(event, context):
    route = event.get("routeKey", "")
    sub = _claims(event).get("sub")
    try:
        if route == "GET /api/score":
            return get_score(event)
        if route == "POST /api/skills":
            return post_skills(event)
        if route == "GET /api/postings":
            return get_postings(event)
        if route == "GET /api/developments":
            return get_developments(event)

        if not sub:
            return error(401, "Sign in to do this.")
        if route == "GET /api/matches":
            return get_matches(event, sub)
        if route == "POST /api/intros":
            return post_intro(event, sub)
        if route == "GET /api/pathways":
            return respond(200, store.list_pathways(sub))
        if route == "POST /api/pathways":
            return respond(200, store.save_pathway(sub, _claims(event), _body(event)))
        if route == "PATCH /api/pathways/{id}":
            return _owned(sub, event, store.set_pathway_share, bool(_body(event).get("share")))
        if route == "DELETE /api/pathways/{id}":
            store.delete_pathway(sub, event["pathParameters"]["id"])
            return respond(204)
        if route == "GET /api/alerts":
            return respond(200, store.list_alerts(sub))
        if route == "POST /api/alerts":
            alert, created = store.create_alert(sub, _claims(event), _body(event))
            return respond(200, {"alert": alert, "created": created})
        if route == "PATCH /api/alerts/{id}":
            return _owned(sub, event, store.update_alert, _body(event))
        if route == "DELETE /api/alerts/{id}":
            store.delete_alert(sub, event["pathParameters"]["id"])
            return respond(204)
        if route == "GET /api/resume":
            return get_resume(sub)
        if route == "POST /api/resume":
            return post_resume(event, sub)
        if route == "GET /api/resume/file":
            return get_resume_file(sub)
        if route == "DELETE /api/resume":
            return delete_resume(sub)
    except (KeyError, ValueError, json.JSONDecodeError):
        return error(400, "That request is missing something or isn't valid JSON.")
    return error(404, f"No route for {route}")
