"""What changed on AESO's connection list between two monthly snapshots, by region.

The pipeline keeps each month's outputs/projects.csv under history/<snapshot>/outputs/.
That file lists projects still waiting to connect, so a project that drops off between
months was built, cancelled or withdrawn; the list doesn't say which, and neither do we.

Change kinds, in the order emails show them:
    new        on this month's list, not last month's
    advanced   moved to a later connection stage, or came off hold
    earlier    same stage, in-service date moved earlier
    delayed    same stage, in-service date moved later, or its date went under review
    on_hold    put on hold
    left       on last month's list, not this month's
"""
import csv
import io

STAGES = {"cluster": 0, "early": 1, "mid": 2, "late": 3}
KINDS = ["new", "advanced", "earlier", "delayed", "on_hold", "left"]


def read_projects(s3, bucket, snapshot):
    """Rows of that month's projects.csv, or None if it wasn't published."""
    try:
        body = s3.get_object(Bucket=bucket, Key=f"history/{snapshot}/outputs/projects.csv")["Body"].read()
    except s3.exceptions.NoSuchKey:
        return None
    return list(csv.DictReader(io.StringIO(body.decode("utf-8"))))


def _number(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _project(row):
    return {
        "projectId": row["project_id"],
        "name": (row.get("name") or row["project_id"]).strip(),
        "tech": row.get("tech", ""),
        "mw": round(_number(row.get("mw")), 1),
        "state": row.get("state", ""),
        "isd": (row.get("isd") or "").strip(),
        "likelihood": round(_number(row.get("p_base")), 2),
    }


def _month_index(isd):
    try:
        year, month = isd.split("-")[:2]
        return int(year) * 12 + int(month)
    except (AttributeError, ValueError):
        return None


def changes(before_rows, after_rows, region):
    """Changes in one region (a model region name), most important kind first, biggest first."""
    before = {r["project_id"]: _project(r) for r in before_rows or [] if r.get("region") == region}
    after = {r["project_id"]: _project(r) for r in after_rows or [] if r.get("region") == region}
    out = [{**after[i], "kind": "new"} for i in after.keys() - before.keys()]
    out += [{**before[i], "kind": "left"} for i in before.keys() - after.keys()]

    for i in after.keys() & before.keys():
        old, new = before[i], after[i]
        extra = {}
        if old["isd"] != new["isd"] and old["isd"]:
            extra["previousIsd"] = old["isd"]
        if new["state"] != old["state"]:
            kind = None
            if new["state"] == "on_hold":
                kind = "on_hold"
            elif new["state"] == "isd_review":
                kind = "delayed"
            elif new["state"] in STAGES and (old["state"] not in STAGES or STAGES[new["state"]] > STAGES[old["state"]]):
                kind = "advanced"
            if kind:
                out.append({**new, **extra, "kind": kind, "previousState": old["state"]})
                continue
        moved_from, moved_to = _month_index(old["isd"]), _month_index(new["isd"])
        if moved_from and moved_to and moved_from != moved_to:
            out.append({**new, **extra, "kind": "delayed" if moved_to > moved_from else "earlier"})

    out.sort(key=lambda d: (KINDS.index(d["kind"]), -d["mw"], d["name"]))
    return out


def snapshots(s3, bucket):
    """Published months, oldest first."""
    rows = s3.list_objects_v2(Bucket=bucket, Prefix="history/", Delimiter="/")
    return sorted(p["Prefix"].split("/")[1] for p in rows.get("CommonPrefixes", []))


def latest(region, s3=None):
    """Changes in a region between the two latest published months, for the API."""
    import boto3

    from . import config

    s3 = s3 or boto3.client("s3")
    bucket = config.DATA_BUCKET()
    months = snapshots(s3, bucket)
    if len(months) < 2:
        return {"snapshot": months[-1] if months else None, "previous": None, "region": region, "developments": []}
    previous, snapshot = months[-2], months[-1]
    # two small CSVs per request; not cached, so a new month shows up straight away
    before, after = read_projects(s3, bucket, previous), read_projects(s3, bucket, snapshot)
    found = changes(before, after, region) if before is not None and after is not None else []
    return {"snapshot": snapshot, "previous": previous, "region": region, "developments": found}
