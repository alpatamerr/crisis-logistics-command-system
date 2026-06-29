"""TfL BikePoints Processor - fetches real-time bike dock data."""
from transforms.api import transform, Output, lightweight, incremental
from transforms.external.systems import external_systems, Source
import requests
import pandas as pd
from datetime import datetime, timezone


@incremental(semantic_version=2)
@lightweight()
@external_systems(source=Source("ri.magritte..source.acf9fdf5-72dd-43fa-a501-2b418215791c"))
@transform(
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/tfl_bikepoints"),
)
def compute(source, output):
    """Fetch all TfL BikePoint docks with real-time availability."""
    url = "https://api.tfl.gov.uk/BikePoint"
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    bikepoints = response.json()

    # West London bounding box
    WEST_LONDON_LAT_MIN = 51.41
    WEST_LONDON_LAT_MAX = 51.56
    WEST_LONDON_LON_MIN = -0.50
    WEST_LONDON_LON_MAX = -0.15

    now = datetime.now(timezone.utc).isoformat()
    records = []

    for bp in bikepoints:
        # Filter to West London only
        bp_lat = bp.get("lat", 0.0)
        bp_lon = bp.get("lon", 0.0)
        if not (WEST_LONDON_LAT_MIN <= bp_lat <= WEST_LONDON_LAT_MAX and WEST_LONDON_LON_MIN <= bp_lon <= WEST_LONDON_LON_MAX):
            continue
        # Extract bike availability from additionalProperties
        bikes_available = 0
        docks_available = 0
        for prop in bp.get("additionalProperties", []):
            if prop.get("key") == "NbBikes":
                bikes_available = int(prop.get("value", 0))
            elif prop.get("key") == "NbEmptyDocks":
                docks_available = int(prop.get("value", 0))

        records.append({
            "unit_id": f"BIKE_{bp['id']}",
            "vehicle_type": "BIKE_DOCK",
            "name": bp.get("commonName", ""),
            "latitude": bp.get("lat", 0.0),
            "longitude": bp.get("lon", 0.0),
            "status": "OPERATIONAL" if bikes_available > 0 else "EMPTY",
            "bikes_available": bikes_available,
            "docks_available": docks_available,
            "last_seen_at": now,
        })

    df = pd.DataFrame(records)
    output.write_table(df)
