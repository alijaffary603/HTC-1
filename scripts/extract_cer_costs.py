"""Pull Alberta technology costs out of the data embedded in the CER CEF 2026 page.

Source page: cer-rec.gc.ca/en/data-analysis/canada-energy-future/2026-cost-data-electricity-storage/
Saved copy lives in data/cer/storage_2026.html. Output is small so it's committed.
"""
import json
import re

import pandas as pd

from gridskills.paths import CONFIG, DATA


def parse(html):
    m = re.search(r"const plotData = (\{.*?\});\s*\n", html, flags=re.S)
    if not m:
        raise ValueError("plotData not found, page layout probably changed")
    raw = json.loads(m.group(1))
    rows = []
    for tech, scenarios in raw.items():
        for scenario, fields in scenarios.items():
            for field, provinces in fields.items():
                for rec in provinces.get("AB", []):
                    rows.append((tech, scenario, field, rec["Year"], rec[field]))
    return pd.DataFrame(rows, columns=["technology", "scenario", "field", "year", "value"])


if __name__ == "__main__":
    html = (DATA / "cer" / "storage_2026.html").read_text(encoding="utf-8", errors="replace")
    df = parse(html)
    df = df[df.year.isin([2024, 2025, 2026, 2027, 2028, 2029, 2030])]
    out = CONFIG / "cer_costs_alberta.csv"
    df.to_csv(out, index=False)
    print(len(df), "rows ->", out)
    print(df.technology.unique())
    print(df.scenario.unique())
    print(df.field.unique())
