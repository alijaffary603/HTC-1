import importlib.util
import json

import boto3
import pytest
from moto import mock_aws

from gridskills.paths import OUTPUTS, ROOT


def _load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


fetch_aeso = _load("fetch_aeso")
publish = _load("publish")

PAGE = """
<a href="/assets/Uploads/project-reporting/November-2026-Project-List.xlsx">Nov</a>
<a href="/assets/Uploads/project-reporting/October-2026-Project-List.xlsx">Oct</a>
<a href="/assets/Uploads/project-reporting/October-2026-Project-List.xlsx">Oct again</a>
<a href="/assets/AESO-Connection-Project-List-Guide-v2.pdf">guide</a>
"""


def test_list_links_dedupes_and_ignores_other_files():
    links = fetch_aeso.list_links(PAGE)
    assert [n for _, n in links] == ["November-2026-Project-List.xlsx", "October-2026-Project-List.xlsx"]
    assert links[0][0].startswith("https://www.aeso.ca/assets/Uploads/")


def test_fetch_only_downloads_what_is_missing(tmp_path):
    (tmp_path / "October-2026-Project-List.xlsx").write_bytes(b"PK old")
    calls = []

    def fake_get(url):
        calls.append(url)
        return PAGE.encode() if url == fetch_aeso.PAGE else b"PK new file"

    assert fetch_aeso.fetch_missing(tmp_path, fake_get) == ["November-2026-Project-List.xlsx"]
    assert len(calls) == 2


def test_fetch_refuses_an_html_error_page(tmp_path):
    def fake_get(url):
        return PAGE.encode() if url == fetch_aeso.PAGE else b"<html>blocked</html>"

    with pytest.raises(RuntimeError):
        fetch_aeso.fetch_missing(tmp_path, fake_get)


@pytest.fixture
def aws_env(monkeypatch):
    for k, v in {"AWS_ACCESS_KEY_ID": "test", "AWS_SECRET_ACCESS_KEY": "test", "AWS_DEFAULT_REGION": "ca-central-1"}.items():
        monkeypatch.setenv(k, v)


@pytest.mark.skipif(not (OUTPUTS / "scores.csv").exists(), reason="run scripts/build_all.py first")
def test_publish_writes_meta_last_and_blocks_bad_builds(aws_env):
    with mock_aws():
        s3 = boto3.client("s3", region_name="ca-central-1")
        s3.create_bucket(Bucket="data", CreateBucketConfiguration={"LocationConstraint": "ca-central-1"})
        assert publish.publish("data", s3) == []

        meta = json.loads(s3.get_object(Bucket="data", Key="api/latest/meta.json")["Body"].read())
        scores = json.loads(s3.get_object(Bucket="data", Key="api/latest/scores.json")["Body"].read())
        assert meta["responses"] == len(scores) == 162 * 7
        assert s3.head_object(Bucket="data", Key=f"history/{meta['snapshot']}/summary.json")

        # pretend last month's estimate was ten times bigger: this build must not go out
        meta["jobs_per_year_base"] *= 10
        s3.put_object(Bucket="data", Key="api/latest/meta.json", Body=json.dumps(meta).encode())
        assert publish.publish("data", s3)
        still = json.loads(s3.get_object(Bucket="data", Key="api/latest/meta.json")["Body"].read())
        assert still["jobs_per_year_base"] == meta["jobs_per_year_base"]
