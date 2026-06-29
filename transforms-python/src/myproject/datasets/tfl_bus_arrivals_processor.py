"""TfL Bus Arrivals - real-time bus arrival predictions at West London stops."""
from transforms.api import transform, Output, lightweight
from transforms.external.systems import external_systems, Source
import requests
import logging
import polars as pl
from datetime import datetime, timezone
import time

logger = logging.getLogger(__name__)

TFL_ARRIVALS_URL = "https://api.tfl.gov.uk/StopPoint/{stop_id}/Arrivals"

# Top 20 West London stations (hardcoded to avoid marking conflict with Foundry inputs)
WEST_LONDON_STOPS = [
    ("910GACTNCTL", "Acton Central"),
    ("910GACTONML", "Acton Main Line"),
    ("910GBALHAM", "Balham"),
    ("910GBARNES", "Barnes"),
    ("910GBNTFORD", "Brentford"),
    ("910GCHISWCK", "Chiswick"),
    ("910GCLPHMJ1", "Clapham Junction"),
    ("910GDRAYGRN", "Drayton Green"),
    ("910GEALINGB", "Ealing Broadway"),
    ("910GCSEAH", "Imperial Wharf"),
    ("910GCBARPAR", "Castle Bar Park"),
    ("910GBRBY", "Brondesbury"),
    ("910GBRBYPK", "Brondesbury Park"),
    ("910GCRKLWD", "Cricklewood"),
    ("910GBNSBDGE", "Barnes Bridge"),
    ("490000078E", "Hammersmith Bus Station"),
    ("490000100H", "Hounslow Bus Station"),
    ("490000067H", "Ealing Broadway"),
    ("490013407S", "Shepherd's Bush"),
    ("490005646S", "Chiswick High Road"),
]


@lightweight()
@external_systems(
    source=Source("ri.magritte..source.acf9fdf5-72dd-43fa-a501-2b418215791c"),
)
@transform(
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/tfl_bus_arrivals"),
)
def compute(ctx, output, source):
    """Fetch real-time bus arrivals at top West London stops."""
    polled_at = datetime.now(timezone.utc).isoformat()
    records = []

    for stop_id, stop_name in WEST_LONDON_STOPS:
        url = TFL_ARRIVALS_URL.format(stop_id=stop_id)
        try:
            resp = requests.get(url, timeout=15)
            resp.raise_for_status()
            arrivals = resp.json()
            time.sleep(0.3)

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
                    "polled_at": polled_at,
                })
        except Exception as e:
            logger.warning(f"Bus arrivals failed for {stop_name}: {e}")
            continue

    logger.info(f"Got {len(records)} bus arrival predictions")

    if records:
        df = pl.DataFrame(records)
    else:
        logger.warning("No bus arrivals data retrieved")
        ctx.abort_job()
        return

    output.write_table(df)
