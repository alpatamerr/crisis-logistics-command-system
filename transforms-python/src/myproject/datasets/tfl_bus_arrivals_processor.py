"""TfL Bus Arrivals - real-time bus arrival predictions at West London stops."""
from transforms.api import transform, Input, Output, lightweight
import requests
import logging
import polars as pl
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

TFL_ARRIVALS_URL = "https://api.tfl.gov.uk/StopPoint/{stop_id}/Arrivals"


@lightweight()
@transform(
    hubs=Input("ri.foundry.main.dataset.4bc28207-5239-4f47-99f5-805da54d8e89"),
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/tfl_bus_arrivals"),
)
def compute(hubs, output):
    """Fetch real-time bus arrivals at top West London bus/rail stations."""
    polled_at = datetime.now(timezone.utc).isoformat()
    hubs_df = hubs.polars()

    # Select top bus/rail stations (best for bus arrivals data)
    bus_stops = hubs_df.filter(
        pl.col("type").is_in(["BUS_STATION", "RAIL_STATION", "METRO_STATION"])
    ).head(20)

    records = []
    import time

    for row in bus_stops.iter_rows(named=True):
        stop_id = row["location_id"]
        stop_name = row["hub_name"]

        url = TFL_ARRIVALS_URL.format(stop_id=stop_id)
        try:
            resp = requests.get(url, timeout=15)
            resp.raise_for_status()
            arrivals = resp.json()
            time.sleep(0.5)

            for arr in arrivals:
                if arr.get("modeName") != "bus":
                    continue
                records.append({
                    "stop_id": stop_id,
                    "stop_name": stop_name,
                    "line_name": arr.get("lineName", ""),
                    "destination": arr.get("destinationName", ""),
                    "expected_arrival": arr.get("expectedArrival", ""),
                    "time_to_station_seconds": arr.get("timeToStation", 0),
                    "vehicle_id": arr.get("vehicleId", ""),
                    "direction": arr.get("direction", ""),
                    "platform_name": arr.get("platformName", ""),
                    "polled_at": polled_at,
                })
        except Exception as e:
            logger.warning(f"Bus arrivals failed for {stop_name}: {e}")
            continue

    logger.info(f"Got {len(records)} bus arrival predictions from {bus_stops.height} stops")

    if records:
        df = pl.DataFrame(records)
    else:
        df = pl.DataFrame({
            "stop_id": pl.Series([], dtype=pl.Utf8),
            "stop_name": pl.Series([], dtype=pl.Utf8),
            "line_name": pl.Series([], dtype=pl.Utf8),
            "destination": pl.Series([], dtype=pl.Utf8),
            "expected_arrival": pl.Series([], dtype=pl.Utf8),
            "time_to_station_seconds": pl.Series([], dtype=pl.Int64),
            "vehicle_id": pl.Series([], dtype=pl.Utf8),
            "direction": pl.Series([], dtype=pl.Utf8),
            "platform_name": pl.Series([], dtype=pl.Utf8),
            "polled_at": pl.Series([], dtype=pl.Utf8),
        })
    output.write_table(df)
