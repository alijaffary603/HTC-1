import numpy as np
import pandas as pd

from gridskills import completion as c


def _panel(rows):
    df = pd.DataFrame(rows, columns=["project_id", "snapshot", "status", "stage", "tech"])
    df["snapshot"] = pd.to_datetime(df.snapshot)
    return df


def _fake_history(months=30, n=30):
    """Late-stage projects near their date finish; early ones with far dates cancel."""
    rows = []
    dates = pd.date_range("2023-01-01", periods=months, freq="MS")
    for i in range(n):
        finish = 3 + i % 6
        for j, d in enumerate(dates[: finish + 1]):
            done = j == finish
            rows.append(dict(project_id=f"A{i}", snapshot=d, status="energized" if done else "active", stage=5,
                             tech="solar", sts_mw=50.0, dts_mw=0.0, last_isd=dates[finish], applied_on=dates[0]))
        for j, d in enumerate(dates[: finish + 4]):
            done = j == finish + 3
            rows.append(dict(project_id=f"B{i}", snapshot=d, status="cancelled" if done else "active", stage=1,
                             tech="solar", sts_mw=500.0, dts_mw=0.0, last_isd=d + pd.DateOffset(months=60),
                             applied_on=dates[0]))
    return c.add_features(c.clean_panel(pd.DataFrame(rows)))


def test_state_mapping():
    assert c.to_state("active", 1) == "early"
    assert c.to_state("active", 4) == "mid"
    assert c.to_state("active", 6) == "late"
    assert c.to_state("cluster", 1) == "cluster"
    assert c.to_state("unknown", 1) is None


def test_clean_drops_repeated_terminal_months():
    p = _panel([
        ("P1", "2024-01-01", "active", 5, "solar"),
        ("P1", "2024-02-01", "energized", 6, "solar"),
        ("P1", "2024-03-01", "energized", 6, "solar"),
    ])
    assert list(c.clean_panel(p).state) == ["late", "energized"]


def test_bounce_out_of_energized_counts_as_open():
    p = _panel([
        ("P1", "2024-01-01", "active", 5, "gas"),
        ("P1", "2024-02-01", "energized", 6, "gas"),
        ("P1", "2024-03-01", "active", 5, "gas"),
    ])
    assert list(c.clean_panel(p).state) == ["late", "late", "late"]


def test_chain_rows_sum_to_one_and_terminal_absorbs():
    m = c.fit_chain(_fake_history())
    for family in c.FAMILIES:
        assert np.allclose(m[family].sum(axis=1), 1)
        assert m[family][c.IDX["energized"], c.IDX["energized"]] == 1


def test_survival_falls_with_time():
    m = c.fit_chain(_fake_history())
    assert c.survival(m, "renewable", "early", 0) == 1.0
    assert c.survival(m, "renewable", "early", 36) < c.survival(m, "renewable", "early", 6)


def test_landmark_labels_only_look_inside_horizon():
    hist = _fake_history()
    rows = c.landmark(hist, "2023-01-01", 2)
    assert rows.y.sum() == 0
    rows = c.landmark(hist, "2023-01-01", 12)
    assert rows[rows.project_id.str.startswith("A")].y.all()
    assert not rows[rows.project_id.str.startswith("B")].y.any()


def test_training_frame_needs_complete_outcomes():
    hist = _fake_history()
    train = c.training_frame(hist, horizon=6, until="2023-08-01")
    assert train.snapshot.max() <= pd.Timestamp("2023-02-01")


def test_logit_separates_late_from_early_and_far_is_discounted():
    hist = _fake_history()
    model = c.fit_logit(hist, horizon=6)
    chain = c.fit_chain(hist)
    open_rows = hist[hist.snapshot == "2023-02-01"]
    open_rows = open_rows[open_rows.state.isin(c.OPEN_STATES)]
    p = pd.Series(c.p_built(open_rows, model, chain, horizon=6), index=open_rows.project_id)
    assert p[p.index.str.startswith("A")].mean() > p[p.index.str.startswith("B")].mean()
