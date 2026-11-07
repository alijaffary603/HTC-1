from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PROCESSED = DATA / "processed"
OUTPUTS = ROOT / "outputs"
CONFIG = ROOT / "config"

PROJECT_LISTS = DATA / "aeso_project_lists"
LOAD_ZIPS = DATA / "aeso_planning_area_load"
CENSUS_ZIP = DATA / "statcan_98100594" / "98100594-eng.zip"
MULTIPLIERS = DATA / "ab_multipliers" / "tbf-alberta-economic-multipliers-2022.xlsx"
LFS = DATA / "statcan_lfs"
