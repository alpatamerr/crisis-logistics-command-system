"""TfL Road Status - real-time traffic conditions on major West London roads."""
from transforms.api import transform, Output, lightweight
from transforms.external.systems import external_systems, Source
import requests
import logging
import polars as pl
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Major roads serving West London
WEST_LONDON_ROADS = [
    "A4", "A40", "A406", "A316", "A3220", "A315", "A402",
    "A219", "A308", "A312", "A4020", "A4000", "A205",
]
TFL_ROAD_URL = "https://api.tfl.gov.uk/Road/{road_id}"


@lightweight()
@external_systems(
    source=Source("ri.magritte..source.acf9fdf5-72dd-43fa-a501-2b418215791c"),
)
@transform(
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/tfl_road_status"),
)
def compute(ctx, output, source):
    """Fetch live traffic status for major West London roads."""
    polled_at = datetime.now(timezone.utc).isoformat()
    records = []

    for road_id in WEST_LONDON_ROADS:
        url = TFL_ROAD_URL.format(road_id=road_id)
        try:
            resp = requests.get(url, timeout=15)
            resp.raise_for_status()
            roads = resp.json()
        except Exception as e:
            logger.warning(f"Failed to fetch road {road_id}: {e}")
            continue

        for road in roads:
            records.append({
                "road_id": road.get("id", road_id),
                "road_name": road.get("displayName", road_id),
                "status_severity": road.get("statusSeverity", "Unknown"),
                "status_description": road.get("statusSeverityDescription", ""),
                "bounds": road.get("bounds", ""),
                "envelope": road.get("envelope", ""),
                "url": road.get("url", ""),
                "polled_at": polled_at,
            })

    if not records:
        logger.error("No road status data retrieved")
        ctx.abort_job()
        return

    logger.info(f"Got status for {len(records)} road segments")
    df = pl.DataFrame(records)
    output.write_table(df)
