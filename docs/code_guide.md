# Code guide

What every code file does. For why the model works the way it does, see [methodology.md](methodology.md).

## How it fits together

```
raw data in data/
   |
   |  scripts/extract_census.py     (once, slow) census zip -> Alberta rows
   |  scripts/extract_cer_costs.py  (once) CER page -> config/cer_costs_alberta.csv
   v
scripts/build_all.py   runs the whole model using the gridskills package
   |
   v
outputs/*.csv          the results, committed to git
   |
   +--> gridskills/api.py          score() for one job, reads outputs/ only
   +--> scripts/validate.py        checks the model against real outcomes
   +--> scripts/sensitivity.py     checks how much each assumption matters
   +--> scripts/publish.py         checks, then converts to the app's format and uploads to S3
                                       |
                                       v
                       backend/gridapi/   the Lambda the web app talks to (see docs/aws.md)
```

## `backend/gridapi/`, the Lambda code

One package, deployed as two Lambda functions. Tests are in `tests/backend/` and use moto, so no AWS account is needed.

| File | What it does |
|---|---|
| `api.py` | API Lambda handler. Routes every `/api/*` request the frontend makes |
| `data.py` | Loads published scores from S3 and caches them. Turns 5-digit NOC codes into 4-digit |
| `store.py` | DynamoDB: saved pathways, opt-in sharing, matches, alerts |
| `resume.py` | Résumé to skills and occupations with the Gemini API |
| `uploads.py` | Reads the multipart résumé upload and checks the file type and size |
| `emails.py` | The outlook-change and intro emails, and sending through SES |
| `alerts.py` | Alerts Lambda handler. After each monthly refresh, emails people whose outlook moved |
| `config.py` | Environment variables set by the template |

## `aws/`

| File | What it does |
|---|---|
| `template.yaml` | The whole stack in CloudFormation. Lint with `cfn-lint aws/template.yaml` |
| `buildspec.yml` | What the monthly CodeBuild job runs |

Inside the build, data moves through the package in this order:

`project_list` -> `completion` -> `jobs` (using `params`, `multipliers`, `regions`) -> `scores` (using `labour`, `load`) -> `outputs/`

## `gridskills/`, the model

| File | What it does | Main functions |
|---|---|---|
| `__init__.py` | Empty. Marks the folder as a Python package | |
| `paths.py` | One place for every folder and file location | constants only |
| `project_list.py` | Reads the 45 AESO Excel files into one table, coping with the format changes. Tidies status names and groups MW types into technologies (`TECH_GROUPS`) | `read_list`, `read_all`, `add_derived` |
| `regions.py` | All the geography. Maps planning areas and census areas to the 7 economic regions, and towns to regions | `find_region`, `lfs_region` |
| `completion.py` | Estimates the chance each project gets built. Logistic regression for near-term projects, Markov chain for attrition on far-off ones | `clean_panel`, `fit_logit`, `fit_chain`, `p_built` |
| `params.py` | Loads `assumptions.toml` and the CER costs, and works out blended costs for mixed projects | `load_assumptions`, `tech_costs` |
| `multipliers.py` | Reads Alberta's multiplier spreadsheet and splits jobs per $1M into direct, indirect and induced | `load` |
| `jobs.py` | The core conversion. Applies odds to projects, then turns MW into jobs by year, sector and region. Data centre odds get applied here | `score_projects`, `energizations`, `project_jobs`, `to_sectors`, `jobs_per_mw` |
| `labour.py` | Census and Labour Force Survey tables: which occupations work in which sectors, regional workforce, and employment trends | `occupation_given_sector`, `region_occupation_employment`, `sector_momentum`, `occupation_trend`, `employment_growth` |
| `load.py` | Reads the hourly AESO load files into yearly averages by planning area. Display and validation only, it doesn't feed any score | `build_yearly`, `region_growth` |
| `scores.py` | Produces the four results: tailwind, exposure, job trend and adjacent roles | `tailwind`, `exposure`, `job_trend`, `adjacent_roles` |
| `api.py` | One job's result in plain Python. Looks up the job and place, reads `outputs/`. Holds the `ALIASES` lookup for everyday job names | `score`, `find_occupation`, `occupations` |
| `contract.py` | Converts results into the exact shape `frontend/src/types.ts` expects, for every job and all 8 economic regions | `build`, `summary` |
| `checks.py` | Sanity checks a monthly build must pass before it's published | `check_outputs`, `check_bundle` |

## `scripts/`, things you run

Run these from the project folder with the virtual environment's Python, for example `.venv/Scripts/python scripts/build_all.py`.

| File | What it does | When to run it |
|---|---|---|
| `extract_census.py` | Streams the Alberta rows out of the 12 GB census file into `data/processed/census_alberta.parquet` | Once, after downloading the census zip |
| `extract_cer_costs.py` | Pulls Alberta costs out of the saved CER page into `config/cer_costs_alberta.csv` | Only if CER publishes new costs |
| `build_all.py` | Runs the whole model and writes `outputs/`, including the sample responses | When data or assumptions change |
| `validate.py` | Runs the backtests and real-world comparisons, writes `outputs/validation_*` | After `build_all.py` |
| `sensitivity.py` | Changes one assumption at a time and writes `outputs/sensitivity.csv` | After `build_all.py` |
| `fetch_aeso.py` | Downloads any monthly AESO project lists we don't have yet | Monthly, CodeBuild runs it |
| `publish.py` | Runs the checks, then uploads the app's answers to S3. `--dry-run` checks without uploading | Monthly, CodeBuild runs it |
| `deploy.py` | Deploys the whole AWS stack, data and web app. See [aws.md](aws.md) | When the code or template changes |
| `generate_skills.py` | Asks Gemini for each occupation's key skills, writes `config/skills.json` for "skills to build" | Once, then review the output |

`validate.py` holds one function per check: `completion_backtest`, `queue_vs_load`, `load_vs_employment`, `sector_trend_persistence`, `built_vs_hiring`, `job_trend_backtest`, `tailwind_vs_occupation_growth` and `cross_check`. Results are explained in [validation.md](validation.md).

## `config/`, the inputs you can edit

| File | What it holds |
|---|---|
| `assumptions.toml` | Most of the judgement calls: horizon, Alberta spending shares, build times, data centre odds, indirect mix, local job shares. Each is tagged with where it came from |
| `cer_costs_alberta.csv` | Generated by `extract_cer_costs.py`. Don't edit by hand |

A few judgement calls live in code instead: `EXPOSURE_WEIGHTS` and the thin-data cut-offs in `scores.py`, `SHRINK_PEOPLE` in `labour.py`, and the hand-made maps in `regions.py`.

## `tests/`

Run with `.venv/Scripts/python -m pytest`. Each file tests the module of the same name.

| File | What it checks |
|---|---|
| `test_project_list.py` | Old and new Excel layouts both parse correctly, and status names normalize |
| `test_regions.py` | Every mapping lands on a real region, and town lookup works, including typos |
| `test_completion.py` | Project states, outcome handling, no peeking past the cutoff, and that late-stage projects score above early ones |
| `test_multipliers.py` | The job split adds back to the published totals and matches Table 5. Skipped if the raw data isn't there |
| `test_jobs.py` | MW are read correctly, finished stages are dropped, odds scale jobs, scenarios stay in order and no jobs get lost |
| `test_labour.py` | LFS group parsing, picking the most detailed group, and growth calculations |
| `test_scores.py` | Job totals add up, score ranking, exposure, job trend and adjacent role rules |
| `test_api.py` | Response shape, job and town lookup, bad input and aliases. Skipped if `outputs/` hasn't been built |

## Where to change things

| You want to | Change |
|---|---|
| Try different data centre odds or an Alberta spending share | `config/assumptions.toml`, then rerun `build_all.py` |
| Add a new month of AESO data | Drop the file in `data/aeso_project_lists/`, keep AESO's file name, rerun `build_all.py` |
| Handle a new MW type from AESO | `TECH_GROUPS` in `project_list.py`, plus a `[tech.*]` block in `assumptions.toml` if it's a new technology |
| Support another town | `PLACES` in `regions.py` |
| Support another everyday job name | `ALIASES` in `api.py` |
| Change the app's response | `score()` in `api.py`, and tell the SWE and visuals person |
| Swap in real skills matching | `adjacent_roles` in `scores.py`, keeping the same output columns |
| Add a new check | A function in `validate.py`, called from its `main()` |
