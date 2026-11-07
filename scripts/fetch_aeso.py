"""Download any AESO project lists we don't have yet.

Reads the AESO connection project reporting page, finds every monthly Excel file
linked from it and fetches the ones missing from data/aeso_project_lists/. Prints
what it got. Exits 0 even when there's nothing new, which is the usual case.
"""
import re
import sys
import urllib.request
from pathlib import Path

from gridskills.paths import PROJECT_LISTS

PAGE = "https://www.aeso.ca/grid/transmission-projects/connection-project-reporting/"
BASE = "https://www.aeso.ca"
LINK = re.compile(r'href="(/assets/Uploads/project-reporting/(\w+-\d{4}-Project-List\.xlsx))"')
HEADERS = {"User-Agent": "GridSkills data refresh (monthly)"}


def list_links(html):
    """(url, filename) for every monthly list on the page, without duplicates."""
    seen = {}
    for path, name in LINK.findall(html):
        seen.setdefault(name, BASE + path)
    return [(url, name) for name, url in seen.items()]


def _get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as r:
        return r.read()


def fetch_missing(folder=PROJECT_LISTS, get=_get):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    html = get(PAGE).decode("utf-8", errors="replace")
    fetched = []
    for url, name in list_links(html):
        target = folder / name
        if target.exists():
            continue
        data = get(url)
        # an HTML error page saved as .xlsx would break the parser in a confusing way
        if not data.startswith(b"PK"):
            raise RuntimeError(f"{name} doesn't look like an Excel file")
        target.write_bytes(data)
        fetched.append(name)
    return fetched


if __name__ == "__main__":
    new = fetch_missing()
    print("new lists:", ", ".join(new) if new else "none")
    sys.exit(0)
