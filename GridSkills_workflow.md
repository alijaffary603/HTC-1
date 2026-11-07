# GridSkills – How the project works

Prompt: How can we leverage technology to help people develop in-demand skills and build meaningful networks in a rapidly changing job market?

Idea: Use AESO (Alberta electricity) data as a leading economic signal to estimate where jobs in ANY field will grow or shrink, then guide people to skills and networks.

## End-to-end workflow

1. INGEST (AWS EventBridge -> Lambda -> S3)
   Scheduled pull of AESO data: interconnection/queue projects, regional load, generation mix, retirements, pool price. Raw history kept in S3.

2. CLEAN + TAG (Lambda -> DynamoDB / Athena)
   Each queue project gets: type (solar, wind, storage, gas, data centre, industrial), MW, region, stage, expected in-service year.

3. ESTIMATE DEMAND (transparent model, see below)
   Projects -> expected jobs by industry, region, year -> expected demand by occupation.

4. USER INPUT
   User picks occupation + town (or uploads resume -> Bedrock extracts skills).

5. SCORES
   - Tailwind: growth near you touching your role
   - Exposure: shrinking/reshaped industry risk
   - Adjacent moves: nearby growing roles + skill gaps

6. PATHWAY + NETWORK
   Learning links for the gaps; match people by region x transition; mentors who made the move.

## How we "predict" jobs – mostly NOT ML (on purpose)

There is no labeled dataset of "this power project caused these jobs", so end-to-end ML would be guesswork. We use a transparent, explainable pipeline with ML only where data supports it.

Step A – Probability a project actually happens
  p(project) by stage (early study / approved / under construction).
  ML-lite: calibrate from historical queue snapshots (what share of projects at each stage reached in-service) via logistic regression / survival analysis. Until then, use assumed stage weights.

Step B – Direct jobs
  direct_jobs(region, year) = sum over projects [ p x MW x jobs_per_MW(type, phase) ]
  Construction vs operations coefficients from published studies (e.g. NREL JEDI-style factors). Show ranges, not points.

Step C – Indirect + induced jobs
  Apply StatCan input-output multipliers -> jobs spread across industries (housing, health, retail, finance, education...).

Step D – Industries -> occupations
  demand(occ, region, year) = sum over industries [ jobs(industry) x share of occupation in industry ]
  Using StatCan occupation-by-industry (NOC) tables.

Step E – Compare with supply
  tightness = projected demand growth / current employment in that occupation + region (StatCan LFS/census).
  Declines (plant retirements, falling load) subtract jobs the same way.

Step F – Uncertainty
  Run low/base/high scenarios (project completion odds, multipliers). Output a range and confidence.

## Where ML genuinely helps
- Project completion probability (classification, Step A)
- Resume/job-title -> skills and occupation matching (LLM / embeddings via Bedrock)
- Backtesting: compare past predictions to actual employment/job-postings, then tune coefficients (e.g. gradient boosting on residuals) once we have history

## Honest limits
- Regional leading indicator, not a guarantee of jobs
- Queue projects get delayed/cancelled
- Multipliers are estimates; skill mappings need validation by employers/training providers
- Combine with StatCan + job-postings data; electricity is one input

## Data sources to confirm
- AESO: interconnection queue, long-term outlook, regional load, current supply/demand
- Statistics Canada: LFS, census occupation-by-industry, input-output multipliers
- Alberta government: ALIS / wage and salary surveys, occupational outlooks

## MVP plan
1. Pull real AESO data; confirm regional granularity.
2. Sector->occupation table: ~10 sectors, ~50 occupations.
3. Implement Steps A-F with simple multipliers.
4. Dashboard: occupation + town -> three scores + adjacent roles + learning links.
5. Basic "people like you" matching.

## AWS (only where justified)
EventBridge+Lambda+S3 (ingest), Athena/DynamoDB (query), Bedrock (resume skills), Cognito (accounts), Amplify/API Gateway (serve). No EKS/SageMaker/Redshift/Kinesis for v1.

## Team split (4 people)

| Person | Owns | Main deliverable |
|---|---|---|
| Data scientist | Prediction model (Steps A-F): explore AESO + StatCan data, sector->occupation and jobs-per-MW tables, project completion odds, demand/tightness scoring, scenarios | `score(occupation, region)` -> three scores + ranges, plus methodology doc |
| SWE | The app: frontend, API, auth, database, saved pathways, networking/matching | Working end-to-end app calling the scoring function |
| Computer scientist | Plumbing + AI: scheduled AESO ingestion, cleaning/tagging, resume->skills (Bedrock), skill-gap and learning-resource matching | Clean data tables, `extract_skills(text)`, `gap(user_skills, target_role)` |
| Visuals | Design system, map + timeline of regional growth, score cards showing uncertainty, pitch deck + demo script | Figma early, then polished components and final demo |

### Contracts to agree on day 1 (build against mocks in parallel)
1. Project table schema (type, MW, region, stage, year)
2. Scoring output JSON shape
3. Skills output JSON shape

### Timeline
- Phase 0 (together, ~half a day): agree contracts, pick ~10 sectors / ~50 occupations, confirm AESO regional granularity
- Phase 1 (parallel): each builds their piece with mock data
- Phase 2 (integration): swap in real data + model; SWE and visuals lead
- Phase 3 (polish): demo with 2-3 personas (teacher, retail manager, accountant); rehearse pitch

### Notes
- Data scientist and computer scientist overlap on data prep: CS delivers clean tables, DS consumes them
- Visuals designs against mock data from day 1, not waiting on the model
- Keep networking minimal in v1 to avoid scope creep

See also: Team_split.md

## Data availability update (see Data_availability.md)
- AESO queue = monthly Excel/GIS download, not an API -> ingest monthly. API (unverified) only for live price/grid status.
- Regional granularity = planning areas / economic regions, not towns.
- >20,000 MW of data centre requests on the list vs. limited connectable capacity -> Step A (completion probability) is essential.
- Current NOC x NAICS regional table NOT yet found (only 2011 NHS) -> biggest data gap, data scientist's first task.
- Alberta 2022 economic multipliers exist (alberta.ca/economic-statistics).
