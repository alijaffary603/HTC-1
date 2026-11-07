"""HTTP API for local development and AWS API Gateway HTTP API v2."""
import base64
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import BoundedSemaphore
from urllib.parse import parse_qs, urlsplit

from .advisor import AdvisorUnavailable, advise, catalog, mentors
from .web import web_score, resolve_region, resolve_occupation

MAX_BODY = 64000
CAPACITY = BoundedSemaphore(2)


def dispatch(method, path, query, body):
    if method == "GET" and path == "/health":
        return 200, {"status": "ok", "advisorConfigured": bool(os.getenv("GEMINI_API_KEY") or os.getenv("GEMINI_SECRET_ARN"))}
    if method == "GET" and path == "/score":
        return 200, web_score(query.get("occupation", ""), query.get("region", ""))
    if method == "GET" and path == "/resources":
        return 200, catalog(resolve_occupation(query.get("target", "")))
    if method == "GET" and path == "/mentors":
        return 200, mentors(resolve_region(query.get("region", "")), resolve_occupation(query.get("target", "")))
    if method == "POST" and path == "/advisor":
        if not CAPACITY.acquire(blocking=False):
            return 429, {"error": "The advisor is busy. Please try again shortly."}
        try:
            return 200, advise(body)
        finally:
            CAPACITY.release()
    return 404, {"error": "Endpoint not found"}


def handle(method, path, query=None, raw=b""):
    try:
        if len(raw) > MAX_BODY:
            return 413, {"error": "Request is too large"}
        body = json.loads(raw) if raw else {}
        return dispatch(method, path.removeprefix("/api"), query or {}, body)
    except (ValueError, UnicodeError) as exc:
        return 400, {"error": str(exc)}
    except AdvisorUnavailable as exc:
        return 503, {"error": str(exc)}
    except Exception:
        # Never reflect provider errors, credential values or filesystem details.
        return 500, {"error": "The request could not be completed. Please try again."}


def lambda_handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = event.get("rawPath", "/")
    raw = event.get("body") or ""
    if len(raw) > MAX_BODY * 2:
        return {"statusCode": 413, "body": json.dumps({"error": "Request is too large"})}
    try:
        raw = base64.b64decode(raw, validate=True) if event.get("isBase64Encoded") else raw.encode()
    except ValueError:
        return {"statusCode": 400, "body": json.dumps({"error": "Invalid request encoding"})}
    status, payload = handle(method, path, event.get("queryStringParameters") or {}, raw)
    return {"statusCode": status, "headers": {"Content-Type": "application/json", "Cache-Control": "no-store"},
            "body": json.dumps(payload, allow_nan=False)}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.respond()

    def do_POST(self):
        self.respond()

    def respond(self):
        parts = urlsplit(self.path)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 0 or length > MAX_BODY:
                status, payload = 413, {"error": "Request is too large"}
            else:
                status, payload = handle(self.command, parts.path,
                                         {k: v[0] for k, v in parse_qs(parts.query).items()}, self.rfile.read(length))
        except ValueError:
            status, payload = 400, {"error": "Invalid request"}
        data = json.dumps(payload, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


def load_local_env():
    from .paths import ROOT
    path = ROOT / ".env"
    if path.is_file():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                if key.strip() in {"GEMINI_API_KEY", "GEMINI_MODEL", "GEMINI_SECRET_ARN"}:
                    os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


if __name__ == "__main__":
    load_local_env()
    print("Signal API listening on http://127.0.0.1:8000", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
