import os


def env(name, default=None):
    value = os.environ.get(name, default)
    if value is None:
        raise RuntimeError(f"{name} isn't set, check the Lambda's environment in aws/template.yaml")
    return value


DATA_BUCKET = lambda: env("DATA_BUCKET")
TABLE_NAME = lambda: env("TABLE_NAME")
SENDER_EMAIL = lambda: env("SENDER_EMAIL", "")
APP_URL = lambda: env("APP_URL", "")
GEMINI_MODEL = lambda: env("GEMINI_MODEL", "gemini-3.5-flash-lite")
GEMINI_KEY_PARAM = lambda: env("GEMINI_KEY_PARAM", "/gridskills/gemini-api-key")
