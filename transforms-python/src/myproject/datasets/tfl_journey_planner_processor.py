"""TfL Journey Planner - multi-modal public transport routes from hubs to incidents."""
from transforms.api import transform, Input, Output, lightweight
import requests
import logging
import polars as pl
from datetime import datetime, timezone
import time

logger = logging.getLogger(__name__)

TFL_JOURNEY_URL = "https://api.tfl.gov.uk/Journey/JourneyResults/{from_loc}/to/{to_loc}"

# Key West London hub coordinates (hardcoded to avoid marking conflict)
WEST_LONDON_HUBS = [
    ("Acton Central", 51.508716, -0.262971),
    ("Ealing Broadway", 51.514841, -0.301752),
    ("Clapham Junction", 51.464187, -0.170221),
    ("Hammersmith", 51.4927, -0.2246),
    ("Shepherd's Bush", 51.5046, -0.2187),
    ("Brentford", 51.487547, -0.309651),
    ("Chiswick", 51.481137, -0.267835),
    ("Richmond", 51.4613, -0.3013),
]


@lightweight()
@transform(
    incidents=Input("ri.foundry.main.dataset.0fceecd4-5c54-461c-a67f-a0fc07d03dbc"),
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/tfl_journey_plans"),
)
def compute(incidents, output):
    """Calculate public transport journeys from hubs to active incidents."""
    polled_at = datetime.now(timezone.utc).isoformat()
    incidents_df = incidents.polars()

    active_incidents = incidents_df.filter(
        pl.col("latitude").is_not_null() & pl.col("longitude").is_not_null()
    ).head(10)

    if active_incidents.height == 0:
        logger.warning("No incidents with coordinates for journey planning")
        empty = pl.DataFrame({
            "journey_id": pl.Series([], dtype=pl.Utf8),
            "origin_name": pl.Series([], dtype=pl.Utf8),
            "destination_id": pl.Series([], dtype=pl.Utf8),
            "duration_minutes": pl.Series([], dtype=pl.Int64),
            "modes_used": pl.Series([], dtype=pl.Utf8),
            "legs_summary": pl.Series([], dtype=pl.Utf8),
            "polled_at": pl.Series([], dtype=pl.Utf8),
        })
        output.write_table(empty)
        return

    records = []
    api_calls = 0
    max_calls = 40

    for hub_name, hub_lat, hub_lng in WEST_LONDON_HUBS:
        for inc_row in active_incidents.iter_rows(named=True):
            if api_calls >= max_calls:
                break

            inc_id = inc_row["incident_id"]
            inc_lat = inc_row["latitude"]
            inc_lng = inc_row["longitude"]

            from_loc = f"{hub_lat},{hub_lng}"
            to_loc = f"{inc_lat},{inc_lng}"
            url = TFL_JOURNEY_URL.format(from_loc=from_loc, to_loc=to_loc)

            try:
                resp = requests.get(url, params={"mode": "tube,bus,overground,dlr,walking"}, timeout=15)
                resp.raise_for_status()
                data = resp.json()
                api_calls += 1
                time.sleep(0.5)

                journeys = data.get("journeys", [])
                if journeys:
                    journey = journeys[0]
                    legs = journey.get("legs", [])
                    modes = ", ".join(set(leg.get("mode", {}).get("name", "") for leg in legs))
                    legs_summary = " > ".join(
                        f"{leg.get('mode', {}).get('name', '')}({leg.get('duration', 0)}min)"
                        for leg in legs
                    )
                    records.append({
                        "journey_id": f"{hub_name}_to_{inc_id}",
                        "origin_name": hub_name,
                        "destination_id": inc_id,
                        "duration_minutes": journey.get("duration", 0),
                        "modes_used": modes,
                        "legs_summary": legs_summary,
                        "polled_at": polled_at,
                    })
            except Exception as e:
                logger.warning(f"Journey planner failed: {e}")
                continue

        if api_calls >= max_calls:
            break

    logger.info(f"Planned {len(records)} journeys using {api_calls} API calls")

    if records:
        df = pl.DataFrame(records)
    else:
        df = pl.DataFrame({
            "journey_id": pl.Series([], dtype=pl.Utf8),
            "origin_name": pl.Series([], dtype=pl.Utf8),
            "destination_id": pl.Series([], dtype=pl.Utf8),
            "duration_minutes": pl.Series([], dtype=pl.Int64),
            "modes_used": pl.Series([], dtype=pl.Utf8),
            "legs_summary": pl.Series([], dtype=pl.Utf8),
            "polled_at": pl.Series([], dtype=pl.Utf8),
        })
    output.write_table(df)
