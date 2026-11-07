# Validation

What we tested against real outcomes, including the tests that went badly. Rerun with `python scripts/validate.py` and `python scripts/sensitivity.py`. Raw tables are in `outputs/validation_*.csv`.

## Short version

| Claim | Evidence | Verdict |
|---|---|---|
| We can tell which queued projects will get built | AUC 0.94 to 0.98 on later months | **Supported** |
| Occupation order within a region is stable | Rank correlation at least 0.95 under every assumption change | **Supported, but see below** |
| Job counts are accurate | Ranges from 3,300 to 36,000 a year, 78% from data centres | **Not supported, order of magnitude only** |
| MW built predict local construction hiring | 0.11, region size alone gets 0.71 | **Not supported** |
| The queue predicts where load grows | 0.42, simple past trend gets 0.68 | **Weak** |
| Electricity use tracks employment by region | -0.11 across 7 regions | **Not supported** |
| Tailwind predicts which occupations grow | -0.05 across 34 groups | **Not supported** |

So the model is good at saying what gets built, and it's an honest way to work out what that means for each occupation. There's no evidence yet that it predicts hiring.

## Completion model

Each fit only saw data up to the cutoff, and was then scored on what happened next. Data centres are left out, since none has energized.

| Cutoff | Window | Model | Projects | Actual | Predicted | AUC | Brier |
|---|---|---|---|---|---|---|---|
| May 2025 | 18 mo | Base rate | 267 | 29 | 26.2 | 0.50 | 0.097 |
| | | Markov, all history | | | 65.9 | 0.86 | 0.105 |
| | | Markov, last 24 mo | | | 66.4 | 0.85 | 0.108 |
| | | **Logit** | | | **36.7** | **0.94** | **0.058** |
| May 2025 | 12 mo | Base rate | 267 | 26 | 23.5 | 0.50 | 0.088 |
| | | Markov, all history | | | 47.9 | 0.81 | 0.087 |
| | | **Logit** | | | **26.1** | **0.96** | **0.046** |
| Nov 2025 | 12 mo | Base rate | 206 | 15 | 12.7 | 0.50 | 0.068 |
| | | Markov, all history | | | 40.4 | 0.87 | 0.079 |
| | | **Logit** | | | **22.8** | **0.98** | **0.035** |

The logit wins on every measure, but keep in mind:

- There are three overlapping test windows, and the 0.80 bias correction was fit to them, so the corrected numbers aren't independently tested.
- A lot of the skill comes from the in-service date, so it mostly confirms that projects about to finish finish. That's useful but it isn't magic.
- Nothing tests the far-dated extension, or anything beyond 18 months.

### Why the older data misleads

Early models over-predicted renewables badly because the market changed under them. MW by year in the project lists:

| | 2023 | 2024 | 2025 | 2026 to Nov |
|---|---|---|---|---|
| Renewables energized | 2,495 | 1,210 | 455 | 37 |
| Renewables cancelled | 10,298 | 11,397 | 9,072 | 6,673 |

Alberta's renewables restrictions from 2023 onward are the obvious suspect, but we haven't tested the cause.

## Does the queue tell us about the real economy?

**Queue vs later load growth.** January 2023 queued load against the change in actual load 2022 to 2025, across 42 planning areas. Rank correlation is 0.42 (0.35 using only projects AESO marked as included). The previous three years' trend gets 0.68, and once you know the trend the queue adds little (partial correlation 0.22). So it does carry signal, but "what happened lately" is the better predictor.

**Load vs employment.** Growth 2019 to 2025 across regions: -0.11. Wood Buffalo's load grew 13% with flat employment, because oil sands load isn't about headcount. Camrose-Drumheller's load fell 11% while employment grew 14%. Seven points can't prove much, but there's nothing here to build on, so load came out of the exposure score.

**MW built vs construction hiring.** We converted MW actually energized 2023 to 2025 into model job-years and compared them with the LFS change in construction employment.

| Region | MW built | Model job-years | Construction jobs | Actual change |
|---|---|---|---|---|
| Calgary | 344 | 687 | 82,300 | +13,650 |
| Edmonton | 1,007 | 2,016 | 87,050 | +8,100 |
| Lethbridge-Medicine Hat | 2,618 | 5,395 | 13,450 | +450 |
| Camrose-Drumheller | 1,271 | 2,520 | 10,400 | -50 |
| Red Deer | 64 | 131 | 11,450 | -650 |
| Northwest and mountains | 2,100 | 3,700 | 17,300 | +1,550 |
| Wood Buffalo-Cold Lake | 128 | 152 | 7,150 | +800 |

Rank correlation is 0.11, and -0.43 in percent terms. Region size gets 0.71. Lethbridge-Medicine Hat built the most and hardly added construction jobs. LFS counts people where they live, so this fits crews commuting from the cities, and it's also true that housing and population drive far more construction than energy does. We lowered the local share of direct jobs from 100% to 60% because of this. The right value isn't pinned down.

**Tailwind vs occupation growth.** Model tailwind against Alberta employment growth 2021-22 to 2024-25, by LFS occupation group: -0.05 across 34 groups. Not a clean forecast test, since the periods differ, but a real signal should show. Trades ranked highest and grew a healthy 7 to 10%, while plenty of low-tailwind groups grew faster because Alberta's population grew so quickly.

The likely reason for all of this is scale. Grid-driven demand is about 11,000 jobs a year in a workforce of 2.6 million, about 0.44%. It's a real effect on trades and close to invisible for most other jobs.

**Sector trend persistence.** Exposure uses recent sector trends, so we checked whether they carry forward, comparing 2012-14 to 2017-19 against 2017-19 to 2023-25. Within a region: 0.06. Province-wide: 0.39. That's why exposure now uses province-wide trends, and why it should be read as description and not a forecast.

## Jobs per MW against published figures

| | Ours | Published | Source |
|---|---|---|---|
| Wind construction | 3.1 | 3.3 | Delphi 2017, Alberta |
| | | 2.0 | Wolfe Island, Ontario, construction only |
| | | 10.6 | Pembina 2015, BC |
| Solar construction | 3.2 | 11.0 | 9.1 MW park, Ontario, construction only |
| | | 28.5 | Pembina 2015, BC, from 2013-era solar costs |
| Wind operations | 0.14 | 0.37 | Pembina 2015, includes a transmission share |
| Solar operations | 0.09 | 0.30 | Pembina 2015, includes a transmission share |

Wind agrees with the one Alberta source, although wind's local share was taken from that same study, so the check is only partly independent. Solar and operations are on the low side of what's published, and solar could easily be 3x higher. Solar has fallen a lot since those figures, which explains some of the gap but not all of it.

## Sensitivity

One change at a time, for occupations with at least 500 workers in the region. "Within region" is the worst-case correlation of occupation order inside one region, which is what a single user sees.

| Change | Jobs per year | vs base | Rank corr. | Top 100 overlap | Within region |
|---|---|---|---|---|---|
| No data centres | 2,301 | 0.21x | 0.92 | 86% | 0.99 |
| Data centres: Phase 1 only | 4,411 | 0.40x | 0.96 | 88% | 1.00 |
| Data centres: high case | 22,300 | 2.05x | 0.99 | 98% | 1.00 |
| Build the whole queue | 130,297 | 11.96x | 0.99 | 95% | 1.00 |
| Local spend x0.7 | 7,663 | 0.70x | 1.00 | 100% | 1.00 |
| Local spend x1.3 | 14,124 | 1.30x | 1.00 | 100% | 1.00 |
| CER net-zero costs | 10,805 | 0.99x | 1.00 | 99% | 1.00 |
| No induced jobs | 9,473 | 0.87x | 0.97 | 98% | 0.95 |
| Indirect split evenly | 10,903 | 1.00x | 0.98 | 95% | 0.95 |
| All jobs stay local | 10,845 | 1.00x | 0.98 | 96% | 1.00 |
| No jobs tied to region | 10,953 | 1.01x | 0.97 | 93% | 1.00 |

Base is 10,893 on this filtered set. Total across all occupations is 11,443, range 3,326 to 36,271. Data centres are 78%.

**Careful with this table.** It shows order is stable, not that it's right. Order barely moves because every scenario pushes jobs through the same census sector mix, so tailwind within a region is largely a measure of how construction-heavy a job is. That's a sensible answer to "who benefits from a building boom", but the stability is partly built in.

## What we can and can't say

Fine to say:
- "About 70 GW is queued and we expect about 6 GW of it to be built", with the method behind it.
- "We backtested the completion model and it ranks well on later data."
- "Energy buildout mostly helps trades and construction, and here's how each occupation is connected to it."
- "Data centres are the big unknown. Without them the job estimate falls by about 80%."

Don't say:
- "We predict jobs." We estimate demand from one source, and it didn't predict past hiring.
- "X new jobs for teachers in Red Deer" as a firm number. Show ranks and ranges.
- "Electricity data tells you the health of any job." The load data doesn't support this.
