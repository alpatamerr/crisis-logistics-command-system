"""
TfL Stations Processor — fetches real London transport stations from the TfL Unified API.

Replaces the mocked 'locations' dataset with genuine station/stop data.
Uses the StopPoint API to retrieve Metro, Rail, and Bus Coach stations.
"""
from transforms.api import transform, Output, lightweight, incremental
from transforms.external.systems import external_systems, Source
import requests
import logging

logger = logging.getLogger(__name__)

TFL_SOURCE_RID = "ri.magritte..source.acf9fdf5-72dd-43fa-a501-2b418215791c"

# TfL StopPoint types - fetched individually to avoid API timeout
STOP_TYPES = ["NaptanMetroStation", "NaptanRailStation", "NaptanBusCoachStation", "NaptanFerryPort"]
TFL_BASE_URL = "https://api.tfl.gov.uk/StopPoint/Type"

# West London bounding box (Hammersmith, Ealing, Hounslow, Hillingdon, Richmond, Brent, Kensington)
WEST_LONDON_LAT_MIN = 51.41
WEST_LONDON_LAT_MAX = 51.56
WEST_LONDON_LON_MIN = -0.50
WEST_LONDON_LON_MAX = -0.15


@incremental(semantic_version=3)
@external_systems(source=Source(TFL_SOURCE_RID))
@lightweight
@transform(
    output=Output("ri.foundry.main.dataset.4bc28207-5239-4f47-99f5-805da54d8e89"),
)
def compute(output, source, ctx):
    """Fetch real TfL stations and output as validated logistics hubs."""
    import polars as pl

    import time

    stations_data = []
    for stop_type in STOP_TYPES:
        url = f"{TFL_BASE_URL}/{stop_type}"
        logger.info(f"Fetching TfL {stop_type} from: {url}")
        try:
            response = requests.get(url, timeout=90)
            response.raise_for_status()
            data = response.json()
            if isinstance(data, list):
                stations_data.extend(data)
                logger.info(f"  Got {len(data)} {stop_type} stations")
            time.sleep(1)  # rate limit
        except Exception as e:
            logger.warning(f"  Failed for {stop_type}: {str(e)}, skipping")
            continue

    if not stations_data:
        logger.error("No stations returned from any TfL API call, aborting")
        ctx.abort_job()
        return

    rows = []
    for station in stations_data:
        naptan_id = station.get("naptanId") or station.get("id")
        if not naptan_id:
            continue

        lat = station.get("lat")
        lon = station.get("lon")

        # Filter to West London only
        if lat is None or lon is None:
            continue
        if not (WEST_LONDON_LAT_MIN <= lat <= WEST_LONDON_LAT_MAX and WEST_LONDON_LON_MIN <= lon <= WEST_LONDON_LON_MAX):
            continue

        name = station.get("commonName", "Unknown Station")
        stop_type = station.get("stopType", "Unknown")

        # Map TfL stop types to logistics categories
        category_map = {
            "NaptanMetroStation": "METRO_STATION",
            "NaptanRailStation": "RAIL_STATION",
            "NaptanBusCoachStation": "BUS_STATION",
            "NaptanFerryPort": "FERRY_PORT",
        }
        category = category_map.get(stop_type, "TRANSPORT_HUB")

        rows.append({
            "location_id": naptan_id,
            "name": name,
            "type": category,
            "capacity_count": None,
            "current_population": None,
            "latitude": lat,
            "longitude": lon,
            "lat": lat,
            "lng": lon,
            "hub_name": name,
        })

    logger.info(f"Processed {len(rows)} valid TfL stations")

    if not rows:
        logger.warning("No stations returned from TfL API, aborting")
        ctx.abort_job()
        return

    df = pl.DataFrame(rows, schema={
        "location_id": pl.Utf8,
        "name": pl.Utf8,
        "type": pl.Utf8,
        "capacity_count": pl.Int32,
        "current_population": pl.Int32,
        "latitude": pl.Float64,
        "longitude": pl.Float64,
        "lat": pl.Float64,
        "lng": pl.Float64,
        "hub_name": pl.Utf8,
    })

    output.write_table(df)
    logger.info(f"Written {len(rows)} real TfL stations to validated_logistics_hubs")
