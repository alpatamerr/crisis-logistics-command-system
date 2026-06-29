"""Google Directions - calculates driving routes between key West London hubs and active incidents."""
from transforms.api import transform, Input, Output, lightweight
from transforms.external.systems import external_systems, Source
import logging
import polars as pl

logger = logging.getLogger(__name__)

# Google Maps source for API access
MAPS_SOURCE = Source("ri.magritte..source.0049ef11-1810-4389-96bb-de55ac0f528f")


@lightweight()
@external_systems(source=MAPS_SOURCE)
@transform(
    hubs=Input("ri.foundry.main.dataset.4bc28207-5239-4f47-99f5-805da54d8e89"),
    incidents=Input("ri.foundry.main.dataset.26801c50-1ffa-46d5-be54-c9c6d3a47066"),
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/route_directions"),
)
def compute(hubs, incidents, output, source):
    """Calculate driving routes from major hubs to active incidents."""
    conn = source.get_https_connection()
    client = conn.get_client()
    base_url = conn.url

    hubs_df = hubs.polars()
    incidents_df = incidents.polars()

    # Select top hub stations (rail/bus stations are best logistics hubs)
    major_hubs = hubs_df.filter(
        pl.col("type").is_in(["RAIL_STATION", "BUS_STATION"])
    ).head(15)

    # Get incidents with valid coordinates
    active_incidents = incidents_df.filter(
        pl.col("latitude").is_not_null() & pl.col("longitude").is_not_null()
    ).head(20)

    if major_hubs.height == 0 or active_incidents.height == 0:
        logger.warning("No hubs or incidents to route between")
        empty = pl.DataFrame({
            "route_id": pl.Series([], dtype=pl.Utf8),
            "origin_id": pl.Series([], dtype=pl.Utf8),
            "origin_name": pl.Series([], dtype=pl.Utf8),
            "destination_id": pl.Series([], dtype=pl.Utf8),
            "distance_meters": pl.Series([], dtype=pl.Int64),
            "duration_seconds": pl.Series([], dtype=pl.Int64),
            "duration_text": pl.Series([], dtype=pl.Utf8),
            "distance_text": pl.Series([], dtype=pl.Utf8),
            "polyline": pl.Series([], dtype=pl.Utf8),
        })
        output.write_table(empty)
        return

    routes = []
    api_calls = 0
    max_api_calls = 50  # rate limit

    for hub_row in major_hubs.iter_rows(named=True):
        hub_id = hub_row["location_id"]
        hub_name = hub_row["hub_name"]
        hub_lat = hub_row["lat"]
        hub_lng = hub_row["lng"]

        for inc_row in active_incidents.iter_rows(named=True):
            if api_calls >= max_api_calls:
                break

            inc_id = inc_row["incident_id"]
            inc_lat = inc_row["latitude"]
            inc_lng = inc_row["longitude"]

            origin = f"{hub_lat},{hub_lng}"
            destination = f"{inc_lat},{inc_lng}"

            try:
                resp = client.get(
                    base_url + "/maps/api/directions/json",
                    params={
                        "origin": origin,
                        "destination": destination,
                        "mode": "driving",
                        "departure_time": "now",
                    },
                    timeout=15,
                )
                resp.raise_for_status()
                data = resp.json()
                api_calls += 1

                if data.get("status") == "OK" and data.get("routes"):
                    route = data["routes"][0]
                    leg = route["legs"][0]
                    routes.append({
                        "route_id": f"{hub_id}_to_{inc_id}",
                        "origin_id": hub_id,
                        "origin_name": hub_name,
                        "destination_id": inc_id,
                        "distance_meters": leg["distance"]["value"],
                        "duration_seconds": leg["duration"]["value"],
                        "duration_text": leg["duration"]["text"],
                        "distance_text": leg["distance"]["text"],
                        "polyline": route.get("overview_polyline", {}).get("points", ""),
                    })
            except Exception as e:
                logger.warning(f"Directions API failed for {hub_id}->{inc_id}: {e}")
                continue

        if api_calls >= max_api_calls:
            break

    logger.info(f"Calculated {len(routes)} routes using {api_calls} API calls")

    if routes:
        df = pl.DataFrame(routes)
    else:
        df = pl.DataFrame({
            "route_id": pl.Series([], dtype=pl.Utf8),
            "origin_id": pl.Series([], dtype=pl.Utf8),
            "origin_name": pl.Series([], dtype=pl.Utf8),
            "destination_id": pl.Series([], dtype=pl.Utf8),
            "distance_meters": pl.Series([], dtype=pl.Int64),
            "duration_seconds": pl.Series([], dtype=pl.Int64),
            "duration_text": pl.Series([], dtype=pl.Utf8),
            "distance_text": pl.Series([], dtype=pl.Utf8),
            "polyline": pl.Series([], dtype=pl.Utf8),
        })
    output.write_table(df)
