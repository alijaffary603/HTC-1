# Data availability check (desk research, 2026-11-07)

Status legend: CONFIRMED = seen in search results from official page; UNVERIFIED = third-party claim or not opened. No data files were downloaded yet.

## AESO
| Data | What we found | Status | Impact on plan |
|---|---|---|---|
| Connection project list (queue) | Published MONTHLY as Excel, GIS shapefile, KML, Power BI dashboard; archives available; guide PDF explains fields (status, stage). Latest seen: 2026-06-10. Page: https://www.aeso.ca/grid/transmission-projects/connection-project-reporting/ | CONFIRMED (page), fields not opened | Ingestion = monthly file download, NOT an API. Hourly/real-time polling for the queue is pointless. Contact: customer.connections@aeso.ca |
| Planning-area hourly load + generation | Per-year downloads 2015-2025. https://aeso.ca/market/market-and-system-reporting/data-requests/planning-area-hourly-load-and-generation/ | CONFIRMED (page), files not opened | Gives REGIONAL (planning-area) granularity - good, but planning areas are not towns |
| Hourly load by area and region | 2011-2024, no future updates | CONFIRMED | Historical only |
| Constrained volume by planning area/fuel | 2020-2025, constrained hours only | CONFIRMED | Optional |
| AESO Public API (pool price, current supply/demand) | Gateway apimgw.aeso.ca/public; self-serve key via developer portal; reportedly no approval | UNVERIFIED (third-party sources) | Use for live pool price / grid status only. Verify at AESO developer portal |
| Long-term Outlook 2024 | Published May 2024; scenarios incl. decarbonization; load growth from oilsands, new connections, electrification | CONFIRMED | No regional planning-area breakdown found |
| Data centre updates | Sept 2025 update: >20,000 MW of data centre load on project list; AESO phased large-load approach, cannot connect all short-term | CONFIRMED | Queue MW wildly overstates what will be built -> completion-probability step (A) is essential, not optional |

## Statistics Canada / Alberta government
| Data | What we found | Status | Impact |
|---|---|---|---|
| Employment by occupation (NOC), Alberta + economic regions | Alberta open data, 2014-2017 (updated 2018), 2-4 digit NOC | CONFIRMED but OLD and archived | Need a current source (StatCan LFS / census profile). Not yet found |
| Occupation x industry cross-tab (NOC x NAICS) | 2011 NHS dataset for Alberta + economic regions found; no current table found | CONFIRMED (old) | KEY GAP for Step D. Must locate 2021 census / LFS table. Fallback: 2011 NHS (stale) |
| Input-output multipliers (jobs) | Alberta Economic Multipliers 2022 (Feb 2026) on alberta.ca/economic-statistics; open + closed models; StatCan provincial detail-level IO table also exists | CONFIRMED (page), values not opened | Step C is feasible with real Alberta multipliers |

## Not found / still open
- Jobs-per-MW coefficients (NREL JEDI or similar): not searched yet
- Current NOC x NAICS table at regional level
- Job postings data (licensing/cost)
- Learning-program data (Alberta course/micro-credential list)
- Whether connection list rows have town/county or only planning area/substation

## What this changes in the plan
1. Granularity: realistic output is REGION / planning area (and maybe economic region), not town. Say "your region", map towns -> economic regions.
2. Ingestion: monthly file pulls for the queue (simple scheduled job or even manual), API only for live price/grid status. AWS ingest is lighter than planned.
3. Step A is critical: 20,000+ MW of data centre requests vs. what grid can connect. Weighting by stage and AESO's phased approach must be explicit.
4. Step D needs a data source decision (2021 census vs LFS vs stale NHS) - data scientist's first task.
5. Occupation coverage and recency of StatCan data is the weakest link, not the AESO side.

## Next actions
- Download project list Excel + guide; inspect columns (region, MW, fuel, stage, dates)
- Download one planning-area load file; inspect
- Register for AESO API key, test pool price call
- Find current StatCan NOC x NAICS table (census 2021 / LFS) and open Alberta 2022 multipliers file
- Search for jobs-per-MW sources
