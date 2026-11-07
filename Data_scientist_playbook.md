# Data scientist playbook (GridSkills)

Goal: ship `score(occupation, region) -> {tailwind, exposure, adjacent_roles, range}` with a documented, defensible method.

## Order of work

### 1. Inspect the data (day 1)
- Download AESO connection project list (Excel) + guide PDF. Record: columns, fuel/type values, stage values, MW fields, location fields (planning area? substation? county?), dates, row count, missing rates.
- Download one planning-area hourly load file (e.g. 2024). Check columns and area names.
- Download Alberta Economic Multipliers 2022 (alberta.ca/economic-statistics).
- Find a CURRENT NOC x NAICS (or occupation x industry) source for Alberta regions (2021 census, LFS custom tables). Fallback: 2011 NHS dataset on open.alberta.ca.
- Output: `data_inventory.md` with what each source can and cannot answer. Share with the team (schema contract depends on it).

### 2. Define the region system (day 1-2)
- AESO planning areas vs Alberta economic regions vs towns. Build a crosswalk: planning area -> economic region (-> towns). Accept approximate. Document assumptions.
- Decide the unit the product reports: probably economic region.

### 3. Build the project table (day 2-3)
Clean rows: project_id, type (solar/wind/storage/gas/data centre/industrial/other), MW, region, stage, expected in-service year. Handle duplicates, withdrawn projects, units.

### 4. Completion probability (Step A)
- Start: stage-based weights as explicit assumptions (e.g. early study low, under construction high), data-centre-specific haircut because requests >> connectable capacity.
- Upgrade: use archived monthly project lists to measure real stage->in-service rates (survival / logistic regression). Report this as the one real ML piece.
- Cap total data centre MW by AESO's stated phased/allowed capacity as a scenario.

### 5. Jobs from projects (Steps B-C)
- Find citable jobs-per-MW (construction job-years/MW, operations jobs/MW) by type: NREL JEDI, Canadian studies (Clean Energy Canada, CanREA), AESO/Alberta reports. Keep a sources table with value, range, citation.
- Direct jobs = sum(p x MW x coefficient), phased by year.
- Indirect/induced via Alberta multipliers (use closed model for induced). Spread across industries.

### 6. Industries -> occupations (Step D)
- demand(occ, region, year) = sum_industry jobs(ind) x share(occ | ind).
- Start with ~10 sectors / ~50 occupations (agree with team). Pick personas: teacher, retail manager, accountant, electrician, nurse.

### 7. Scores (Step E)
- Tailwind = projected added demand / current employment in occupation+region (tightness). Normalize to 0-100.
- Exposure = share of the occupation's employment in industries with declining projected activity (retirements, falling load) or high electrification/AI reshaping. Be explicit that this part is judgment-heavy.
- Adjacent roles = occupations with high skill overlap (use O*NET/NOC skills data; coordinate with the computer scientist) AND high tailwind.

### 8. Uncertainty (Step F)
- Low/base/high: vary completion probabilities, coefficients, multipliers. Output ranges. Sensitivity table: which assumption moves results most.

### 9. Validate
- Sanity checks: do known boom regions (e.g. Industrial Heartland, southern wind/solar areas) rank where expected?
- Backtest: apply method to an older queue snapshot, compare predicted vs actual employment change in occupations/regions (even coarse). Report honestly, including where it fails.
- Compare to Alberta occupational outlooks / job postings as a cross-check.

### 10. Package and hand off
- Python module with `score()`; unit tests; notebook showing each step with charts for the visuals person.
- `methodology.md`: formulas, sources, assumptions, limitations.
- Agree JSON output shape with SWE (day 1 contract) and ship mock outputs EARLY so others are not blocked.

## Rules of thumb
- Keep it simple and explainable; every number traceable to a source.
- Version your assumptions in one config file (stage weights, coefficients).
- Show ranges, not false precision. State limits (leading regional indicator, not a guarantee).
- Commit small and often; keep raw data out of git if large (document where to fetch it).

## Suggested stack
Python, pandas, openpyxl, geopandas (shapefile), statsmodels/scikit-learn (stage->outcome model), Jupyter, pytest.

## Deliverables checklist
- [ ] data_inventory.md
- [ ] region crosswalk
- [ ] clean project table
- [ ] completion-probability model + assumptions
- [ ] coefficients table with citations
- [ ] occupation demand table
- [ ] score() + tests
- [ ] scenario/sensitivity outputs
- [ ] validation report
- [ ] methodology.md
