"""Monthly grid update emails. Runs when the pipeline's CodeBuild job succeeds.

Compares the two latest published snapshots. Everyone with a switched-on alert gets an
email if projects in their region changed on AESO's list (new, moving ahead, delayed,
on hold, gone), or if their scores moved by at least MIN_CHANGE points. No changes, no
email. A marker file per snapshot stops a re-run from emailing people twice.
"""
import json
import logging

import boto3
from botocore.exceptions import ClientError

from . import config, data, developments, emails, store

log = logging.getLogger()
log.setLevel(logging.INFO)
MIN_CHANGE = 5


def _read(s3, bucket, key):
    return json.loads(s3.get_object(Bucket=bucket, Key=key)["Body"].read())


def run(s3=None, ses=None, table=None):
    s3 = s3 or boto3.client("s3")
    ses = ses or boto3.client("ses")
    bucket = config.DATA_BUCKET()
    snaps = developments.snapshots(s3, bucket)
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
    before_projects = developments.read_projects(s3, bucket, before_snap)
    after_projects = developments.read_projects(s3, bucket, after_snap)
    by_region = {}
    sender, app_url = config.SENDER_EMAIL(), config.APP_URL()
    sent = skipped = 0
    for alert in store.active_alerts(table):
        region = data.region_name(alert["region"]["id"])
        old, new = before.get(f"{alert['occupation']['code'][:4]}|{region}"), after.get(f"{alert['occupation']['code'][:4]}|{region}")
        if region not in by_region:
            both = before_projects is not None and after_projects is not None
            by_region[region] = developments.changes(before_projects, after_projects, region) if both else []
        changed = by_region[region]
        if not alert.get("email") or (not changed and not (old and new)):
            skipped += 1
            continue
        moved = max(abs(new["tailwind"] - old["tailwind"]), abs(new["jobTrend"] - old["jobTrend"])) if old and new else 0
        if not changed and moved < MIN_CHANGE:
            continue
        try:
            emails.send(ses, sender, alert["email"],
                        emails.grid_update(alert.get("name"), alert, changed, old, new, after_snap, app_url))
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
