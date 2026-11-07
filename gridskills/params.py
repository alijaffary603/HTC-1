import tomllib

import pandas as pd

from .paths import CONFIG

SCENARIOS = {"low": 0, "base": 1, "high": 2}


def load_assumptions():
    with open(CONFIG / "assumptions.toml", "rb") as f:
        return tomllib.load(f)


def load_cer_costs(cer_scenario="CM", year=2027):
    df = pd.read_csv(CONFIG / "cer_costs_alberta.csv")
    df = df[(df.scenario == cer_scenario) & (df.year == year)]
    return df.pivot(index="technology", columns="field", values="value")


def blended(costs, blend, field):
    return sum(costs.loc[tech, field] * weight for tech, weight in blend.items())


def tech_costs(assumptions, cer_scenario="CM"):
    """capex in $/kW and fixed O&M in $/kW-yr for each technology we model."""
    costs = load_cer_costs(cer_scenario)
    rows = {}
    for tech, spec in assumptions["tech"].items():
        if "capex_blend" in spec:
            capex = blended(costs, spec["capex_blend"], "Overnight Capital Cost")
            fixed_om = blended(costs, spec["capex_blend"], "Fixed O&M Cost")
        else:
            capex, fixed_om = spec["capex_per_kw"], 0.0
        rows[tech] = {"capex_per_kw": capex, "fixed_om_per_kw": fixed_om}
    return pd.DataFrame(rows).T
