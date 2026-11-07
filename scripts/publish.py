"""Check a fresh build and, if it passes, publish it to S3 for the API.

    python scripts/publish.py --bucket <data bucket>
    python scripts/publish.py --dry-run          # checks only, writes outputs/api_bundle.json

Writes:
    api/latest/scores.json            every response the API serves
    api/latest/meta.json              snapshot date, model version, base job count
    history/<snapshot>/summary.json   the numbers the monthly alert emails compare
    history/<snapshot>/outputs/*      a copy of outputs/ for the record
"""
import argparse
import json
import sys

from gridskills import checks, contract
from gridskills.paths import CONFIG, OUTPUTS

SKILLS_KEY = "api/skills.json"


def _get_json(s3, bucket, key):
    try:
        return json.loads(s3.get_object(Bucket=bucket, Key=key)["Body"].read())
    except s3.exceptions.NoSuchKey:
        return None


def _put_json(s3, bucket, key, data):
    s3.put_object(Bucket=bucket, Key=key, Body=json.dumps(data, separators=(",", ":")).encode(),
                  ContentType="application/json")


def publish(bucket, s3=None, outputs=OUTPUTS):
    import boto3

    s3 = s3 or boto3.client("s3")
    previous = _get_json(s3, bucket, "api/latest/meta.json")
    problems = checks.check_outputs(outputs, previous)
    if problems:
        return problems

    skills = _get_json(s3, bucket, SKILLS_KEY) or _local_skills()
    bundle = contract.build(outputs, skills)
    problems = checks.check_bundle(bundle)
    if problems:
        return problems

    regions = json.loads((outputs / "regions.json").read_text())
    meta = {**bundle["meta"], "jobs_per_year_base": regions["jobs_per_year"]["base"]}
    snapshot = meta["snapshot"]

    for path in sorted(outputs.glob("*")):
        if path.is_file():
            s3.upload_file(str(path), bucket, f"history/{snapshot}/outputs/{path.name}")
    _put_json(s3, bucket, f"history/{snapshot}/summary.json", contract.summary(bundle))
    _put_json(s3, bucket, "api/latest/scores.json", bundle["responses"])
    # meta goes last: the API reads it to decide whether to reload, so it must not
    # point at a version whose scores aren't there yet
    _put_json(s3, bucket, "api/latest/meta.json", meta)
    print(f"published {snapshot}: {meta['responses']} responses, skills included: {meta['skillsIncluded']}")
    return []


def _local_skills():
    path = CONFIG / "skills.json"
    return json.loads(path.read_text()) if path.exists() else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bucket")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.dry_run or not args.bucket:
        problems = checks.check_outputs(OUTPUTS)
        if not problems:
            bundle = contract.build(OUTPUTS, _local_skills())
            problems = checks.check_bundle(bundle)
            (OUTPUTS / "api_bundle.json").write_text(json.dumps(bundle))
            print(f"dry run ok: {bundle['meta']['responses']} responses")
    else:
        problems = publish(args.bucket)

    for p in problems:
        print("CHECK FAILED:", p, file=sys.stderr)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
