"""Census and Labour Force Survey tables, reduced to what the model needs."""
import re
import zipfile

import pandas as pd

from .paths import LFS, PROCESSED
from .regions import CENSUS_GEO_TO_REGION, REGIONS, lfs_region

# LFS groups some census sectors together. Each census sector -> its LFS row.
LFS_GROUP = {
    "11": "Agriculture [111-112, 1100, 1151-1152]",
    "21": "Forestry, fishing, mining, quarrying, oil and gas [21, 113-114, 1153, 2100]",
    "22": "Utilities [22]",
    "23": "Construction [23]",
    "31-33": "Manufacturing [31-33]",
    "41": "Wholesale and retail trade [41, 44-45]",
    "44-45": "Wholesale and retail trade [41, 44-45]",
    "48-49": "Transportation and warehousing [48-49]",
    "51": "Information, culture and recreation [51, 71]",
    "52": "Finance, insurance, real estate, rental and leasing [52-53]",
    "53": "Finance, insurance, real estate, rental and leasing [52-53]",
    "54": "Professional, scientific and technical services [54]",
    "55": "Business, building and other support services [55-56]",
    "56": "Business, building and other support services [55-56]",
    "61": "Educational services [61]",
    "62": "Health care and social assistance [62]",
    "71": "Information, culture and recreation [51, 71]",
    "72": "Accommodation and food services [72]",
    "81": "Other services (except public administration) [81]",
    "91": "Public administration [91]",
}

# how hard to pull thin regional occupation mixes toward the Alberta mix, in people
SHRINK_PEOPLE = 5000


def sector_key(industry):
    m = re.match(r"^(\d\d(?:-\d\d)?) ", industry)
    return m[1] if m else None


def load_census(path=None):
    df = pd.read_parquet(path or PROCESSED / "census_alberta.parquet")
    df["sector"] = df.industry.map(sector_key)
    df["code"] = df.occupation.str.extract(r"^(\d{4}) ")[0]
    df["title"] = df.occupation.str.replace(r"^\d{4} ", "", regex=True)
    return df


def occupation_titles(census):
    return census.dropna(subset=["code"]).drop_duplicates("code").set_index("code").title


def occupation_given_sector(census):
    """Alberta share of each sector's workers in each occupation. Columns sum to 1."""
    ab = census[(census.geo == "Alberta") & census.code.notna() & census.sector.notna()]
    table = ab.pivot_table(index="code", columns="sector", values="employed", aggfunc="sum", fill_value=0)
    return table / table.sum()


def sector_given_occupation(census):
    """Share of each occupation's Alberta workers in each sector. Rows sum to 1."""
    ab = census[(census.geo == "Alberta") & census.code.notna() & census.sector.notna()]
    table = ab.pivot_table(index="code", columns="sector", values="employed", aggfunc="sum", fill_value=0)
    return table.div(table.sum(axis=1).replace(0, 1), axis=0)


def sector_employment(census):
    ab = census[(census.geo == "Alberta") & (census.occupation == "All occupations") & census.sector.notna()]
    return ab.set_index("sector").employed


def _read_lfs(table):
    with zipfile.ZipFile(LFS / f"{table}.zip") as z:
        df = pd.read_csv(z.open(f"{table}.csv"), encoding="utf-8-sig", dtype=str)
    df = df[df.GEO.str.contains("Alberta")].copy()
    df["VALUE"] = pd.to_numeric(df.VALUE, errors="coerce")
    df["year"] = df.REF_DATE.astype(int)
    return df


def load_lfs_industry():
    """Employment in thousands by year, geo and industry/occupation row."""
    df = _read_lfs("14100466")
    return df.rename(columns={"Employment characteristics": "series"})[["year", "GEO", "series", "VALUE"]]


def region_totals(lfs, year):
    """Employed people in each economic region."""
    rows = lfs[(lfs.series == "Total employed") & (lfs.year == year)]
    out = {lfs_region(g): v * 1000 for g, v in zip(rows.GEO, rows.VALUE) if lfs_region(g)}
    return pd.Series(out).reindex(REGIONS)


def region_occupation_employment(census, lfs, year=2025):
    """People employed in each occupation in each region: LFS size times census mix.

    The census only covers cities and larger towns, so rural regions have thin samples.
    Their mix gets pulled toward Alberta's, more strongly the fewer people we can see.
    """
    occ = census[census.code.notna() & (census.industry == "All industries")]
    ab = occ[occ.geo == "Alberta"].set_index("code").employed
    ab_share = ab / ab.sum()

    by_region = {r: pd.Series(0.0, index=ab.index) for r in REGIONS}
    for geo, region in CENSUS_GEO_TO_REGION.items():
        counts = occ[occ.geo == geo].set_index("code").employed.reindex(ab.index).fillna(0)
        by_region[region] = by_region[region] + counts

    totals = region_totals(lfs, year)
    out = {}
    for region, counts in by_region.items():
        mix = (counts + SHRINK_PEOPLE * ab_share) / (counts.sum() + SHRINK_PEOPLE)
        out[region] = mix * totals[region]
    return pd.DataFrame(out)


def annual_growth(wide, start, end):
    """Percent growth per year between two multi-year averages. Columns are years."""
    span = (sum(end) - sum(start)) / 2
    before = wide[list(range(start[0], start[1] + 1))].mean(axis=1)
    after = wide[list(range(end[0], end[1] + 1))].mean(axis=1)
    return ((after / before) ** (1 / span) - 1) * 100


def sector_momentum(lfs, start=(2017, 2019), end=(2023, 2025)):
    """Annual employment growth by sector in Alberta, in percent.

    Compares 3-year averages either side of COVID. Province-wide on purpose: sector
    trends within a region showed no persistence from one period to the next, while
    province-wide ones showed some (see docs/validation.md).
    """
    groups = sorted(set(LFS_GROUP.values()))
    rows = lfs[lfs.series.isin(groups) & (lfs.GEO == "Alberta")]
    return annual_growth(rows.pivot_table(index="series", columns="year", values="VALUE"), start, end)


def bracket_codes(series):
    """'Care providers [44-45]' -> ['44', '45']. Empty if the name has no NOC codes."""
    m = re.search(r"\[([\d, -]+)\]$", series)
    if not m:
        return []
    codes = []
    for part in m[1].replace(" ", "").split(","):
        if "-" in part:
            low, high = part.split("-")
            codes += [str(n).zfill(len(low)) for n in range(int(low), int(high) + 1)]
        else:
            codes.append(part)
    return codes


def occupation_series(lfs):
    """NOC prefix -> LFS occupation row, for both the 2 and 3 digit groups."""
    industries = set(LFS_GROUP.values())
    out = {}
    for series in lfs.series.unique():
        # the headline groups overlap the detailed ones, so leave them out
        if series in industries or "except management" in series or series.startswith("Management occupations"):
            continue
        for code in bracket_codes(series):
            out[code] = series
    return out


def series_for_code(code, mapping):
    """The most detailed LFS group for a 4-digit minor group. 4122 uses [412], 7220 uses [72]."""
    return mapping.get(code[:3]) or mapping[code[:2]]


def occupation_trend(lfs, codes, start=(2017, 2019), end=(2023, 2025)):
    """Alberta employment trend for the LFS group each occupation belongs to."""
    mapping = occupation_series(lfs)
    rows = lfs[lfs.GEO == "Alberta"]
    wide = rows[rows.series.isin(set(mapping.values()))].pivot_table(index="series", columns="year", values="VALUE")
    growth = annual_growth(wide, start, end)
    table = pd.DataFrame({"code": list(codes)})
    table["trend_group"] = [series_for_code(c, mapping) for c in table.code]
    table["occupation_growth_pct"] = table.trend_group.map(growth)
    table["trend_group_people"] = table.trend_group.map(wide[end[1]]) * 1000
    return table


def employment_growth(lfs, start=(2017, 2019), end=(2023, 2025)):
    """Annual growth in total employment, in percent. Returns (by region, Alberta)."""
    rows = lfs[lfs.series == "Total employed"]
    growth = annual_growth(rows.pivot_table(index="GEO", columns="year", values="VALUE"), start, end)
    by_region = {lfs_region(geo): value for geo, value in growth.items() if lfs_region(geo)}
    return pd.Series(by_region).reindex(REGIONS), growth["Alberta"]
