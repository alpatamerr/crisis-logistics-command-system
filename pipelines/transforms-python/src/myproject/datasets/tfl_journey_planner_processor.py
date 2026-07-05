"""TfL Journey Planner - multi-modal public transport routes from hubs to incidents."""
from transforms.api import transform, Output, lightweight
from transforms.external.systems import external_systems, Source
import requests
import logging
import polars as pl
from datetime import datetime, timezone
import time

logger = logging.getLogger(__name__)

TFL_JOURNEY_URL = "https://api.tfl.gov.uk/Journey/JourneyResults/{from_loc}/to/{to_loc}"

# Key West London hub coordinates
WEST_LONDON_HUBS = [
    ("Acton Central", "51.508716,-0.262971"),
    ("Ealing Broadway", "51.514841,-0.301752"),
    ("Clapham Junction", "51.464187,-0.170221"),
    ("Hammersmith", "51.4927,-0.2246"),
    ("Shepherd's Bush", "51.5046,-0.2187"),
    ("Brentford", "51.487547,-0.309651"),
    ("Chiswick", "51.481137,-0.267835"),
    ("Richmond", "51.4613,-0.3013"),
]

# Key West London incident hotspots (updated periodically)
INCIDENT_HOTSPOTS = [
    ("A4/Hammersmith Flyover", "51.4925,-0.2280"),
    ("A40/Western Avenue", "51.5275,-0.3150"),
    ("Heathrow Terminal 5", "51.4723,-0.4879"),
    ("A406/North Circular", "51.5467,-0.2800"),
    ("Kew Bridge", "51.4870,-0.2890"),
    ("Hounslow High St", "51.4684,-0.3622"),
    ("Shepherd's Bush Roundabout", "51.5044,-0.2229"),
    ("Ealing Common", "51.5102,-0.2882"),
]


@lightweight()
@external_systems(
    source=Source("ri.magritte..source.acf9fdf5-72dd-43fa-a501-2b418215791c"),
)
@transform(
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/tfl_journey_plans"),
)
def compute(ctx, output, source):
    """Calculate public transport journeys between West London hubs and key locations."""
    polled_at = datetime.now(timezone.utc).isoformat()
    records = []
    api_calls = 0
    max_calls = 40

    for hub_name, hub_coords in WEST_LONDON_HUBS:
        for dest_name, dest_coords in INCIDENT_HOTSPOTS:
            if api_calls >= max_calls:
                break

            url = TFL_JOURNEY_URL.format(from_loc=hub_coords, to_loc=dest_coords)
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
                        "journey_id": f"{hub_name}_to_{dest_name}",
                        "origin_name": hub_name,
                        "destination_name": dest_name,
                        "duration_minutes": journey.get("duration", 0),
                        "modes_used": modes,
                        "legs_summary": legs_summary,
                        "polled_at": polled_at,
                    })
            except Exception as e:
                logger.warning(f"Journey planner failed for {hub_name}->{dest_name}: {e}")
                continue

        if api_calls >= max_calls:
            break

    logger.info(f"Planned {len(records)} journeys using {api_calls} API calls")

    if records:
        df = pl.DataFrame(records)
    else:
        logger.warning("No journey plans retrieved")
        ctx.abort_job()
        return

    output.write_table(df)
