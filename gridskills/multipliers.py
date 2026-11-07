"""Alberta employment multipliers, split into direct, indirect and induced jobs per $1M.

The xlsx doesn't publish the split directly but it can be recovered:
    Table 1 (open model, simple)  = direct + indirect jobs per $1M
    Table 2 (closed model, total) = direct + indirect + induced jobs per $1M
    Table 4 (Type I employment)   = (direct + indirect) / direct

We use the closed model without the "safety net" tables, which assume people who
lose work fall back on transfers. Dollars are 2022 dollars.
"""
import re

import pandas as pd

from .paths import MULTIPLIERS


def _table(wb_path, sheet, column):
    raw = pd.read_excel(wb_path, sheet_name=sheet, header=None)
    header = [re.sub(r"\s+", " ", str(c)).strip() for c in raw.iloc[2]]
    pos = next(i for i, h in enumerate(header) if h.startswith(column))
    out = raw.iloc[3:, [0, 1, pos]].copy()
    out.columns = ["code", "title", "value"]
    out = out[out.code.notna()]
    out["value"] = pd.to_numeric(out.value, errors="coerce")
    return out.set_index("code")


def load(path=MULTIPLIERS):
    simple = _table(path, "Table 1", "Employment")
    total = _table(path, "Table 2", "Employment")
    type1 = _table(path, "Table 4", "Employment")
    df = pd.DataFrame({
        "title": simple.title,
        "simple": simple.value,
        "total": total.value,
        "type1": type1.value,
    })
    df["direct"] = df.simple / df.type1
    df["indirect"] = df.simple - df.direct
    df["induced"] = df.total - df.simple
    return df
