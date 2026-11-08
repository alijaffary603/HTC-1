# Signal frontend

React + TypeScript (Vite), MUI components, React Router.

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

## Data
- **Scores are real.** `scripts/export_app_data.py` (repo root) runs `gridskills.api.score()` for all 162 jobs and
  7 regions and writes `src/data/reference.json` (jobs, regions, towns, aliases) and `public/data/scores/<code>.json`.
  The app reads those files, so no Python or server is needed. After the model's outputs change, rerun:
  `python -m venv .venv && .venv/bin/pip install pandas && .venv/bin/python scripts/export_app_data.py`
- **Resume reading runs in the browser:** `src/resume/` pulls text from PDF (pdf.js), Word .docx (mammoth) or
  .txt, matches it against a skills dictionary mapped to the model's job codes, and suggests the closest jobs with
  the skills that matched. The file never leaves the device. Abdullah's `extract_skills()` can replace
  `matchResume()` later with the same output shape (`SkillsResult`).
- **Saved resume:** signed-in people can keep one resume on their account ("Save it to my account" on the upload
  screen, on by default). It shows up as "Use your saved resume" next time and under Your resume on the Saved page,
  with download and delete. On AWS the file is stored in a private S3 bucket and the record in DynamoDB; in mock mode
  only the file name and what was read from it are kept, in this browser.
- **Still mocked:** accounts (browser storage), people to connect with, and job postings.
- Set `VITE_API_URL` (copy `.env.example` to `.env.local`) to send every call to a real backend instead.
  All backend calls go through `src/api/client.ts`, so the switch needs no UI changes.

## Layout
| Path | What |
|---|---|
| `src/types.ts` | Data contracts. `ModelScore` mirrors `gridskills.api.score()` exactly. |
| `src/api/client.ts` | API layer: `getScore`, `extractSkills`, `getMatches`, pathways CRUD |
| `src/data/` | Real jobs, regions and towns exported from the model |
| `src/mocks/` | Sample resume parser, people and job postings |
| `src/pages/` | Home (input), Results, Saved pathways, People like you |
| `src/components/` | Layout, ScoreCard, RangeBar, AdjacentRoleCard |
| `src/theme.ts` | Placeholder theme until the design system lands |

## Expected API (when not mocked)
- `GET  /score?occupation=<4-digit NOC>&region=<region name>` → `ModelScore` (the output of `gridskills.api.score()`)
- `POST /skills` (multipart `resume`) → `SkillsResult`
- `GET /resume` → `{ resume: SavedResume | null }`, `POST /resume` (multipart `resume`, signed in) reads and saves it
  → `{ resume: SavedResume }`, `GET /resume/file` → `{ url }` (5-minute download link), `DELETE /resume`
- `GET  /matches?region=<id>&from=<NOC>&to=<NOC>` → `Match[]`
- `GET/POST /pathways`, `DELETE /pathways/:id` → `Pathway`

### Accounts
All requests send `Authorization: Bearer <token>` when signed in. Sign-up and sign-in live in
`src/auth/authClient.ts` (mocked in the browser today); swap their bodies for Amazon Cognito calls.

### Job alerts
- `GET  /postings?occupation=<NOC>&region=<id>&sinceDays=<n>` → `JobPosting[]`
- `GET  /alerts` → `JobAlert[]` (signed-in user's alerts)
- `POST /alerts` `{ occupation, region, frequency }` → `{ alert, created }` (returns the existing alert for the same job and region)
- `PATCH /alerts/:id` `{ active?, frequency? }` → `JobAlert`
- `DELETE /alerts/:id`

Sending: an EventBridge schedule (daily 8 a.m., and Mondays for weekly alerts) triggers a Lambda that, for each
active alert, fetches postings from the alert's window and, only if there are any, calls
`buildAlertEmail()` from `src/email/alertEmail.ts` and sends `subject`, `html` and `text` through SES.
The template is plain TypeScript with no browser or React dependencies, so the Lambda can import it as is.
Job postings are sample data (`src/mocks/postings.ts`, fictional employers) until a postings source is chosen.

## Gemini action plans

The results page includes a Gemini career advisor with follow-up questions, catalog-backed resources, opted-in mentor suggestions and introduction drafts. Start `python -m gridskills.server` at the repository root to enable it locally. Scores continue to load from the real static model exports, and resume parsing continues to run in the browser.

Vite proxies advisor requests at `/api` to the local Python server. For AWS, set `VITE_MODEL_API_URL` to the advisor API Gateway URL. Keep Gemini credentials in the backend `.env` or Secrets Manager. `/plans` stores plans and checklist progress in this browser/device. Existing account and posting services remain separately configurable through `VITE_API_URL`.
