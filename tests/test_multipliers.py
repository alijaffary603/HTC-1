import numpy as np
import pandas as pd
import pytest

from gridskills.multipliers import load
from gridskills.paths import MULTIPLIERS

needs_data = pytest.mark.skipif(not MULTIPLIERS.exists(), reason="raw data not downloaded")


@needs_data
def test_split_adds_back_to_published_total():
    m = load()
    row = m.loc["BS23C300"]  # electric power engineering construction
    assert row.direct + row.indirect + row.induced == pytest.approx(row.total)
    assert row.direct > 0 and row.indirect > 0 and row.induced > 0


@needs_data
def test_split_agrees_with_published_type2():
    """Table 5 is an independent check: Type II should equal total / direct."""
    m = load().dropna(subset=["direct", "total"])
    raw = pd.read_excel(MULTIPLIERS, sheet_name="Table 5", header=None).iloc[3:, [0, 6]]
    raw.columns = ["code", "type2"]
    raw = raw[raw.code.notna()].set_index("code")
    type2 = pd.to_numeric(raw.type2, errors="coerce").reindex(m.index)
    ok = type2.notna() & (m.direct > 0.05)
    assert np.allclose(m.total[ok] / m.direct[ok], type2[ok], rtol=0.01)


@needs_data
def test_codes_used_in_config_exist():
    m = load()
    for code in ("BS23C300", "BS23B000", "BS221100", "BS518000"):
        assert code in m.index and m.loc[code].notna().all()
