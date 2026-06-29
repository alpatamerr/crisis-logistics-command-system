"""TfL Journey Planner - multi-modal public transport routes from hubs to incidents."""
from transforms.api import transform, Input, Output, lightweight
from transforms.external.systems import external_systems, Source
import requests
import logging
import polars as pl
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

TFL_JOURNEY_URL = "https://api.tfl.gov.uk/Journey/JourneyResults/{from_loc}/to/{to_loc}"


@lightweight()
@external_systems(
    source=Source("ri.magritte..source.acf9fdf5-72dd-43fa-a501-2b418215791c"),
)
@transform(
    hubs=Input("ri.foundry.main.dataset.4bc28207-5239-4f47-99f5-805da54d8e89"),
    incidents=Input("ri.foundry.main.dataset.26801c50-1ffa-46d5-be54-c9c6d3a47066"),
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/tfl_journey_plans"),
)
def compute(hubs, incidents, output, source):
    """Calculate public transport journeys from major hubs to active incidents."""
    polled_at = datetime.now(timezone.utc).isoformat()

    hubs_df = hubs.polars()
    incidents_df = incidents.polars()

    major_hubs = hubs_df.filter(
        pl.col("type").is_in(["RAIL_STATION", "BUS_STATION"])
    ).head(10)

    active_incidents = incidents_df.filter(
        pl.col("latitude").is_not_null() & pl.col("longitude").is_not_null()
    ).head(10)

    if major_hubs.height == 0 or active_incidents.height == 0:
        logger.warning("No hubs or incidents for journey planning")
        empty = pl.DataFrame({
            "journey_id": pl.Series([], dtype=pl.Utf8),
            "origin_name": pl.Series([], dtype=pl.Utf8),
            "destination_id": pl.Series([], dtype=pl.Utf8),
            "duration_minutes": pl.Series([], dtype=pl.Int64),
            "modes_used": pl.Series([], dtype=pl.Utf8),
            "legs_summary": pl.Series([], dtype=pl.Utf8),
            "departure_time": pl.Series([], dtype=pl.Utf8),
            "arrival_time": pl.Series([], dtype=pl.Utf8),
            "polled_at": pl.Series([], dtype=pl.Utf8),
        })
        output.write_table(empty)
        return

    import time
    records = []
    api_calls = 0
    max_calls = 50

    for hub_row in major_hubs.iter_rows(named=True):
        hub_name = hub_row["hub_name"]
        hub_lat = hub_row["lat"]
        hub_lng = hub_row["lng"]

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
                    legs_summary = " → ".join(
                        f"{leg.get('mode', {}).get('name', '')}({leg.get('duration', 0)}min)"
                        for leg in legs
                    )
                    records.append({
                        "journey_id": f"{hub_row['location_id']}_to_{inc_id}",
                        "origin_name": hub_name,
                        "destination_id": inc_id,
                        "duration_minutes": journey.get("duration", 0),
                        "modes_used": modes,
                        "legs_summary": legs_summary,
                        "departure_time": journey.get("startDateTime", ""),
                        "arrival_time": journey.get("arrivalDateTime", ""),
                        "polled_at": polled_at,
                    })
            except Exception as e:
                logger.warning(f"Journey planner failed for {hub_name}: {e}")
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
            "departure_time": pl.Series([], dtype=pl.Utf8),
            "arrival_time": pl.Series([], dtype=pl.Utf8),
            "polled_at": pl.Series([], dtype=pl.Utf8),
        })
    output.write_table(df)
