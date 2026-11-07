# GridSkills frontend

React + TypeScript (Vite), MUI components, React Router.

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

## Mock mode
With no `VITE_API_URL` set, the app runs entirely on local mock data (`src/mocks/`).
To call the real backend, copy `.env.example` to `.env.local` and set `VITE_API_URL`.
All backend calls go through `src/api/client.ts`, so swapping mocks for the real API needs no UI changes.

## Layout
| Path | What |
|---|---|
| `src/types.ts` | Draft data contracts (score, skills/gap, pathways, matches). Agree with DS + CS. |
| `src/api/client.ts` | API layer: `getScore`, `extractSkills`, `getMatches`, pathways CRUD |
| `src/mocks/` | Mock score model, resume parser, people; reference lists (occupations, regions, towns) |
| `src/pages/` | Home (input), Results, Saved pathways, People like you |
| `src/components/` | Layout, ScoreCard, RangeBar, AdjacentRoleCard |
| `src/theme.ts` | Placeholder theme until the design system lands |

## Expected API (when not mocked)
- `GET  /score?occupation=<NOC>&region=<id>` → `ScoreResult`
- `POST /skills` (multipart `resume`) → `SkillsResult`
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
