"""Everything we keep about users, in one DynamoDB table.

    pk = USER#<cognito sub>   sk = PATHWAY#<id> | ALERT#<id>

Pathways the owner chose to share also get gsi1pk = SHARE#<region id>, which is how
"people making a similar move" finds them. Nothing is shared unless the owner turns
it on.
"""
import uuid
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Attr, Key

from . import config


def _table(table=None):
    return table or boto3.resource("dynamodb").Table(config.TABLE_NAME())


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _user(sub):
    return f"USER#{sub}"


def _query(table, sub, prefix):
    rows = _table(table).query(KeyConditionExpression=Key("pk").eq(_user(sub)) & Key("sk").begins_with(prefix))
    return rows["Items"]


# pathways

def _pathway_out(item):
    return {k: item[k] for k in ("id", "from", "to", "region", "savedAt")} | {"share": bool(item.get("share"))}


def list_pathways(sub, table=None):
    items = sorted(_query(table, sub, "PATHWAY#"), key=lambda i: i["savedAt"], reverse=True)
    return [_pathway_out(i) for i in items]


def save_pathway(sub, claims, body, table=None):
    for existing in _query(table, sub, "PATHWAY#"):
        if (existing["from"]["code"], existing["to"]["code"], existing["region"]["id"]) == (
            body["from"]["code"], body["to"]["code"], body["region"]["id"],
        ):
            return _pathway_out(existing)
    item = {
        "pk": _user(sub),
        "sk": None,
        "id": str(uuid.uuid4()),
        "from": _occupation(body["from"]),
        "to": _occupation(body["to"]),
        "region": _region(body["region"]),
        "savedAt": _now(),
        "share": False,
        "firstName": claims.get("name", "").split(" ")[0] or "Someone",
        "email": claims.get("email", ""),
    }
    item["sk"] = f"PATHWAY#{item['id']}"
    _table(table).put_item(Item=item)
    return _pathway_out(item)


def set_pathway_share(sub, pathway_id, share, table=None):
    t = _table(table)
    key = {"pk": _user(sub), "sk": f"PATHWAY#{pathway_id}"}
    item = t.get_item(Key=key).get("Item")
    if not item:
        return None
    if share:
        t.update_item(Key=key, UpdateExpression="SET #s = :t, gsi1pk = :p, gsi1sk = :k",
                      ExpressionAttributeNames={"#s": "share"},
                      ExpressionAttributeValues={":t": True, ":p": f"SHARE#{item['region']['id']}",
                                                 ":k": f"{item['to']['code']}#{item['id']}"})
    else:
        t.update_item(Key=key, UpdateExpression="SET #s = :f REMOVE gsi1pk, gsi1sk",
                      ExpressionAttributeNames={"#s": "share"}, ExpressionAttributeValues={":f": False})
    return _pathway_out({**item, "share": share})


def delete_pathway(sub, pathway_id, table=None):
    _table(table).delete_item(Key={"pk": _user(sub), "sk": f"PATHWAY#{pathway_id}"})


def matches(region_id, from_code, to_code=None, viewer=None, table=None):
    """Shared pathways in a region, closest first. Same move ranks above same starting job."""
    rows = _table(table).query(IndexName="gsi1", KeyConditionExpression=Key("gsi1pk").eq(f"SHARE#{region_id}"))
    out = []
    for item in rows["Items"]:
        if viewer and item["pk"] == _user(viewer):
            continue
        score = (2 if item["from"]["code"] == from_code else 0) + (3 if to_code and item["to"]["code"] == to_code else 0)
        if score >= 2:
            month = datetime.fromisoformat(item["savedAt"]).strftime("%B %Y")
            out.append((score, {
                "id": item["id"], "firstName": item["firstName"], "region": item["region"],
                "from": item["from"], "to": item["to"], "kind": "peer",
                "blurb": f"Looking at this move since {month}.",
            }))
    return [m for _, m in sorted(out, key=lambda x: -x[0])]


def shared_pathway(region_id, pathway_id, table=None):
    rows = _table(table).query(IndexName="gsi1", KeyConditionExpression=Key("gsi1pk").eq(f"SHARE#{region_id}"),
                               FilterExpression=Attr("id").eq(pathway_id))
    return rows["Items"][0] if rows["Items"] else None


# alerts

def _alert_out(item):
    return {k: item[k] for k in ("id", "occupation", "region", "frequency", "active", "createdAt")}


def list_alerts(sub, table=None):
    items = sorted(_query(table, sub, "ALERT#"), key=lambda i: i["createdAt"], reverse=True)
    return [_alert_out(i) for i in items]


def create_alert(sub, claims, body, table=None):
    for existing in _query(table, sub, "ALERT#"):
        if existing["occupation"]["code"] == body["occupation"]["code"] and existing["region"]["id"] == body["region"]["id"]:
            return _alert_out(existing), False
    alert_id = str(uuid.uuid4())
    item = {
        "pk": _user(sub), "sk": f"ALERT#{alert_id}", "id": alert_id,
        "occupation": _occupation(body["occupation"]), "region": _region(body["region"]),
        "frequency": body.get("frequency", "weekly"), "active": True, "createdAt": _now(),
        "email": claims.get("email", ""), "name": claims.get("name", ""),
    }
    _table(table).put_item(Item=item)
    return _alert_out(item), True


def update_alert(sub, alert_id, patch, table=None):
    t = _table(table)
    key = {"pk": _user(sub), "sk": f"ALERT#{alert_id}"}
    item = t.get_item(Key=key).get("Item")
    if not item:
        return None
    for field in ("active", "frequency"):
        if field in patch:
            item[field] = patch[field]
    t.put_item(Item=item)
    return _alert_out(item)


def delete_alert(sub, alert_id, table=None):
    _table(table).delete_item(Key={"pk": _user(sub), "sk": f"ALERT#{alert_id}"})


def active_alerts(table=None):
    """Every switched-on alert. A scan is fine at this size; add an index past a few thousand users."""
    t = _table(table)
    kwargs = {"FilterExpression": Attr("sk").begins_with("ALERT#") & Attr("active").eq(True)}
    items = []
    while True:
        page = t.scan(**kwargs)
        items += page["Items"]
        if "LastEvaluatedKey" not in page:
            return items
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def _occupation(o):
    return {"code": str(o["code"]), "title": str(o["title"])}


def _region(r):
    return {"id": str(r["id"]), "name": str(r["name"])}
