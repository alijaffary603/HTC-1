"""The published scores, read from S3 and kept in memory between requests.

The monthly pipeline writes api/latest/scores.json then api/latest/meta.json. We only
re-read scores when meta says a new version is out, and only check that every few
minutes, so most requests never touch S3.
"""
import json
import time

import boto3

from . import config

CHECK_EVERY = 300
_state = {"version": None, "checked": 0.0, "scores": {}}

# The app uses the model's region names as ids. StatCan economic region codes work too;
# 4840 and 4870 are reported together, so they share the northwest numbers.
NORTHWEST = "Banff-Jasper-Rocky Mountain House and Athabasca-Grande Prairie-Peace River"
ECONOMIC_REGIONS = {
    "4810": "Lethbridge-Medicine Hat", "4820": "Camrose-Drumheller", "4830": "Calgary", "4840": NORTHWEST,
    "4850": "Red Deer", "4860": "Edmonton", "4870": NORTHWEST, "4880": "Wood Buffalo-Cold Lake",
}


def region_name(value):
    return ECONOMIC_REGIONS.get(value, value)


def _read(s3, key):
    return json.loads(s3.get_object(Bucket=config.DATA_BUCKET(), Key=key)["Body"].read())


def scores(s3=None, now=None):
    now = now or time.time()
    if _state["scores"] and now - _state["checked"] < CHECK_EVERY:
        return _state["scores"]
    s3 = s3 or boto3.client("s3")
    meta = _read(s3, "api/latest/meta.json")
    version = (meta["modelVersion"], meta["generatedAt"])
    if version != _state["version"]:
        _state["scores"] = _read(s3, "api/latest/scores.json")
        _state["version"] = version
    _state["checked"] = now
    return _state["scores"]


def lookup(occupation, region, s3=None):
    """score() output for a NOC code and region, or None.

    A 5-digit unit group code works too: its first four digits are the minor group
    the model scores, and we echo the code that was sent.
    """
    if not (occupation.isdigit() and len(occupation) in (4, 5)):
        return None
    found = scores(s3).get(f"{occupation[:4]}|{region_name(region)}")
    if found is None:
        return None
    return {**found, "occupation": {"code": occupation, "title": found["occupation"]["title"]}}


def reset():
    _state.update(version=None, checked=0.0, scores={})
