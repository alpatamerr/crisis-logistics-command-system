from transforms.api import transform, incremental, Output
from transforms.external.systems import external_systems, Source
import polars as pl
import requests
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# West London bounding box
WEST_LONDON_LAT_MIN = 51.38
WEST_LONDON_LAT_MAX = 51.63
WEST_LONDON_LON_MIN = -0.51
WEST_LONDON_LON_MAX = -0.17


@incremental(semantic_version=1)
@external_systems(source=Source("ri.magritte..source.acf9fdf5-72dd-43fa-a501-2b418215791c"))
@transform.using(
    live_incidents_out=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/raw_live_incidents")
)
def fetch_tfl_live_data(ctx, live_incidents_out, source):
    """
    Incrementally ingests live traffic disruptions from the TfL Unified API.
    Each hourly poll appends a timestamped snapshot of active road events,
    building a historical record of disruptions over time.
    """
    url = "https://api.tfl.gov.uk/Road/All/Disruption"
    polled_at = datetime.now(timezone.utc)

    try:
        logger.info("Initiating live telemetry pull from TfL API...")
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        disruptions = response.json()
        logger.info(f"Successfully retrieved {len(disruptions)} active road events.")
    except Exception as e:
        logger.error(f"TfL API request failed: {str(e)}")
        # Abort the job so no empty transaction is committed,
        # keeping downstream datasets from going stale unnecessarily.
        ctx.abort_job()
        return

    if not disruptions:
        logger.warning("TfL endpoint returned an empty disruption payload. Aborting to avoid empty append.")
        ctx.abort_job()
        return

    # Parse the JSON response into structured records
    parsed_records = []
    for item in disruptions:
        # TfL returns geography as GeoJSON Point: coordinates = [longitude, latitude] per RFC 7946
        geo = item.get("geography") or {}
        coords = geo.get("coordinates", [])

        lat = None
        lng = None
        if isinstance(coords, list) and len(coords) == 2:
            lng = float(coords[0])
            lat = float(coords[1])

        # Filter to West London only
        if lat is not None and lng is not None:
            if not (WEST_LONDON_LAT_MIN <= lat <= WEST_LONDON_LAT_MAX and WEST_LONDON_LON_MIN <= lng <= WEST_LONDON_LON_MAX):
                continue

        parsed_records.append({
            "incident_id": item.get("id"),
            "type": item.get("category"),
            "severity_level": item.get("severity"),
            "description": item.get("comments"),
            "latitude": lat,
            "longitude": lng,
            "polled_at": polled_at,
        })

    df = pl.DataFrame(
        parsed_records,
        schema={
            "incident_id": pl.Utf8,
            "type": pl.Utf8,
            "severity_level": pl.Utf8,
            "description": pl.Utf8,
            "latitude": pl.Float64,
            "longitude": pl.Float64,
            "polled_at": pl.Datetime("us", time_zone="UTC"),
        },
    )

    live_incidents_out.write_table(df)
