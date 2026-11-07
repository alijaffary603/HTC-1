"""Monthly outlook emails. Runs when the pipeline's CodeBuild job succeeds.

Compares the two latest published snapshots and emails everyone with a switched-on
alert whose scores moved by at least MIN_CHANGE points. A marker file per snapshot
stops a re-run from emailing people twice.
"""
import json
import logging

import boto3
from botocore.exceptions import ClientError

from . import config, emails, store

log = logging.getLogger()
log.setLevel(logging.INFO)
MIN_CHANGE = 5


def _snapshots(s3, bucket):
    rows = s3.list_objects_v2(Bucket=bucket, Prefix="history/", Delimiter="/")
    return sorted(p["Prefix"].split("/")[1] for p in rows.get("CommonPrefixes", []))


def _read(s3, bucket, key):
    return json.loads(s3.get_object(Bucket=bucket, Key=key)["Body"].read())


def run(s3=None, ses=None, table=None):
    s3 = s3 or boto3.client("s3")
    ses = ses or boto3.client("ses")
    bucket = config.DATA_BUCKET()
    snaps = _snapshots(s3, bucket)
    if len(snaps) < 2:
        return {"sent": 0, "reason": "need two snapshots to compare"}
    before_snap, after_snap = snaps[-2], snaps[-1]
    marker = f"history/{after_snap}/alerts-sent.json"
    try:
        s3.head_object(Bucket=bucket, Key=marker)
        return {"sent": 0, "reason": f"already sent for {after_snap}"}
    except ClientError:
        pass

    before = _read(s3, bucket, f"history/{before_snap}/summary.json")
    after = _read(s3, bucket, f"history/{after_snap}/summary.json")
    sender, app_url = config.SENDER_EMAIL(), config.APP_URL()
    sent = skipped = 0
    for alert in store.active_alerts(table):
        key = f"{alert['occupation']['code'][:4]}|{alert['region']['id']}"
        old, new = before.get(key), after.get(key)
        if not old or not new or not alert.get("email"):
            skipped += 1
            continue
        moved = max(abs(new["tailwind"] - old["tailwind"]), abs(new["jobTrend"] - old["jobTrend"]))
        if moved < MIN_CHANGE:
            continue
        try:
            emails.send(ses, sender, alert["email"],
                        emails.outlook_change(alert.get("name"), alert, old, new, after_snap, app_url))
            sent += 1
        except Exception:
            # one bad address shouldn't stop everyone else's email
            log.exception("couldn't send alert %s", alert["id"])
            skipped += 1
    s3.put_object(Bucket=bucket, Key=marker, Body=json.dumps({"sent": sent, "skipped": skipped}).encode())
    return {"sent": sent, "skipped": skipped, "compared": [before_snap, after_snap]}


def handler(event, context):
    result = run()
    log.info("outlook alerts: %s", result)
    return result
