"""Saved résumé files: one private object per person in the résumé bucket.

Only used when a signed-in person chooses to save their résumé to their account.
Keys are resumes/<cognito sub>/<uuid>.<ext>, so one person's files never share a
prefix with anyone else's. The bucket has no versioning, so deleting really deletes.
"""
import re
import uuid
from urllib.parse import quote

import boto3

from . import config


def _s3(s3=None):
    return s3 or boto3.client("s3")


def put(sub, filename, mime_type, content, s3=None):
    """Stores the file and returns its key."""
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    key = f"resumes/{sub}/{uuid.uuid4()}.{extension}"
    _s3(s3).put_object(Bucket=config.RESUME_BUCKET(), Key=key, Body=content, ContentType=mime_type,
                       ServerSideEncryption="AES256")
    return key


def delete(key, s3=None):
    _s3(s3).delete_object(Bucket=config.RESUME_BUCKET(), Key=key)


def download_url(key, filename, mime_type, s3=None, expires=300):
    """A link to download the file that works for 5 minutes, named as it was uploaded."""
    plain = re.sub(r"[^A-Za-z0-9._ -]", "_", filename)[:120] or "resume"
    disposition = f"attachment; filename=\"{plain}\"; filename*=UTF-8''{quote(filename)}"
    return _s3(s3).generate_presigned_url(
        "get_object",
        Params={"Bucket": config.RESUME_BUCKET(), "Key": key,
                "ResponseContentDisposition": disposition, "ResponseContentType": mime_type},
        ExpiresIn=expires,
    )
