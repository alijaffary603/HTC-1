# GridSkills

GridSkills connects Alberta energy-investment scenarios and historical labour-market data to practical career exploration. The React app uses real exported regional scores, browser-side resume matching and a Gemini-powered career advisor.

## Run locally

Python 3.11+ and Node.js are required.

```powershell
python -m pip install -e ".[dev]"
Copy-Item .env.example .env
# Edit .env and set GEMINI_API_KEY. Never put keys in VITE_* variables.
python -m gridskills.server
```

In a second terminal:

```powershell
npm --prefix frontend install
npm --prefix frontend run dev
```

Open the Vite URL, choose an occupation and town, then use **Plan my next steps** on the results page. Scores load from static real-model exports; the Vite development proxy sends advisor requests at `/api` to `127.0.0.1:8000`. Existing model outputs are committed, so no raw-data download is necessary to use scores or the advisor.

## Implemented journey

- Real scores from `gridskills.api`, exported into frontend data files by `scripts/export_app_data.py`. The advisor independently reloads model evidence on the server. A web adapter also supports legacy five-digit NOC inputs and numeric region IDs.
- User-selected target role, self-reported experience, weekly study time, CAD budget and learning preference.
- Gemini action plans and follow-up questions grounded in server-loaded model evidence.
- Suggested skills to investigate and links from an allowlisted resource catalog. Provider directories are exploration resources, not a guarantee of a specific course, price, eligibility or certification.
- Opted-in mentor directory matching by region and target occupational group; no invented people. The directory starts empty. Source-linked career coaching is available when there are no matches.
- Introduction drafts that users can copy and send themselves.
- Saved action plans and completed-step checklists under **Plans**. These are stored only in the current browser/device; they are separate from account-based saved pathways.

Before a request, users explicitly choose to send their supplied skills/preferences/question and recent conversation to Google Gemini. The server supplies model results rather than accepting client-provided scores. Responses contain catalog IDs; unknown IDs and malformed plans are rejected. Provider errors never return credentials to the browser.

The existing Accounts, People, postings and email-alert features still use prototype implementations unless separately connected. The People page's profiles are fictional and no introductions are sent. New advisor mentor matches come only from `config/advisor_mentors.json`.

## Configuration

- `.env`: local `GEMINI_API_KEY`, optional `GEMINI_MODEL`; ignored by Git.
- `frontend/.env.example`: separate model/advisor API and existing account API configuration.
- `config/advisor_resources.json`: reviewed source links, matching occupation prefixes and dates checked.
- `config/advisor_mentors.json`: real profiles only after permission to list them. Example shape:

```json
[
  {
    "id": "your-profile-id",
    "name": "Consenting person's display name",
    "region": "Calgary",
    "targetCodes": ["7220"],
    "optedIn": true,
    "url": "https://your-approved-profile-page.example/",
    "reason": "Their experience is relevant to this transition."
  }
]
```

Replace the example URL with an actual approved HTTPS profile. Opt-out is removal or setting `optedIn` to `false`.

## Tests

```powershell
python -m pytest
npm --prefix frontend run build
npm --prefix frontend run lint
# Browser checks: install Chromium once, or set PLAYWRIGHT_CHANNEL=msedge on Windows.
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e
```

Advisor tests use mocked provider responses to check evidence grounding, catalog validation, mentor consent, bad inputs, safe errors and AWS event handling. Live provider tests require the key and incur API usage.

## AWS deployment

See [deployment/README.md](deployment/README.md). The repository includes a Lambda/API Gateway HTTP API template and a script that packages only code, model outputs and advisor catalogs. It excludes raw data, frontend files and local secrets. Cloud resources are not provisioned by running the local app.

## What the evidence supports

Energy-project scenarios estimate one possible source of demand; they have **not** demonstrated that they forecast hiring. Job trend describes past employment. Adjacent roles use industry overlap, not validated skill-transfer percentages. The app and advisor retain these distinctions and uncertainty ranges.

See [docs/validation.md](docs/validation.md), [docs/using_the_scores.md](docs/using_the_scores.md), and [DATA_README.md](DATA_README.md) for methodology, data and rebuilding instructions.
