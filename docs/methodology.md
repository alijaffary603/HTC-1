# Methodology

How queued grid projects become a job score for one person. Results and how far to trust them are in [validation.md](validation.md). Every judgement call is in [`config/assumptions.toml`](../config/assumptions.toml).

## The chain

```
AESO project list (Nov 2026, 70 GW queued)
  -> chance each project gets built            completion.py
  -> Alberta spending by year                  jobs.py, CER costs
  -> direct, indirect, induced jobs            multipliers.py
  -> sector and region                         jobs.py
  -> occupation                                scores.py, 2021 Census
  -> tailwind, exposure, adjacent roles        scores.py, api.py
```

Horizon is 2027 to 2029. Job figures are the average number of jobs supported per year over those three years, after weighting by the chance each project happens.

## 1. Chance a project gets built

Most of the queue never gets built. Of 933 projects seen since January 2023, 410 have been cancelled and 205 energized, and the rest are still open or dropped off the list.

**Logistic regression, the main model.** Each monthly list is a snapshot. For every open project we ask whether it energized within 18 months. Features are connection state (status and stage), technology family, log MW, months to in-service date and months since application. Scored on later months it beat the alternatives on both ranking and calibration.

**Markov chain, for far-out projects.** The logit can't say much about a project dated 2031. For anything more than 18 months out, we score it as though it were close to its date, then multiply by the chance it isn't cancelled before then. That chance comes from monthly state transitions over the last 24 months. It's the least tested part, because no project can be followed that far in a 46 month dataset.

**Bias correction.** On held-out months the logit predicted 1.00, 1.27 and 1.52 times the real count. Base multiplies by 0.80, low by 0.65, and high leaves it alone.

**Data centres are not modelled.** None has ever energized, so history can only say "never", and AESO is actively changing the rules. They get explicit scenario odds instead:

| Group | Low | Base | High |
|---|---|---|---|
| Phase 1 contracts (P2936, P3083, 1,200 MW) | 0.60 | 0.85 | 0.95 |
| Active, no Phase 1 allocation | 0.10 | 0.25 | 0.50 |
| Cluster 3, bring your own generation | 0.03 | 0.10 | 0.25 |
| ISD under review, no date, 21,000+ MW | 0.01 | 0.05 | 0.15 |

Base ends up at about 2,800 MW of data centres, out of 6,100 MW expected in total.

## 2. Timing

We only count energizations still to come. Dates get pushed back 8 months, the average slip measured across the lists. Projects with no date are placed 36 months out. Construction jobs are spread evenly over the build period before the in-service date, and only the part inside the horizon counts. Operating jobs start at in-service.

## 3. MW to jobs

```
construction jobs = MW x capex per kW x Alberta share x jobs per $1M
operating jobs    = MW x fixed O&M per kW-yr x Alberta share x jobs per $1M
```

- **Capex and O&M** are Alberta-specific CER figures, Canada's Energy Future 2026, Current Measures scenario, 2027 values. Mixed projects use weighted blends.
- **Jobs per $1M** come from Alberta's 2022 multipliers. The file doesn't publish the split, but it can be recovered: Table 1 is direct + indirect, Table 2 adds induced, and Table 4 is (direct + indirect) / direct. A test confirms this reproduces the published Type II multipliers in Table 5.
- **Alberta share** is the part of capex spent in Alberta, since turbines and panels are imported. Wind's 41% comes from Delphi's Alberta wind study (about $0.8M local per MW). The other technologies are judgement.

We read STS MW for generation and DTS MW for load. Generators carry a sliver of DTS for station service, and batteries list charging as DTS. Projects pairing a data centre with its own gas plant count as both. Contract changes and equipment work get no jobs.

For load connections we only count the wires. A new factory also adds jobs but the MW don't tell us how many, and for a growing town the load is more a result than a cause.

No US data is used. NREL and IRENA turned out not to be needed.

## 4. Sector and region

- **Direct** construction goes to sector 23. Direct operations go to 22 (utilities) or 51 (data centres).
- **Indirect** goes to supplier sectors using a judgement mix. The real answer needs the full input-output table.
- **Induced** goes to household-facing sectors, weighted by Alberta employment.
- **Region:** 60% of direct jobs and 50% of indirect and induced stay in the project's region, and the rest spreads across Alberta by employment.

We report by StatCan economic region, since that's a labour market and the finest level with current employment data. AESO's regions don't suit this: Fort Saskatchewan is in AESO's Northeast, but those workers live around Edmonton. The planning area crosswalk in `regions.py` was done by hand and edge cases are approximate. LFS merges two northern and mountain regions, so there are 7 regions rather than 8.

## 5. Occupation

```
jobs(occupation, region) = sum over sectors of jobs(sector, region) x share(occupation | sector)
```

Shares come from the 2021 Census for Alberta, covering all 162 NOC minor groups across 20 sectors. The same Alberta mix is used for every project, so an electrical construction site is assumed to hire like construction in general. That understates electricians on power projects.

Current workforce per occupation and region is LFS 2025 regional employment times the census occupation mix. The census table only covers cities and larger towns, so each regional mix is pulled toward Alberta's, more so when we can see fewer people.

## 6. The scores

**Tailwind (0-100).** Added jobs as a percent of the current workforce, ranked across all occupation-region pairs. Low and high are placed on the base distribution so the range is comparable.

**Exposure (0-100).** About the job rather than the place, so it's the same in every region. 60% is Alberta employment growth 2017-19 to 2023-25 in the sectors the job sits in, and 40% is the share of its workers in mining, oil and gas. The weights are judgement. It describes where a job already sits and isn't a forecast.

We planned to use retirements from the project list, but the queue barely has any (the largest negative entry is 8 MW). Regional load growth was also tried and dropped, see validation.

**Adjacent roles.** A stand-in until the skills matching lands. Close means working in the same industries, with a training level (TEER) within one step and a bonus for the same broad field. Only roles with at least the same tailwind are suggested. It can miss real skill overlaps and produce some odd pairings.

## Known limits

- Census data is from May 2021, during COVID.
- The occupation mix is province-wide and sector-wide.
- Multipliers assume spare capacity. If trades are short, spending raises wages rather than adding jobs.
- Project MW are contract capacity, not generator size.
- Some figures came from secondary summaries rather than the original report: Delphi (via news coverage), ATB's Beacon figures, and the Ontario project examples. Check them before quoting.
