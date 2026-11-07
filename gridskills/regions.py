"""Geography. We report by StatCan economic region because that's a labour market,
and it's the finest level where the Labour Force Survey gives employment numbers.

AESO's own regions don't work for this. Fort Saskatchewan is in AESO's Northeast
region, but the people building things there live in Edmonton.

The planning area -> economic region mapping was done by hand from the AESO planning
map and census divisions. Where a planning area straddles a boundary it goes to the
nearest labour market, so treat edge cases as approximate.
"""
import difflib

CALGARY = "Calgary"
EDMONTON = "Edmonton"
SOUTH = "Lethbridge-Medicine Hat"
EAST_CENTRAL = "Camrose-Drumheller"
RED_DEER = "Red Deer"
NORTHWEST = "Banff-Jasper-Rocky Mountain House and Athabasca-Grande Prairie-Peace River"
NORTHEAST = "Wood Buffalo-Cold Lake"

REGIONS = [CALGARY, EDMONTON, SOUTH, EAST_CENTRAL, RED_DEER, NORTHWEST, NORTHEAST]

PLANNING_AREA_TO_REGION = {
    4: SOUTH,          # Medicine Hat
    6: CALGARY,
    13: EAST_CENTRAL,  # Lloydminster
    17: NORTHWEST,     # Rainbow Lake
    18: NORTHWEST,     # High Level
    19: NORTHWEST,     # Peace River
    20: NORTHWEST,     # Grande Prairie
    21: NORTHWEST,     # High Prairie
    22: NORTHWEST,     # Grande Cache
    23: NORTHWEST,     # Valleyview
    24: NORTHWEST,     # Fox Creek
    25: NORTHEAST,     # Fort McMurray
    26: NORTHWEST,     # Swan Hills
    27: NORTHEAST,     # Athabasca/Lac La Biche
    28: NORTHEAST,     # Cold Lake
    29: NORTHWEST,     # Hinton/Edson
    30: EDMONTON,      # Drayton Valley
    31: EDMONTON,      # Wetaskiwin
    32: EAST_CENTRAL,  # Wainwright
    33: EDMONTON,      # Fort Saskatchewan
    34: RED_DEER,      # only in the load files, name unconfirmed; AESO puts it in Central
    35: RED_DEER,
    36: EAST_CENTRAL,  # Alliance/Battle River
    37: EAST_CENTRAL,  # Provost
    38: RED_DEER,      # Caroline
    39: CALGARY,       # Didsbury
    40: EDMONTON,      # Wabamun
    42: EAST_CENTRAL,  # Hanna
    43: EAST_CENTRAL,  # Sheerness
    44: CALGARY,       # Seebe
    45: CALGARY,       # Strathmore/Blackie
    46: CALGARY,       # High River
    47: SOUTH,         # Brooks
    48: SOUTH,         # Empress
    49: SOUTH,         # Stavely
    52: SOUTH,         # Vauxhall
    53: SOUTH,         # Fort Macleod
    54: SOUTH,         # Lethbridge
    55: SOUTH,         # Glenwood
    56: EAST_CENTRAL,  # Vegreville
    57: CALGARY,       # Airdrie
    60: EDMONTON,
}

# census metro and agglomeration areas we can use for occupation mix in each region
CENSUS_GEO_TO_REGION = {
    "Brooks (CA), Alta.": SOUTH,
    "Calgary (CMA), Alta.": CALGARY,
    "Camrose (CA), Alta.": EAST_CENTRAL,
    "Canmore (CA), Alta.": NORTHWEST,
    "Edmonton (CMA), Alta.": EDMONTON,
    "Grande Prairie (CA), Alta.": NORTHWEST,
    "High River (CA), Alta.": CALGARY,
    "Lacombe (CA), Alta.": RED_DEER,
    "Lethbridge (CMA), Alta.": SOUTH,
    "Lloydminster (Alberta part) (CA), Alta.": EAST_CENTRAL,
    "Medicine Hat (CA), Alta.": SOUTH,
    "Okotoks (CA), Alta.": CALGARY,
    "Red Deer (CMA), Alta.": RED_DEER,
    "Strathmore (CA), Alta.": CALGARY,
    "Sylvan Lake (CA), Alta.": RED_DEER,
    "Wetaskiwin (CA), Alta.": EDMONTON,
    "Wood Buffalo (CA), Alta.": NORTHEAST,
}

# lowercase name -> region, for the front end's "where do you live" box
PLACES = {
    "airdrie": CALGARY, "athabasca": NORTHEAST, "banff": NORTHWEST, "beaumont": EDMONTON,
    "blackie": CALGARY, "bonnyville": NORTHEAST, "brooks": SOUTH, "calgary": CALGARY,
    "camrose": EAST_CENTRAL, "canmore": NORTHWEST, "caroline": RED_DEER, "chestermere": CALGARY,
    "cochrane": CALGARY, "cold lake": NORTHEAST, "didsbury": CALGARY, "drayton valley": EDMONTON,
    "drumheller": EAST_CENTRAL, "edmonton": EDMONTON, "edson": NORTHWEST, "empress": SOUTH,
    "fort macleod": SOUTH, "fort mcmurray": NORTHEAST, "fort saskatchewan": EDMONTON, "fox creek": NORTHWEST,
    "grande cache": NORTHWEST, "grande prairie": NORTHWEST, "hanna": EAST_CENTRAL, "high level": NORTHWEST,
    "high prairie": NORTHWEST, "high river": CALGARY, "hinton": NORTHWEST, "innisfail": RED_DEER,
    "jasper": NORTHWEST, "lac la biche": NORTHEAST, "lacombe": RED_DEER, "leduc": EDMONTON,
    "lethbridge": SOUTH, "lloydminster": EAST_CENTRAL, "medicine hat": SOUTH, "okotoks": CALGARY,
    "olds": CALGARY, "peace river": NORTHWEST, "pincher creek": SOUTH, "ponoka": RED_DEER,
    "provost": EAST_CENTRAL, "rainbow lake": NORTHWEST, "red deer": RED_DEER,
    "rocky mountain house": NORTHWEST, "sherwood park": EDMONTON, "slave lake": NORTHWEST,
    "spruce grove": EDMONTON, "st. albert": EDMONTON, "st albert": EDMONTON, "stettler": EAST_CENTRAL,
    "stony plain": EDMONTON, "strathmore": CALGARY, "swan hills": NORTHWEST, "sylvan lake": RED_DEER,
    "taber": SOUTH, "valleyview": NORTHWEST, "vauxhall": SOUTH, "vegreville": EAST_CENTRAL,
    "wabamun": EDMONTON, "wainwright": EAST_CENTRAL, "wetaskiwin": EDMONTON, "whitecourt": NORTHWEST,
}


def lfs_region(geo):
    """'Calgary, Alberta' -> 'Calgary'. Returns None for the province row."""
    name = geo.replace(", Alberta", "")
    return name if name in REGIONS else None


def find_region(text):
    """Accepts a region name or a town. Raises ValueError if we can't place it."""
    key = text.strip().lower()
    for r in REGIONS:
        if r.lower() == key:
            return r
    if key in PLACES:
        return PLACES[key]
    close = difflib.get_close_matches(key, list(PLACES) + [r.lower() for r in REGIONS], n=1, cutoff=0.8)
    if close:
        return find_region(close[0])
    raise ValueError(f"don't know where {text!r} is, pass a region name or a larger nearby town")
