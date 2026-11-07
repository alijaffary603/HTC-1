"""Read the AESO monthly connection project lists into one long table.

The layout changes a few times between 2023 and 2026: early files use section
rows for status and a two-line header, later ones have a Status column and
EN1/EN2/EN3 prefixes. Columns get added too (Cluster, CA Modelled). read_list
deals with all of that so the rest of the code can ignore it.
"""
import re
from pathlib import Path

import openpyxl
import pandas as pd

MONTHS = "January February March April May June July August September October November December".split()
PROJECT_ID = re.compile(r"\s*(P\d+)\b\s*(.*)")

STATUS_MAP = {
    "active": "active",
    "isd under review": "isd_review",
    "on hold": "on_hold",
    "recently energized": "energized",
    "recently cancelled": "cancelled",
}

# Mixed projects get the technology that carries most of the capital cost. The MW
# themselves come from the STS and DTS columns.
TECH_GROUPS = {
    "Solar": "solar",
    "Solar + Storage": "solar_storage",
    "DC-Coupled Solar-BESS + Storage": "solar_storage",
    "Wind": "wind",
    "Wind + Storage": "wind_storage",
    "Wind Storage": "wind_storage",
    "DC-Coupled Wind-BESS + Storage": "wind_storage",
    "Wind + Solar": "wind",
    "Wind + Solar + Storage": "wind_storage",
    "Battery Storage": "storage",
    "Compressed Air Energy Storage": "storage_long",
    "Pumped Hydro Storage": "storage_long",
    "Gas": "gas",
    "Gas + Storage": "gas",
    "Cogen": "cogen",
    "Cogen + Storage": "cogen",
    "Cogen + Solar + Storage": "cogen",
    "Wasteheat": "cogen",
    "Biomass": "other_gen",
    "Geothermal": "other_gen",
    "Coal": "other_gen",
    "Data Load": "data_centre",
    "Gas + Data Load": "data_centre",
    "Battery + Data Load": "data_centre",
    "Cogen + Data Load": "data_centre",
    "Industrial Load": "industrial_load",
    "Distribution Load": "distribution_load",
    "Load": "distribution_load",
    # no physical build behind these, so they get no construction jobs
    "DTS": "contract_only",
    "STS": "contract_only",
    "Equipment Change": "no_mw",
    "Salvage/Decommission": "no_mw",
    "Other": "no_mw",
}


def snapshot_date(path):
    m = re.match(r"(\w+)-(\d{4})", Path(path).name)
    return pd.Timestamp(int(m[2]), MONTHS.index(m[1]) + 1, 1)


def normalize_status(raw):
    s = str(raw or "").strip().lower()
    if s.startswith("cluster") or s.startswith("processed for cluster"):
        return "cluster"
    if s.startswith("status n/a"):
        return "unknown"
    return STATUS_MAP.get(s, "unknown")


def _clean_header(header):
    """Number the repeated STS/DTS/ISD columns so they survive being dict keys."""
    out, seen = [], 0
    for c in header:
        name = str(c).strip() if c is not None else ""
        name = re.sub(r"^EN\d\s+", "", name)
        if name == "STS MW":
            seen += 1
        if name in ("STS MW", "DTS MW", "ISD"):
            name = f"{name.split()[0].lower()}_{seen}"
        out.append(name)
    return out


def _number(v):
    if v is None or v == "":
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        m = re.search(r"-?\d+(\.\d+)?", str(v))
        return float(m[0]) if m else 0.0


def _date(v):
    if v in (None, ""):
        return pd.NaT
    return pd.to_datetime(v, errors="coerce")


def read_list(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = list(wb.worksheets[0].iter_rows(values_only=True))
    wb.close()

    h_idx = next(i for i, r in enumerate(rows) if any(str(c).strip() == "Project Name" for c in r if c))
    header = _clean_header(rows[h_idx])
    col = {name: i for i, name in enumerate(header) if name}

    records = []
    section = None
    for r in rows[h_idx + 1:]:
        filled = [c for c in r if c not in (None, "")]
        if not filled:
            continue
        if "Status" not in col and len(filled) == 1 and not PROJECT_ID.match(str(filled[0])):
            section = filled[0]
            continue
        m = PROJECT_ID.match(str(r[col["Project Name"]] or ""))
        if not m:
            continue

        def get(name):
            return r[col[name]] if name in col and col[name] < len(r) else None

        status_raw = get("Status") if "Status" in col else section
        rec = {
            "project_id": m[1],
            "name": m[2].strip(),
            "status_raw": str(status_raw or "").strip(),
            "status": normalize_status(status_raw),
            "planning_area": str(get("Planning Area") or "").strip(),
            "cluster": str(get("Cluster") or ""),
            "project_type": str(get("Project Type") or "").strip(),
            "mw_type": str(get("MW Type") or "").strip(),
            "stage": pd.to_numeric(get("Stage"), errors="coerce"),
            "ca_modelled": str(get("CA Modelled") or ""),
            "inclusion": str(get("Inclusion") or ""),
            "applied_on": _date(get("Applied On")),
        }
        for n in (1, 2, 3):
            rec[f"sts_{n}"] = _number(get(f"sts_{n}"))
            rec[f"dts_{n}"] = _number(get(f"dts_{n}"))
            rec[f"isd_{n}"] = _date(get(f"isd_{n}"))
        records.append(rec)

    df = pd.DataFrame(records)
    df.insert(0, "snapshot", snapshot_date(path))
    return df


def add_derived(df):
    df = df.copy()
    df["tech"] = df.mw_type.map(TECH_GROUPS).fillna("no_mw")
    df["sts_mw"] = df[["sts_1", "sts_2", "sts_3"]].sum(axis=1)
    df["dts_mw"] = df[["dts_1", "dts_2", "dts_3"]].sum(axis=1)
    df["last_isd"] = df[["isd_1", "isd_2", "isd_3"]].max(axis=1)
    df["inclusion"] = df.inclusion.str.strip().str.lower().eq("yes")
    df["pa_code"] = pd.to_numeric(df.planning_area.str.extract(r"^(\d+)")[0], errors="coerce")
    df["pa_name"] = df.planning_area.str.replace(r"^\d+-", "", regex=True).str.strip()
    return df


def read_all(folder):
    frames = [read_list(p) for p in sorted(Path(folder).glob("*-Project-List.xlsx"))]
    df = pd.concat(frames, ignore_index=True).sort_values(["snapshot", "project_id"])
    # a handful of projects are listed twice in one month; keep the first row
    df = df.drop_duplicates(["snapshot", "project_id"], keep="first").reset_index(drop=True)
    return add_derived(df)
