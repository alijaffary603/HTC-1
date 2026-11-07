"""Pull the Alberta rows out of StatCan table 98-10-0594.

The CSV is 12 GB uncompressed so we stream it from the zip instead of extracting.
Takes a few minutes. Writes data/processed/census_alberta.parquet.
"""
import csv
import io
import re
import sys
import zipfile

import pandas as pd

from gridskills.paths import CENSUS_ZIP, PROCESSED

# geography names as they appear in the file; Lloydminster uses the Alberta part only
GEOS = [
    "Alberta", "Brooks (CA), Alta.", "Calgary (CMA), Alta.", "Camrose (CA), Alta.",
    "Canmore (CA), Alta.", "Edmonton (CMA), Alta.", "Grande Prairie (CA), Alta.",
    "High River (CA), Alta.", "Lacombe (CA), Alta.", "Lethbridge (CMA), Alta.",
    "Lloydminster (Alberta part) (CA), Alta.", "Medicine Hat (CA), Alta.",
    "Okotoks (CA), Alta.", "Red Deer (CMA), Alta.", "Strathmore (CA), Alta.",
    "Sylvan Lake (CA), Alta.", "Wetaskiwin (CA), Alta.", "Wood Buffalo (CA), Alta.",
]
FOUR_DIGIT = re.compile(r"^\d{4} ")
SECTOR = re.compile(r"^\d\d(-\d\d)? ")


def wanted_prefixes():
    out = []
    for g in GEOS:
        field = f'"{g}"' if "," in g else g
        out.append(f"2021,{field},")
    return tuple(out)


def main(zip_path=CENSUS_ZIP):
    prefixes = wanted_prefixes()
    rows = []
    seen_alberta = False
    scanned = 0
    with zipfile.ZipFile(zip_path) as z, z.open("98100594.csv") as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace", newline="")
        header = next(csv.reader([next(text)]))
        for line in text:
            scanned += 1
            if scanned % 10_000_000 == 0:
                print(f"scanned {scanned:,} lines, kept {len(rows):,}", flush=True)
            if not line.startswith(prefixes):
                # geographies are contiguous, so once we've left Alberta we're done
                if seen_alberta and line.startswith('2021,"British Columbia') or (
                    seen_alberta and line.startswith("2021,British Columbia")
                ):
                    break
                continue
            seen_alberta = True
            rec = next(csv.reader([line]))
            industry, age, gender, stat, occ = rec[3], rec[4], rec[5], rec[6], rec[7]
            if age != "Total - Age" or gender != "Total - Gender" or stat != "Count":
                continue
            if not (occ == "All occupations" or FOUR_DIGIT.match(occ)):
                continue
            if not (industry == "All industries" or SECTOR.match(industry)):
                continue
            rows.append((rec[1], industry, occ, rec[9], rec[11]))

    df = pd.DataFrame(rows, columns=["geo", "industry", "occupation", "labour_force", "employed"])
    for c in ("labour_force", "employed"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    PROCESSED.mkdir(parents=True, exist_ok=True)
    df.to_parquet(PROCESSED / "census_alberta.parquet", index=False)
    print(f"done: {len(df):,} rows, {df.geo.nunique()} geographies, header={header[:8]}")


if __name__ == "__main__":
    main(*sys.argv[1:])
