"""Lime E-Scooter Positions - fetches real-time scooter locations from Lime's public GBFS feed.

GBFS (General Bikeshare Feed Specification) is an open standard. No API key needed.
Filters to West London bounding box and outputs scooter positions for the unified fleet.
"""
from transforms.api import transform, Input, Output, lightweight
import logging
import polars as pl
import requests

logger = logging.getLogger(__name__)

# West London bounding box (7 boroughs per London Plan)
WEST_LONDON_LAT_MIN = 51.38
WEST_LONDON_LAT_MAX = 51.63
WEST_LONDON_LON_MIN = -0.51
WEST_LONDON_LON_MAX = -0.17

# Lime GBFS endpoints for London
LIME_GBFS_BASE = "https://data.lime.bike/api/partners/v2/gbfs/london"
FREE_BIKE_STATUS_URL = f"{LIME_GBFS_BASE}/free_bike_status.json"

OUTPUT_SCHEMA = {
    "unit_id": pl.Utf8,
    "vehicle_type": pl.Utf8,
    "latitude": pl.Float64,
    "longitude": pl.Float64,
    "last_seen_at": pl.Utf8,
    "unit_status": pl.Utf8,
}


def _empty_df():
    return pl.DataFrame({k: pl.Series([], dtype=v) for k, v in OUTPUT_SCHEMA.items()})


@lightweight()
@transform(
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/lime_scooter_positions"),
)
def compute(output):
    """Fetch real-time Lime scooter positions from GBFS feed."""
    try:
        resp = requests.get(FREE_BIKE_STATUS_URL, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.warning(f"Failed to fetch Lime GBFS feed: {e}")
        output.write_table(_empty_df())
        return

    bikes = data.get("data", {}).get("bikes", [])
    if not bikes:
        logger.warning("No scooters found in Lime GBFS feed")
        output.write_table(_empty_df())
        return

    logger.info(f"Fetched {len(bikes)} Lime vehicles from GBFS")

    records = []
    for bike in bikes:
        lat = bike.get("lat")
        lon = bike.get("lon")

        if lat is None or lon is None:
            continue

        # Filter to West London bounding box
        if not (WEST_LONDON_LAT_MIN <= lat <= WEST_LONDON_LAT_MAX and
                WEST_LONDON_LON_MIN <= lon <= WEST_LONDON_LON_MAX):
            continue

        # Determine vehicle type from GBFS data
        vehicle_type_id = bike.get("vehicle_type_id", "")
        if "scooter" in vehicle_type_id.lower():
            v_type = "SCOOTER"
        elif "bike" in vehicle_type_id.lower():
            v_type = "E_BIKE"
        else:
            v_type = "SCOOTER"  # Default for Lime

        is_disabled = bike.get("is_disabled", False)
        is_reserved = bike.get("is_reserved", False)

        if is_disabled:
            status = "DISABLED"
        elif is_reserved:
            status = "RESERVED"
        else:
            status = "AVAILABLE"

        records.append({
            "unit_id": f"lime-{bike.get('bike_id', 'unknown')}",
            "vehicle_type": v_type,
            "latitude": lat,
            "longitude": lon,
            "last_seen_at": bike.get("last_reported", ""),
            "unit_status": status,
        })

    if records:
        df = pl.DataFrame(records)
        logger.info(f"Found {df.height} Lime vehicles in West London")
    else:
        df = _empty_df()
        logger.info("No Lime vehicles found in West London bounding box")

    output.write_table(df)
