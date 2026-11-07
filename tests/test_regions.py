import pytest

from gridskills.regions import (
    CENSUS_GEO_TO_REGION,
    PLANNING_AREA_TO_REGION,
    REGIONS,
    find_region,
    lfs_region,
)


def test_every_mapping_lands_on_a_real_region():
    assert set(PLANNING_AREA_TO_REGION.values()) <= set(REGIONS)
    assert set(CENSUS_GEO_TO_REGION.values()) <= set(REGIONS)


def test_every_region_has_census_coverage():
    assert set(CENSUS_GEO_TO_REGION.values()) == set(REGIONS)


def test_find_region_by_town_and_name():
    assert find_region("Medicine Hat") == "Lethbridge-Medicine Hat"
    assert find_region("edmonton") == "Edmonton"
    assert find_region("Fort McMurry") == "Wood Buffalo-Cold Lake"


def test_find_region_unknown():
    with pytest.raises(ValueError):
        find_region("Atlantis")


def test_economic_regions_cover_every_model_region():
    from gridskills.regions import ECONOMIC_REGIONS
    assert {r for _, r in ECONOMIC_REGIONS.values()} == set(REGIONS)


def test_economic_region_id_splits_the_merged_northwest():
    from gridskills.regions import economic_region_id
    assert economic_region_id("canmore") == "4840"
    assert economic_region_id("grande prairie") == "4870"
    assert economic_region_id("athabasca") == "4870"
    assert economic_region_id("calgary") == "4830"


def test_lfs_region():
    assert lfs_region("Red Deer, Alberta") == "Red Deer"
    assert lfs_region("Alberta") is None
