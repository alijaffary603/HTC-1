import openpyxl
import pandas as pd

from gridskills.project_list import add_derived, normalize_status, read_list, snapshot_date


def _write(path, rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    wb.save(path)
    return path


def test_snapshot_date_from_filename():
    assert snapshot_date("March-2024-Project-List.xlsx") == pd.Timestamp(2024, 3, 1)


def test_status_variants():
    assert normalize_status("Cluster 2") == "cluster"
    assert normalize_status("Processed For Cluster (See Note 1)") == "cluster"
    assert normalize_status("Recently Cancelled") == "cancelled"
    assert normalize_status(None) == "unknown"


def test_old_layout_with_section_rows(tmp_path):
    rows = [
        ["Project Information", None, None, None, None, None, None, "Energization 1"],
        ["Project Name", "Planning Area", "Project Type", "MW Type", "Stage", "Inclusion", "Applied On",
         "STS MW", "DTS MW", "ISD", "STS MW", "DTS MW", "ISD", "STS MW", "DTS MW", "ISD"],
        ["Active"],
        ["P0693 Wild Rose", "04-Medicine Hat", "Connection", "Wind", 5, "Yes", "2007-05-01",
         192, 4, "2023-06-30"],
        ["Recently Cancelled"],
        ["P0700 Gone Solar", "42-Hanna", "Connection", "Solar", 2, "No", "2019-01-01",
         50, 0, "2024-01-01", 25, 0, "2025-01-01"],
    ]
    df = read_list(_write(tmp_path / "January-2023-Project-List.xlsx", rows))
    assert list(df.project_id) == ["P0693", "P0700"]
    assert list(df.status) == ["active", "cancelled"]
    assert df.sts_1[0] == 192
    assert df.sts_2[1] == 25


def test_new_layout_with_status_column(tmp_path):
    rows = [
        ["Status", "Project Name", "Planning Area", "Cluster", "Project Type", "MW Type", "Stage", "CA Modelled",
         "Inclusion", "Applied On", "EN1 STS MW", "EN1 DTS MW", "EN1 ISD", "EN2 STS MW", "EN2 DTS MW", "EN2 ISD",
         "EN3 STS MW", "EN3 DTS MW", "EN3 ISD"],
        ["Cluster 3", "P3000 Big Battery", "06-Calgary", "Cluster 3", "Cluster", "Battery Storage", 1, "No", "No",
         "2026-01-01", 100, 0, "2029-05-01"],
    ]
    df = add_derived(read_list(_write(tmp_path / "November-2026-Project-List.xlsx", rows)))
    row = df.iloc[0]
    assert row.status == "cluster"
    assert row.tech == "storage"
    assert row.sts_mw == 100
    assert row.pa_code == 6
    assert row.pa_name == "Calgary"
