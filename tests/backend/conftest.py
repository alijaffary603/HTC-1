import json
import sys
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

REGION = "ca-central-1"
BUCKET = "gridskills-data"
TABLE = "gridskills-users"
SENDER = "alerts@example.com"


def response(code, region, title, tailwind=50, trend=50):
    """Same shape as gridskills.api.score()."""
    return {
        "occupation": {"code": code, "title": title},
        "region": region,
        "tailwind": {"score": tailwind, "range": [tailwind - 5, tailwind + 5]},
        "job_trend": {"score": trend},
        "exposure": {"score": 10},
        "adjacent_roles": [],
        "caveats": [],
    }


@pytest.fixture
def aws(monkeypatch):
    env = {"AWS_ACCESS_KEY_ID": "test", "AWS_SECRET_ACCESS_KEY": "test", "AWS_DEFAULT_REGION": REGION,
           "DATA_BUCKET": BUCKET, "TABLE_NAME": TABLE, "SENDER_EMAIL": SENDER, "APP_URL": "https://app.example"}
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    with mock_aws():
        s3 = boto3.client("s3", region_name=REGION)
        s3.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": REGION})
        scores = {
            "4122|Red Deer": response("4122", "Red Deer", "Secondary, elementary and kindergarten school teachers"),
            "7220|Red Deer": response("7220", "Red Deer", "Technical electrical trades", 90, 40),
        }
        s3.put_object(Bucket=BUCKET, Key="api/latest/scores.json", Body=json.dumps(scores).encode())
        s3.put_object(Bucket=BUCKET, Key="api/latest/meta.json",
                      Body=json.dumps({"modelVersion": "aeso-2026-11", "generatedAt": "t1"}).encode())

        dynamo = boto3.resource("dynamodb", region_name=REGION)
        dynamo.create_table(
            TableName=TABLE, BillingMode="PAY_PER_REQUEST",
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
            AttributeDefinitions=[{"AttributeName": n, "AttributeType": "S"} for n in ("pk", "sk", "gsi1pk", "gsi1sk")],
            GlobalSecondaryIndexes=[{
                "IndexName": "gsi1",
                "KeySchema": [{"AttributeName": "gsi1pk", "KeyType": "HASH"}, {"AttributeName": "gsi1sk", "KeyType": "RANGE"}],
                "Projection": {"ProjectionType": "ALL"},
            }],
        )
        ses = boto3.client("ses", region_name=REGION)
        ses.verify_email_identity(EmailAddress=SENDER)

        from gridapi import data
        data.reset()
        yield {"s3": s3, "ses": ses}


def event(route, sub=None, query=None, body=None, path=None, claims=None):
    e = {"routeKey": route, "queryStringParameters": query, "pathParameters": path, "headers": {}}
    if body is not None:
        e["body"] = json.dumps(body)
    if sub:
        c = {"sub": sub, "email": f"{sub}@example.com", "name": sub.capitalize()}
        c.update(claims or {})
        e["requestContext"] = {"authorizer": {"jwt": {"claims": c}}}
    return e
