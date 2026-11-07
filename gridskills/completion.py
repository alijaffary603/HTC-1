"""How likely is a queued project to actually get built?

Two pieces:

1. A logistic regression on monthly snapshots: given where a project is today, does
   it energize within 18 months? This is what we trust for near-term calls. Scored
   on later data it beats everything else we tried, see docs/validation.md.

2. A Markov chain on connection states, fit to recent months only. The logit can't
   say much about a project dated 2031, so for far-out projects we use the chain to
   estimate attrition up to the point the logit becomes relevant.

Data centres are not scored here at all. None has ever energized, so history has
nothing to say about them and they use explicit scenarios (see jobs.py).
"""
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

STATES = ["cluster", "early", "mid", "late", "isd_review", "on_hold", "energized", "cancelled"]
IDX = {s: i for i, s in enumerate(STATES)}
OPEN_STATES = STATES[:6]
FAMILIES = ["renewable", "gas", "storage", "load", "data_centre"]

FAMILY_OF = {
    "solar": "renewable", "solar_storage": "renewable", "wind": "renewable", "wind_storage": "renewable",
    "other_gen": "renewable", "gas": "gas", "cogen": "gas", "storage": "storage", "storage_long": "storage",
    "distribution_load": "load", "industrial_load": "load", "contract_only": "load", "no_mw": "load",
    "data_centre": "data_centre",
}

NUMERIC = ["log_mw", "months_to_isd", "age_months"]
CATEGORICAL = ["state", "family"]
HORIZON = 18
NO_DATE = 72  # months_to_isd used when a project has no in-service date


def to_state(status, stage):
    if status in ("cluster", "isd_review", "on_hold", "energized", "cancelled"):
        return status
    if status == "active":
        if pd.isna(stage) or stage <= 2:
            return "early"
        return "mid" if stage <= 4 else "late"
    return None


def clean_panel(panel):
    """One row per project-month with a usable state, cut off at the final outcome.

    A few projects bounce out of 'recently energized' back to active when another
    energization gets scheduled. Those early terminal rows are treated as still open.
    """
    df = panel.sort_values(["project_id", "snapshot"]).copy()
    df["family"] = df.tech.map(FAMILY_OF).fillna("load")
    df["state"] = [to_state(a, b) for a, b in zip(df.status, df.stage)]
    df = df[df.state.notna()].copy()

    terminal = df.state.isin(["energized", "cancelled"])
    reopened = terminal & ~df.groupby("project_id").state.transform("last").isin(["energized", "cancelled"])
    df.loc[reopened, "state"] = "late"

    keep = []
    for _, g in df.groupby("project_id", sort=False):
        states = g.state.to_numpy()
        n = len(states)
        if states[-1] in ("energized", "cancelled"):
            while n > 1 and states[n - 2] == states[-1]:
                n -= 1
        keep.append(g.index[:n])
    return df.loc[np.concatenate(keep)]


def add_features(df):
    df = df.copy()
    if "sts_mw" in df:
        df["log_mw"] = np.log1p(df[["sts_mw", "dts_mw"]].abs().max(axis=1))
        df["months_to_isd"] = ((df.last_isd - df.snapshot).dt.days / 30.44).clip(-24, NO_DATE).fillna(NO_DATE)
        df["age_months"] = ((df.snapshot - df.applied_on).dt.days / 30.44).clip(0, 240).fillna(36)
    return df


# Markov part

def transition_counts(df, until=None):
    """Counts by family. AESO skipped two months, so a few steps span two months;
    we treat those as one step, which slightly overstates monthly rates."""
    if until is not None:
        df = df[df.snapshot <= until]
    counts = {f: np.zeros((len(STATES), len(STATES))) for f in FAMILIES}
    for family, g in df.groupby("family"):
        for _, p in g.groupby("project_id", sort=False):
            s = p.state.map(IDX).to_numpy()
            for a, b in zip(s[:-1], s[1:]):
                counts[family][a, b] += 1
    return counts


def _normalise(m):
    totals = m.sum(axis=1, keepdims=True)
    totals[totals == 0] = 1
    n = m / totals
    empty = n.sum(axis=1) == 0
    n[empty] = np.eye(len(STATES))[empty]
    return n


def to_matrix(counts, prior):
    """Families with thin data borrow from the pooled matrix through pseudo-counts."""
    pooled_rates = _normalise(sum(counts.values()) + 0.5 * np.eye(len(STATES)))
    out = {}
    for f, c in counts.items():
        m = _normalise(c + prior * pooled_rates)
        m[IDX["energized"]] = np.eye(len(STATES))[IDX["energized"]]
        m[IDX["cancelled"]] = np.eye(len(STATES))[IDX["cancelled"]]
        out[f] = m
    return out


def fit_chain(clean, until=None, window=None, prior=12.0):
    df = clean if until is None else clean[clean.snapshot <= until]
    if window:
        df = df[df.snapshot >= df.snapshot.max() - pd.DateOffset(months=window)]
    return to_matrix(transition_counts(df), prior)


def probability_table(matrices, months):
    rows = []
    for family, m in matrices.items():
        power = np.linalg.matrix_power(m, months)
        for s in OPEN_STATES:
            rows.append((family, s, power[IDX[s], IDX["energized"]], power[IDX[s], IDX["cancelled"]]))
    return pd.DataFrame(rows, columns=["family", "state", "p_energized", "p_cancelled"])


def survival(matrices, family, state, months):
    """P(not cancelled after `months`)."""
    if months <= 0:
        return 1.0
    power = np.linalg.matrix_power(matrices[family], int(round(months)))
    return 1.0 - power[IDX[state], IDX["cancelled"]]


# logistic part

def landmark(clean, date, horizon):
    """Open projects at `date`, labelled by whether they energized within `horizon` months."""
    date = pd.Timestamp(date)
    end = date + pd.DateOffset(months=horizon)
    rows = clean[(clean.snapshot == date) & clean.state.isin(OPEN_STATES)].copy()
    future = clean[(clean.snapshot > date) & (clean.snapshot <= end)]
    rows["y"] = rows.project_id.isin(set(future[future.state == "energized"].project_id)).astype(int)
    return rows


def training_frame(clean, horizon=HORIZON, until=None):
    last = clean.snapshot.max() if until is None else pd.Timestamp(until)
    dates = [d for d in sorted(clean.snapshot.unique()) if pd.Timestamp(d) + pd.DateOffset(months=horizon) <= last]
    if not dates:
        raise ValueError("no landmark months have complete outcomes for that horizon")
    return pd.concat([landmark(clean, d, horizon) for d in dates], ignore_index=True)


def fit_logit(clean, horizon=HORIZON, until=None):
    # data centres have no positive examples, so they'd only teach it "data centre = never"
    train = training_frame(clean, horizon, until)
    train = train[train.family != "data_centre"]
    model = make_pipeline(
        ColumnTransformer([
            ("num", StandardScaler(), NUMERIC),
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
        ]),
        LogisticRegression(C=1.0, max_iter=1000),
    )
    model.fit(train[NUMERIC + CATEGORICAL], train.y)
    return model


def predict_logit(model, rows):
    return model.predict_proba(rows[NUMERIC + CATEGORICAL])[:, 1]


def p_built(rows, model, chain, horizon=HORIZON):
    """Chance each open project gets built, whenever that is.

    Inside the horizon this is just the logit. Beyond it, score the project as though
    it were close to its date, then discount by the odds of surviving until then. It
    keeps today's state, which is conservative for early projects.
    """
    rows = rows.copy()
    far = rows.months_to_isd > horizon
    wait = (rows.months_to_isd - horizon).where(far, 0.0)
    rows.loc[far, "months_to_isd"] = horizon / 2
    p = predict_logit(model, rows)
    surv = [survival(chain, f, s, w) for f, s, w in zip(rows.family, rows.state, wait)]
    return p * np.array(surv)
