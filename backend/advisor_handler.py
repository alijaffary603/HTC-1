"""Lambda entry point for the career advisor (/api/advisor, /api/resources, /api/mentors).

The advisor itself is gridskills/server.py and gridskills/advisor.py. It reads
GEMINI_API_KEY from the environment, so we fetch it from SSM once per cold start
instead of putting the key in the Lambda's configuration.
"""
import os

import boto3

from gridskills.server import lambda_handler


def handler(event, context):
    if not os.environ.get("GEMINI_API_KEY"):
        param = boto3.client("ssm").get_parameter(Name=os.environ["GEMINI_KEY_PARAM"], WithDecryption=True)
        os.environ["GEMINI_API_KEY"] = param["Parameter"]["Value"]
    return lambda_handler(event, context)
