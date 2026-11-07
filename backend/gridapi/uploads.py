"""Reading the résumé upload out of an API Gateway event."""
import base64
from email.parser import BytesParser
from email.policy import default

MAX_BYTES = 4 * 1024 * 1024

# what Gemini reads directly, by file extension
MIME_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "doc": "application/msword",
    "txt": "text/plain",
}


class UploadError(ValueError):
    pass


def resume_file(event):
    """(filename, mime type, bytes) for the 'resume' field of a multipart upload."""
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    content_type = headers.get("content-type", "")
    if not content_type.startswith("multipart/form-data"):
        raise UploadError("Send the file as multipart/form-data with the field name 'resume'.")
    body = event.get("body") or ""
    raw = base64.b64decode(body) if event.get("isBase64Encoded") else body.encode("latin-1")
    if len(raw) > MAX_BYTES + 10_000:
        raise UploadError("That file is over 4 MB. Try a smaller PDF.")

    message = BytesParser(policy=default).parsebytes(
        b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + raw
    )
    for part in message.iter_parts():
        if part.get_param("name", header="content-disposition") != "resume":
            continue
        name = part.get_filename() or "resume"
        data = part.get_payload(decode=True) or b""
        extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if extension not in MIME_TYPES:
            raise UploadError("Use a PDF, Word or plain text file.")
        if not data:
            raise UploadError("That file is empty.")
        if len(data) > MAX_BYTES:
            raise UploadError("That file is over 4 MB. Try a smaller PDF.")
        return name, MIME_TYPES[extension], data
    raise UploadError("No file named 'resume' in the upload.")
