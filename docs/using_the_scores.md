# Using the scores

For the SWE, computer scientist and visuals. You don't need the raw data for any of this, the tables in `outputs/` are enough.

## Calling it

```python
from gridskills.api import score, occupations

score("teacher", "Red Deer")     # alias, word from a title, or 4-digit NOC code
score("7220", "Medicine Hat")    # a town or a region name
occupations()                    # all 162 codes and titles
```

From a terminal: `python -m gridskills.api electrician "Fort Saskatchewan"`

Bad input raises `ValueError` with a readable message, so it's fine to show that to the user. Real responses for five people are in `outputs/sample_scores.json`, so build against those.

## Response

```json
{
  "occupation": {
    "code": "4122",
    "title": "Secondary, elementary and kindergarten school teachers"
  },
  "region": "Red Deer",
  "tailwind": {
    "score": 10,
    "range": [
      4,
      52
    ],
    "added_jobs_per_year": {
      "low": 0.8,
      "base": 3.2,
      "high": 11.6
    },
    "percent_of_workforce": 0.1,
    "workforce": 3276,
    "top_technologies": [
      {
        "technology": "data_centre",
        "share": 0.789
      }
    ]
  },
  "exposure": {
    "score": 9,
    "sector_growth_pct_per_year": 2.46,
    "share_in_mining_oil_gas": 0.0,
    "region_load_growth_pct_per_year": 0.94
  },
  "adjacent_roles": [
    {
      "code": "4120",
      "title": "University professors and post-secondary assistants",
      "closeness": 1.0,
      "tailwind": 63
    }
  ],
  "caveats": [
    "Most of this comes from data centres. None has connected to the Alberta grid yet, so it's the least certain part."
  ]
}
```

Trimmed to one technology and one role here, the sample file has the full version. The scores are percentiles, so 10 means this job and region sit above about 10% of all job-region pairs. `adjacent_roles` can be empty, and when it is there's a caveat explaining why.

## Files

| File | Use it for |
|---|---|
| `scores.csv` | One row per occupation and region, 1,134 rows. Everything in the response |
| `adjacent_roles.csv` | Top 5 suggested moves per occupation and region |
| `regions.json` | Province and region totals for the map |
| `projects.csv` | Every open project with MW, odds and jobs. `pa_code` joins to the planning area map |
| `region_sector_tech_jobs.csv` | Jobs by region, sector and technology, for "what's driving this" charts |
| `occupation_by_sector.csv` | Which occupations each sector hires |
| `jobs_per_mw.csv` | Job factors by technology |
| `sensitivity.csv`, `validation_*` | For the pitch and Q&A |

Rebuild with `python scripts/build_all.py`, once the raw data is in place.

## Showing it honestly

This matters as much as the numbers. See [validation.md](validation.md) for why.

- **Lead with the score and range, not the job count.** "3.2 new teaching jobs" reads as a promise and it isn't one. If you show counts, show the low to high range next to them.
- **Always show the range.** It's wide because the uncertainty is real.
- **Show `caveats`.** Especially the data centre one, since most results depend on it.
- **Use "demand from energy projects", not "job growth".** Tailwind only covers this one source. A teacher with a low score doesn't have a bad outlook overall. It just means energy projects won't change much for them.
- **Exposure describes, it doesn't forecast.** "Your job leans on oil and gas" is fine. "Your job is at risk" isn't, because telling someone that has real stakes and we can't back it up.
- **Regions are large.** Say "your region", never "your town".
- **Label adjacent roles as a starting point.** They're based on shared industries, not skills, until the real matching is in.

## For the computer scientist

`gridskills.api.ALIASES` is a small hand-written lookup so typing "nurse" works in the demo. Your résumé matcher should return a NOC 4-digit code, then call `score(code, region)`. For skills, replace `scores.adjacent_roles`. It takes a sector table and the tailwind table and returns one ranked row per suggestion, so you can keep that output shape and nothing else has to change.

## For the SWE

- `score()` caches the tables after the first call, so it's fine behind a Lambda.
- The package needs `pandas`, but the API only reads CSVs, so you could load `scores.csv` into DynamoDB (region + code as the key) and skip Python at request time.
- The project list updates monthly. When a new file lands, drop it in `data/aeso_project_lists/` and rerun the build. The parser reads the month from the filename, so keep AESO's naming.
