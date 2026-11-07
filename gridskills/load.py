"""Yearly average electricity load by planning area, from the AESO hourly files."""
import re
import zipfile
from pathlib import Path

import pandas as pd

from .paths import LOAD_ZIPS, PROCESSED
from .regions import PLANNING_AREA_TO_REGION


def read_year(path):
    year = int(re.search(r"(\d{4})\.zip$", Path(path).name)[1])
    with zipfile.ZipFile(path) as z:
        name = z.infolist()[0].filename
        df = pd.read_csv(z.open(name), usecols=lambda c: c in ("PLANNING_AREA", "Load", "ActLoad"))
    # ActLoad adds behind-the-fence generation back in, but older files may not have it
    col = "ActLoad" if "ActLoad" in df else "Load"
    df = df[pd.to_numeric(df.PLANNING_AREA, errors="coerce").notna()]
    out = df.groupby(df.PLANNING_AREA.astype(float).astype(int))[col].mean().rename("avg_mw").reset_index()
    out.columns = ["pa_code", "avg_mw"]
    out["year"] = year
    return out


def build_yearly(folder=LOAD_ZIPS):
    df = pd.concat([read_year(p) for p in sorted(Path(folder).glob("*.zip"))], ignore_index=True)
    df["region"] = df.pa_code.map(PLANNING_AREA_TO_REGION)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    df.to_parquet(PROCESSED / "load_yearly.parquet", index=False)
    return df


def region_growth(yearly, start=2019, end=2025):
    """Annual percent growth in average load, by economic region."""
    table = yearly.groupby(["region", "year"]).avg_mw.sum().unstack("year")
    return ((table[end] / table[start]) ** (1 / (end - start)) - 1) * 100
