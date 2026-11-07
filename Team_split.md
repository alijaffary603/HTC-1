# GridSkills – Team split (4 people)

## Data scientist – "the model"
Owns workflow Steps A-F.
- Explore AESO + StatCan data, decide what regional granularity is real
- Build sector->occupation table (NOC x NAICS) and jobs-per-MW / multiplier tables
- Project completion probability (stage weights, then logistic regression if history exists)
- Demand/tightness calculation, low/base/high scenarios
- Backtest against actual employment
Deliverable: a function `score(occupation, region) -> {tailwind, exposure, adjacent_roles, range}` plus a documented methodology.

## SWE – "the product"
Owns the app and API.
- Frontend app (inputs, results, saved pathways) wired to the API
- API (Lambda/API Gateway), auth (Cognito), database (DynamoDB)
- Networking/matching feature (region x transition)
Deliverable: working end-to-end app that calls the scoring function.

## Computer scientist – "the plumbing + AI"
Owns data pipeline and AI features.
- Scheduled AESO ingestion (EventBridge/Lambda -> S3), cleaning, tagging, Athena/DynamoDB tables
- Resume/job-title -> skills + occupation matching (Bedrock/embeddings)
- Skill-gap -> learning-resource matching
- Deploying the scoring model as a service with the data scientist
Deliverable: fresh, clean data tables + `extract_skills(text)` and `gap(user_skills, target_role)`.

## Visuals – "the story"
Owns design and presentation.
- Design system, user flow, mobile-friendly layouts
- Map + timeline visualizations of grid-driven growth by region
- Score cards (Tailwind / Exposure / Adjacent moves) with uncertainty ranges shown clearly
- Pitch deck, demo script, branding
Deliverable: Figma designs early, then polished front-end components and the final demo.

## Contracts (agree on day 1 so nobody blocks)
1. Data schema: project table (type, MW, region, stage, year)
2. Scoring output JSON shape
3. Skills output JSON shape
Use mock data of these shapes so everyone builds in parallel.

## Timeline
- Phase 0 (together, ~half a day): agree on contracts, pick 10 sectors / 50 occupations, confirm data availability.
- Phase 1 (parallel): each owns their piece with mock data.
- Phase 2 (integration): swap mocks for real data/model; SWE + visuals lead.
- Phase 3 (polish): end-to-end demo with 2-3 hand-picked example personas (teacher, retail manager, accountant); rehearse pitch.

## Risks / who watches them
- AESO data too coarse regionally -> data scientist, early
- Scope creep (networking) -> SWE keeps it minimal for v1
- Demo reliability -> everyone; freeze features before final day
