"""Google Distance Matrix - travel time matrix from West London hubs to active incidents."""
from transforms.api import transform, Input, Output, lightweight
from transforms.external.systems import external_systems, Source
import logging
import polars as pl

logger = logging.getLogger(__name__)

MAPS_SOURCE = Source("ri.magritte..source.0049ef11-1810-4389-96bb-de55ac0f528f")


@lightweight()
@external_systems(source=MAPS_SOURCE)
@transform(
    hubs=Input("ri.foundry.main.dataset.4bc28207-5239-4f47-99f5-805da54d8e89"),
    incidents=Input("ri.foundry.main.dataset.26801c50-1ffa-46d5-be54-c9c6d3a47066"),
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/travel_time_matrix"),
)
def compute(hubs, incidents, output, source):
    """Build a travel time matrix from logistics hubs to incident sites."""
    conn = source.get_https_connection()
    client = conn.get_client()
    base_url = conn.url
    api_key = source.get_secret("additionalSecretGoogleMapsApiKey")

    hubs_df = hubs.polars()
    incidents_df = incidents.polars()

    major_hubs = hubs_df.filter(
        pl.col("type").is_in(["RAIL_STATION", "BUS_STATION"])
    ).head(10)

    active_incidents = incidents_df.filter(
        pl.col("latitude").is_not_null() & pl.col("longitude").is_not_null()
    ).head(25)

    if major_hubs.height == 0 or active_incidents.height == 0:
        logger.warning("No hubs or incidents for distance matrix")
        empty = pl.DataFrame({
            "hub_id": pl.Series([], dtype=pl.Utf8),
            "hub_name": pl.Series([], dtype=pl.Utf8),
            "incident_id": pl.Series([], dtype=pl.Utf8),
            "travel_time_seconds": pl.Series([], dtype=pl.Int64),
            "travel_time_text": pl.Series([], dtype=pl.Utf8),
            "distance_meters": pl.Series([], dtype=pl.Int64),
            "distance_text": pl.Series([], dtype=pl.Utf8),
        })
        output.write_table(empty)
        return

    # Build origin coords string (pipe-separated for batch API)
    hub_rows = list(major_hubs.iter_rows(named=True))
    inc_rows = list(active_incidents.iter_rows(named=True))

    results = []
    # Process in batches of 10 destinations (API limit: 25 origins x 25 destinations)
    batch_size = 10
    origins = "|".join(f"{h['lat']},{h['lng']}" for h in hub_rows)

    for i in range(0, len(inc_rows), batch_size):
        batch = inc_rows[i:i + batch_size]
        destinations = "|".join(f"{d['latitude']},{d['longitude']}" for d in batch)

        try:
            resp = client.get(
                base_url + "/maps/api/distancematrix/json",
                params={
                    "origins": origins,
                    "destinations": destinations,
                    "mode": "driving",
                    "departure_time": "now",
                    "key": api_key,
                },
                timeout=20,
            )
            resp.raise_for_status()
            data = resp.json()

            if data.get("status") != "OK":
                logger.warning(f"Distance Matrix API: {data.get('status')}")
                continue

            rows = data.get("rows", [])
            for hub_idx, row in enumerate(rows):
                elements = row.get("elements", [])
                for dest_idx, elem in enumerate(elements):
                    if elem.get("status") != "OK":
                        continue
                    actual_dest_idx = i + dest_idx
                    if actual_dest_idx >= len(inc_rows):
                        continue
                    results.append({
                        "hub_id": hub_rows[hub_idx]["location_id"],
                        "hub_name": hub_rows[hub_idx]["hub_name"],
                        "incident_id": inc_rows[actual_dest_idx]["incident_id"],
                        "travel_time_seconds": elem["duration"]["value"],
                        "travel_time_text": elem["duration"]["text"],
                        "distance_meters": elem["distance"]["value"],
                        "distance_text": elem["distance"]["text"],
                    })
        except Exception as e:
            logger.warning(f"Distance Matrix batch failed: {e}")
            continue

    logger.info(f"Built {len(results)} travel time entries")

    if results:
        df = pl.DataFrame(results)
    else:
        df = pl.DataFrame({
            "hub_id": pl.Series([], dtype=pl.Utf8),
            "hub_name": pl.Series([], dtype=pl.Utf8),
            "incident_id": pl.Series([], dtype=pl.Utf8),
            "travel_time_seconds": pl.Series([], dtype=pl.Int64),
            "travel_time_text": pl.Series([], dtype=pl.Utf8),
            "distance_meters": pl.Series([], dtype=pl.Int64),
            "distance_text": pl.Series([], dtype=pl.Utf8),
        })
    output.write_table(df)
