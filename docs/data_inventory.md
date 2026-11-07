# Data inventory

What each source is, what it can answer, and the traps. Download links are in [DATA_README.md](../DATA_README.md).

## AESO connection project list

45 monthly Excel files, January 2023 to November 2026. November 2023 and December 2024 aren't published. 13,533 project-months across 933 projects.

- **Columns:** status, project number and name, planning area, cluster, project type, MW type, stage, CA modelled, inclusion, applied date, then STS MW, DTS MW and in-service date for up to three energizations. Definitions are in the guide PDF.
- **Location:** planning area only (41 of them). Nothing finer in the Excel. The shapefile wasn't checked.
- **Good for:** what's being built, and from the archive, what happened to earlier projects.

Traps:
- The layout changes three times. Early files use section rows for status and a two-row header, later ones have a Status column and EN1/EN2/EN3 prefixes. `project_list.py` handles it.
- Status labels drift: "Processed For Cluster", "Status N/A", "Cluster 1/2/3".
- 21 projects bounce out of "Recently Energized" back to active. Multi-stage ones reappear when another stage gets scheduled.
- 12 projects vanish with no recorded outcome.
- MW are contract capacity changes, not generator sizes.
- Generators list a little DTS for station service, and storage lists charging as DTS, so adding the columns double counts.
- Over 21,000 MW of data centres have no date (ISD Under Review).
- Almost no retirements. The largest negative entry in the latest file is 8 MW.

## AESO planning area load

Hourly, 2015 to 2025, one zip per year, 42 planning areas. Columns include `Load`, `SysGen`, `CSDGen`, `BTFGen`, `ActLoad`, `REGION`, `PLANNING_AREA`. We use yearly averages of `ActLoad` where it exists.

Oil sands and industrial sites dominate some areas, so load growth says little about headcount. See validation.

## StatCan 2021 Census, table 98-10-0594

Labour force by occupation minor group (NOC 2021), industry sector (NAICS 2017), age and gender. The zip is 1 GB and the CSV inside is 12 GB. `extract_census.py` streams out 61,614 Alberta rows: 18 geographies x 21 industry levels x 163 occupation levels.

Traps:
- Geography is the province plus cities and larger towns. There's no rural detail or economic region.
- May 2021 reference week, during COVID.
- Counts are randomly rounded, so small cells are noisy.
- 25% sample, and the table includes confidence intervals which we don't use.

## StatCan Labour Force Survey

Table 14-10-0466, annual, 2011 to 2025, Alberta's economic regions, is what the code reads. 14-10-0464 has the same geography for labour force characteristics. Tables 14-10-0392 and 0393 are archived and stop at 2024.

Traps:
- LFS counts people where they live, not where they work.
- Two regions are merged (Banff-Jasper-Rocky Mountain House with Athabasca-Grande Prairie-Peace River), so 7 regions rather than 8.
- Small cells are suppressed, such as Utilities in Red Deer.
- Sectors are grouped differently from the census (41 with 44-45, 52 with 53, 51 with 71). `labour.LFS_GROUP` maps them.

## Alberta Economic Multipliers 2022

Thirteen tables, by industry and by commodity, in 2022 dollars. Employment is per $1M of output. The file doesn't give direct, indirect and induced separately, see methodology for how we recover them. Some rows are NA, mainly cannabis.

Used: Tables 1, 2 and 4, with Table 5 as a check. Not used: the "safety net" tables, and the commodity tables.

## CER Canada's Energy Future 2026

Costs by technology, province, scenario and year. There's an open-data download, but the page embeds the same Alberta values and `extract_cer_costs.py` reads them from there, so a CER page redesign would break the script. The output `config/cer_costs_alberta.csv` is committed. We use Current Measures and 2027. Battery storage, gas, wind and solar are all covered. Data centres and grid connections aren't.

## Other references

- **AESO large load page:** confirms the 1,200 MW Phase 1 allocation to P2936 (970 MW) and P3083 (230 MW).
- **AESO Data Centre Update, September 2025:** over 20,000 MW on the list, can't connect them all short term.
- **Pembina 2015, BC job factors:** cross-check only. Old and from a different province.
- **Delphi Group 2017, ATB on Beacon, Ontario project examples:** seen through secondary summaries only, not the originals.

## Still missing

- A real skills dataset. Adjacent roles use industry overlap as a proxy until it arrives.
- The full input-output table, for the real supplier mix behind indirect jobs.
- Job postings, which would give a much better test than census shares.
- Alberta-specific data centre costs and staffing.
