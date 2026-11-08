import csv
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('export_map_data', ROOT / 'scripts/export_map_data.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_map_export_matches_sector_occupation_calculation():
    alerts_path = ROOT / 'frontend/public/data/projects.json'
    alerts_before = alerts_path.read_bytes()
    payload = module.export_map_data()
    assert alerts_path.read_bytes() == alerts_before, 'Map export must preserve the grid-alert project format'
    with (ROOT / 'outputs/occupation_by_sector.csv').open() as f:
        shares = next(r for r in csv.DictReader(f) if r['code'] == '7220')
    with (ROOT / 'outputs/region_sector_tech_jobs.csv').open() as f:
        expected = sum(float(r['jobs']) * float(shares.get(r['sector'], 0))
                       for r in csv.DictReader(f) if r['region'] == 'Calgary' and r['tech'] == 'solar')
    assert abs(payload['estimates']['Calgary']['solar']['7220'] - expected) < 0.0001
    assert payload['projects']
    assert all(p['region'] in payload['estimates'] for p in payload['projects'])
    assert all('lat' not in p for p in payload['projects'])
