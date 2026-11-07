"""Deploy or update the whole AWS stack, then publish data and the web app.

    python scripts/deploy.py --sender-email you@example.com --admin-email you@example.com

Needs AWS credentials (run `aws configure` first), Node for the frontend build, and
the raw data in data/. Safe to re-run: every step either updates in place or skips
work that's already done.

Steps:
  1. Store the Gemini API key in SSM Parameter Store, if it isn't there yet
  2. Package the Lambda code with Linux wheels (no Docker needed)
  3. Deploy aws/template.yaml with CloudFormation
  4. Upload the repo for the monthly CodeBuild job, and the raw data it needs
  5. Publish this month's scores
  6. Build the frontend against the new stack and upload it
"""
import argparse
import getpass
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
LAMBDA_DIR = BUILD / "lambda"
ADVISOR_DIR = BUILD / "advisor"
FRONTEND = ROOT / "frontend"

# raw inputs the monthly job needs, relative to data/. The 12 GB census zip isn't one.
RAW = [
    "aeso_project_lists",
    "aeso_planning_area_load",
    "statcan_lfs/14100466.zip",
    "ab_multipliers/tbf-alberta-economic-multipliers-2022.xlsx",
    "processed/census_alberta.parquet",
]


def tool(name):
    """Find a command line tool, preferring a system install over the venv one."""
    found = shutil.which(name)
    for candidate in {
        "aws": [r"C:\Program Files\Amazon\AWSCLIV2\aws.exe"],
        "npm": [r"C:\Program Files\nodejs\npm.cmd"],
    }.get(name, []):
        if not found and Path(candidate).exists():
            found = candidate
    if not found:
        sys.exit(f"{name} isn't installed or isn't on PATH")
    return found


def run(*cmd, cwd=ROOT, env=None):
    print("  $", " ".join(str(c) for c in cmd))
    subprocess.run([str(c) for c in cmd], cwd=cwd, env=env, check=True)


def step(text):
    print(f"\n== {text}")


def ensure_gemini_key(ssm, name):
    try:
        ssm.get_parameter(Name=name)
        print(f"  {name} already set")
        return
    except ClientError as e:
        if e.response["Error"]["Code"] != "ParameterNotFound":
            raise
    key = os.environ.get("GEMINI_API_KEY") or getpass.getpass("Gemini API key (input hidden): ").strip()
    if not key:
        sys.exit("No Gemini API key given")
    ssm.put_parameter(Name=name, Value=key, Type="SecureString", Description="GridSkills résumé matching")
    print(f"  stored {name}")


def ensure_artifact_bucket(s3, account, region):
    name = f"gridskills-artifacts-{account}-{region}"
    try:
        s3.head_bucket(Bucket=name)
    except ClientError:
        kwargs = {} if region == "us-east-1" else {"CreateBucketConfiguration": {"LocationConstraint": region}}
        s3.create_bucket(Bucket=name, **kwargs)
        s3.put_public_access_block(Bucket=name, PublicAccessBlockConfiguration={
            "BlockPublicAcls": True, "IgnorePublicAcls": True, "BlockPublicPolicy": True, "RestrictPublicBuckets": True})
        print(f"  created {name}")
    return name


def package_lambda():
    """Lambda runs Linux, so ask pip for Linux wheels instead of building in Docker."""
    shutil.rmtree(LAMBDA_DIR, ignore_errors=True)
    LAMBDA_DIR.mkdir(parents=True)
    run(sys.executable, "-m", "pip", "install", "--quiet", "--target", LAMBDA_DIR,
        "--platform", "manylinux2014_x86_64", "--implementation", "cp", "--python-version", "3.12",
        "--only-binary=:all:", "google-genai")
    shutil.copytree(ROOT / "backend" / "gridapi", LAMBDA_DIR / "gridapi",
                    ignore=shutil.ignore_patterns("__pycache__"))


def package_advisor():
    """The advisor runs the model's own score(), so it needs pandas, gridskills and outputs/."""
    shutil.rmtree(ADVISOR_DIR, ignore_errors=True)
    ADVISOR_DIR.mkdir(parents=True)
    run(sys.executable, "-m", "pip", "install", "--quiet", "--target", ADVISOR_DIR,
        "--platform", "manylinux2014_x86_64", "--implementation", "cp", "--python-version", "3.12",
        "--only-binary=:all:", "pandas>=2.2")
    shutil.copytree(ROOT / "gridskills", ADVISOR_DIR / "gridskills", ignore=shutil.ignore_patterns("__pycache__"))
    for folder, pattern in (("outputs", "*.csv"), ("outputs", "*.json"), ("config", "advisor_*.json")):
        (ADVISOR_DIR / folder).mkdir(exist_ok=True)
        for f in (ROOT / folder).glob(pattern):
            if f.name != "api_bundle.json":
                shutil.copy2(f, ADVISOR_DIR / folder / f.name)
    shutil.copy2(ROOT / "backend" / "advisor_handler.py", ADVISOR_DIR / "advisor_handler.py")


def stack_outputs(cfn, stack):
    outputs = cfn.describe_stacks(StackName=stack)["Stacks"][0].get("Outputs", [])
    return {o["OutputKey"]: o["OutputValue"] for o in outputs}


def upload_source(s3, bucket):
    if subprocess.run(["git", "diff", "--quiet", "HEAD"], cwd=ROOT).returncode != 0:
        print("  note: you have uncommitted changes, the monthly job only gets what's committed")
    with tempfile.TemporaryDirectory() as tmp:
        archive = Path(tmp) / "source.zip"
        run("git", "archive", "--format", "zip", "-o", archive, "HEAD")
        s3.upload_file(str(archive), bucket, "code/source.zip")


def upload_raw(s3, bucket):
    data = ROOT / "data"
    for entry in RAW:
        path = data / entry
        files = sorted(p for p in path.rglob("*") if p.is_file()) if path.is_dir() else [path]
        for f in files:
            if not f.exists():
                print(f"  missing {f.relative_to(ROOT)}, skipping")
                continue
            key = "raw/" + f.relative_to(data).as_posix()
            try:
                if s3.head_object(Bucket=bucket, Key=key)["ContentLength"] == f.stat().st_size:
                    continue
            except ClientError:
                pass
            s3.upload_file(str(f), bucket, key)
            print(f"  uploaded {key}")


def build_frontend(outputs, region):
    env = {
        **os.environ,
        "VITE_API_URL": "/api",
        "VITE_COGNITO_REGION": region,
        "VITE_COGNITO_CLIENT_ID": outputs["UserPoolClientId"],
    }
    npm = tool("npm")
    run(npm, "ci", "--no-audit", "--no-fund", cwd=FRONTEND, env=env)
    run(npm, "run", "build", cwd=FRONTEND, env=env)


def upload_frontend(aws, outputs):
    site = f"s3://{outputs['SiteBucket']}"
    dist = FRONTEND / "dist"
    # hashed assets can be cached forever, index.html must always be fresh
    run(aws, "s3", "sync", dist, site, "--delete", "--exclude", "index.html",
        "--cache-control", "public,max-age=31536000,immutable", "--only-show-errors")
    run(aws, "s3", "cp", dist / "index.html", f"{site}/index.html", "--cache-control", "no-cache")
    run(aws, "cloudfront", "create-invalidation", "--distribution-id", outputs["DistributionId"],
        "--paths", "/index.html", "--output", "text", "--query", "Invalidation.Id")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sender-email", required=True)
    parser.add_argument("--admin-email", default="")
    parser.add_argument("--region", default="ca-central-1")
    parser.add_argument("--stack", default="gridskills")
    parser.add_argument("--gemini-model", default="gemini-3.5-flash-lite")
    parser.add_argument("--skip-frontend", action="store_true")
    parser.add_argument("--skip-data", action="store_true")
    args = parser.parse_args()

    session = boto3.Session(region_name=args.region)
    account = session.client("sts").get_caller_identity()["Account"]
    print(f"Deploying {args.stack} to account {account} in {args.region}")
    s3, cfn = session.client("s3"), session.client("cloudformation")
    aws = tool("aws")

    step("Gemini API key")
    ensure_gemini_key(session.client("ssm"), "/gridskills/gemini-api-key")

    step("Lambda packages")
    package_lambda()
    package_advisor()

    step("CloudFormation")
    artifacts = ensure_artifact_bucket(s3, account, args.region)
    BUILD.mkdir(exist_ok=True)
    packaged = BUILD / "packaged.yaml"
    run(aws, "cloudformation", "package", "--template-file", ROOT / "aws" / "template.yaml",
        "--s3-bucket", artifacts, "--output-template-file", packaged, "--region", args.region)
    run(aws, "cloudformation", "deploy", "--template-file", packaged, "--stack-name", args.stack,
        "--region", args.region, "--capabilities", "CAPABILITY_IAM", "CAPABILITY_AUTO_EXPAND",
        "--no-fail-on-empty-changeset", "--parameter-overrides",
        f"SenderEmail={args.sender_email}", f"AdminEmail={args.admin_email}", f"GeminiModel={args.gemini_model}")
    outputs = stack_outputs(cfn, args.stack)

    if not args.skip_data:
        step("Source and raw data for the monthly job")
        upload_source(s3, outputs["DataBucket"])
        upload_raw(s3, outputs["DataBucket"])

        step("Publish scores")
        sys.path.insert(0, str(ROOT / "scripts"))
        from publish import publish

        problems = publish(outputs["DataBucket"], s3)
        if problems:
            sys.exit("publish checks failed:\n  " + "\n  ".join(problems))

    if not args.skip_frontend:
        step("Frontend")
        build_frontend(outputs, args.region)
        upload_frontend(aws, outputs)

    print("\nDone.")
    print(json.dumps(outputs, indent=2))
    print(f"\nOpen {outputs['SiteUrl']}")
    print(f"SES sent a verification link to {args.sender_email}. Click it before emails can go out.")
    print("While SES is in sandbox mode it only delivers to verified addresses. See docs/aws.md.")


if __name__ == "__main__":
    main()
