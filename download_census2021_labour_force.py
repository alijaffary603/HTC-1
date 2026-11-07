"""Download Census table 98-10-0594-01 and export Alberta-only data."""
import argparse
from pathlib import Path
from tempfile import TemporaryFile
import zipfile
import shutil

import pandas as pd
import requests

PRODUCT_ID = "98100594"
ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "statcan_data"
FILE_PREFIX = "census2021_labour_force_by_occupation_and_industry"
SOURCE = DATA_DIR / f"{FILE_PREFIX}_canada.csv"
METADATA = DATA_DIR / f"{FILE_PREFIX}_metadata.csv"
OUTPUT = DATA_DIR / f"{FILE_PREFIX}_alberta.csv"
CALGARY_OUTPUT = DATA_DIR / f"{FILE_PREFIX}_calgary_cma.csv"


def download_table():
    url = f"https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV/{PRODUCT_ID}/en"
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    result = response.json()
    if result.get("status") != "SUCCESS":
        raise RuntimeError(f"StatCan API error: {result}")
    print("Download URL:", result["object"], flush=True)
    DATA_DIR.mkdir(exist_ok=True)
    with TemporaryFile() as zip_file:
        with requests.get(result["object"], timeout=(30, 300), stream=True) as download:
            download.raise_for_status()
            for block in download.iter_content(chunk_size=1024 * 1024):
                zip_file.write(block)
        zip_file.seek(0)
        with zipfile.ZipFile(zip_file) as archive:
            for name, destination in ((f"{PRODUCT_ID}.csv", SOURCE),
                                      (f"{PRODUCT_ID}_MetaData.csv", METADATA)):
                with archive.open(name) as source, destination.open("wb") as target:
                    shutil.copyfileobj(source, target)
                print("Extracted:", destination.name, flush=True)


def export_alberta():
    source = SOURCE
    if not source.is_file():
        raise FileNotFoundError(f"Missing {source}; run without --skip-download first")
    scanned = kept = calgary_count = 0
    geographies = set()
    # Preserve text, codes, suppression symbols, and empty cells as supplied.
    with OUTPUT.open("w", encoding="utf-8", newline="") as alberta_file, \
            CALGARY_OUTPUT.open("w", encoding="utf-8", newline="") as calgary_file:
        for chunk in pd.read_csv(source, chunksize=100000, dtype=str, keep_default_na=False):
            if scanned == 0:
                chunk.iloc[:0].to_csv(alberta_file, index=False)
                chunk.iloc[:0].to_csv(calgary_file, index=False)
                print("Columns:", chunk.columns.tolist(), flush=True)
            # Exclude combined Alta./Sask. Lloydminster; retain its Alberta part.
            selected = chunk.loc[chunk["GEO"].eq("Alberta") |
                                 chunk["GEO"].str.endswith(", Alta.")]
            selected.to_csv(alberta_file, index=False, header=False)
            calgary = selected.loc[selected["GEO"].eq("Calgary (CMA), Alta.")]
            calgary.to_csv(calgary_file, index=False, header=False)
            scanned += len(chunk)
            kept += len(selected)
            calgary_count += len(calgary)
            geographies.update(selected["GEO"].unique())
            if scanned % 5000000 == 0:
                print(f"Scanned {scanned:,}; retained {kept:,} Alberta rows", flush=True)
    if not kept or not calgary_count:
        raise RuntimeError("Expected Alberta and Calgary data were not found")
    print(f"Scanned {scanned:,} rows; exported {kept:,} Alberta rows and {calgary_count:,} Calgary rows")
    print("Alberta geographies:", sorted(geographies))
    print("Alberta output:", OUTPUT)
    print("Calgary output:", CALGARY_OUTPUT)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-download", action="store_true",
                        help="Filter the already downloaded national CSV")
    args = parser.parse_args()
    if not args.skip_download:
        download_table()
    export_alberta()


if __name__ == "__main__":
    main()

