# Data

Everything raw lives in `data/`, which is git-ignored because of size. Use the URLs below to re-download. Small derived files that the rest of the team needs are committed under `outputs/` and `config/`.

| Folder | Contents | Source |
|---|---|---|
| `data/aeso_project_lists/` | 45 monthly connection project lists, Jan 2023 to Nov 2026 (Nov 2023 and Dec 2024 are not on the AESO site), plus the field guide PDF | [AESO connection project reporting](https://www.aeso.ca/grid/transmission-projects/connection-project-reporting/) |
| `data/aeso_planning_area_load/` | Hourly load and generation by planning area, 2015-2025, one zip per year | [AESO data requests](https://aeso.ca/market/market-and-system-reporting/data-requests/planning-area-hourly-load-and-generation/) |
| `data/statcan_98100594/` | 2021 Census table 98-10-0594, occupation by industry sector. Zip is 1 GB and the CSV inside is 12 GB, so don't extract it. Use `scripts/extract_census.py` | [StatCan](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810059401) |
| `data/statcan_lfs/` | Labour Force Survey annual tables 14-10-0464 (characteristics) and 14-10-0466 (employment by industry and occupation) by economic region, 2011-2025 | `https://www150.statcan.gc.ca/n1/tbl/csv/14100466-eng.zip` (same pattern for 14100464) |
| `data/ab_multipliers/` | Alberta Economic Multipliers 2022, PDF and xlsx | [Alberta open data](https://open.alberta.ca/opendata/alberta-economic-multipliers-by-industry-and-commodity) |
| `data/cer/` | Saved CER pages. `storage_2026.html` embeds Alberta costs by technology | [CER CEF 2026 cost data](https://cer-rec.gc.ca/en/data-analysis/canada-energy-future/2026-cost-data-electricity-storage/) |
| `data/aeso_refs/` | AESO large load page and Sept 2025 data centre update | [AESO large load projects](https://www.aeso.ca/grid/connecting-to-the-grid/large-load-projects) |
| `data/pembina_bc_job_factors/` | Pembina BC job factors (2015), used only as a cross-check | pembina.org |
| `data/alberta_census_labour_highlights/` | Alberta Census 2021 labour highlights, reference only | open.alberta.ca |
| `data/aeso_pages/` | Saved source pages, kept for the download links | various |

Not used in the end: NREL JEDI and IRENA. Canadian sources covered what we needed, see `docs/methodology.md`.

## Rebuilding

```
python -m venv .venv
.venv/Scripts/pip install -e .[dev]
.venv/Scripts/python scripts/extract_census.py     # takes a few minutes
.venv/Scripts/python scripts/build_all.py
```
