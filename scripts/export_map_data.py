"""Export project records and regional technology occupation scenarios for the map.

No site coordinates are available in projects.csv. The UI uses regional anchors.
Occupation estimates are regional/technology totals, never project hiring forecasts.
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def export_map_data():
    reference = json.loads((ROOT / 'frontend/src/data/reference.json').read_text(encoding='utf-8'))
    with (ROOT / 'outputs/occupation_by_sector.csv').open() as f:
        mix = {r['code']: r for r in csv.DictReader(f)}
    estimates = {}
    with (ROOT / 'outputs/region_sector_tech_jobs.csv').open() as f:
        for row in csv.DictReader(f):
            roles = estimates.setdefault(row['region'], {}).setdefault(row['tech'], {})
            for code, shares in mix.items():
                roles[code] = roles.get(code, 0) + float(row['jobs']) * float(shares.get(row['sector'], 0))
    with (ROOT / 'outputs/projects.csv').open() as f:
        projects = [dict(id=r['project_id'], name=r['name'], region=r['region'], technology=r['tech'],
                         planningArea=int(float(r['pa_code'])), mw=float(r['mw']), date=r['isd'], state=r['state'])
                    for r in csv.DictReader(f)]
    payload = dict(snapshot=reference['snapshot'], projects=projects,
                   estimates={region: {tech: {code: round(n, 4) for code, n in roles.items()}
                                       for tech, roles in techs.items()} for region, techs in estimates.items()})
    target = ROOT / 'frontend/public/data/energy-map.json'
    target.write_text(json.dumps(payload, separators=(',', ':'), allow_nan=False) + '\n', encoding='utf-8')
    return payload


if __name__ == '__main__':
    export_map_data()
