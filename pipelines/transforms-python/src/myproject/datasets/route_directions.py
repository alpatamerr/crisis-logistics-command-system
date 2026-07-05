"""Google Directions - calculates driving routes between key West London hubs and active incidents.

Implements caching via previous output to avoid redundant API calls:
- Reads previous output to find already-calculated routes
- Only calls the API for NEW hub-incident pairs
- Cleans up routes for resolved (no longer active) incidents
- Enforces a hard daily request limit of 500 API calls
"""
from transforms.api import transform, Input, Output, incremental, lightweight
from transforms.external.systems import external_systems, Source
import logging
import polars as pl

logger = logging.getLogger(__name__)

# Google Maps source for API access
MAPS_SOURCE = Source("ri.magritte..source.0049ef11-1810-4389-96bb-de55ac0f528f")

# Hard daily API call limit to control costs
HARD_API_LIMIT = 500

# Schema for reading previous output (all columns nullable for Foundry compatibility)
OUTPUT_SCHEMA = {
    "route_id": pl.Utf8,
    "origin_id": pl.Utf8,
    "origin_name": pl.Utf8,
    "destination_id": pl.Utf8,
    "distance_meters": pl.Int64,
    "duration_seconds": pl.Int64,
    "duration_text": pl.Utf8,
    "distance_text": pl.Utf8,
    "polyline": pl.Utf8,
}

EMPTY_DF = pl.DataFrame({col: pl.Series([], dtype=dtype) for col, dtype in OUTPUT_SCHEMA.items()})


@lightweight()
@incremental(snapshot_inputs=["hubs", "incidents"])
@external_systems(source=MAPS_SOURCE)
@transform(
    hubs=Input("ri.foundry.main.dataset.4bc28207-5239-4f47-99f5-805da54d8e89"),
    incidents=Input("ri.foundry.main.dataset.26801c50-1ffa-46d5-be54-c9c6d3a47066"),
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/route_directions"),
)
def compute(ctx, hubs, incidents, output, source):
    """Calculate driving routes from major hubs to active incidents, with caching."""
    # -------------------------------------------------------------------------
    # 1. Load current hubs and incidents
    # -------------------------------------------------------------------------
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
        output.set_mode("replace")
        output.write_table(EMPTY_DF)
        return

    # -------------------------------------------------------------------------
    # 2. Load cached routes from previous output
    # -------------------------------------------------------------------------
    try:
        cached_df = output.polars("previous", OUTPUT_SCHEMA)
        logger.info(f"Loaded {cached_df.height} cached routes from previous build")
    except Exception:
        cached_df = EMPTY_DF
        logger.info("No previous output found — starting fresh")

    # -------------------------------------------------------------------------
    # 3. Determine which cached routes are still valid
    #    A route is valid if the incident is still active
    # -------------------------------------------------------------------------
    active_incident_ids = set(active_incidents["incident_id"].to_list())
    hub_ids = set(major_hubs["location_id"].to_list())

    if cached_df.height > 0:
        valid_cached = cached_df.filter(
            pl.col("destination_id").is_in(active_incident_ids)
            & pl.col("origin_id").is_in(hub_ids)
        )
        logger.info(
            f"Keeping {valid_cached.height} valid cached routes "
            f"(pruned {cached_df.height - valid_cached.height} stale routes)"
        )
    else:
        valid_cached = EMPTY_DF

    # -------------------------------------------------------------------------
    # 4. Identify NEW pairs that need API calls
    #    Skip any hub-incident pair already in the cache
    # -------------------------------------------------------------------------
    cached_pairs = set()
    if valid_cached.height > 0:
        cached_pairs = set(
            zip(
                valid_cached["origin_id"].to_list(),
                valid_cached["destination_id"].to_list(),
            )
        )

    pairs_to_calculate = []
    for hub_row in major_hubs.iter_rows(named=True):
        for inc_row in active_incidents.iter_rows(named=True):
            pair = (hub_row["location_id"], inc_row["incident_id"])
            if pair not in cached_pairs:
                pairs_to_calculate.append((hub_row, inc_row))

    logger.info(
        f"Need to calculate {len(pairs_to_calculate)} new routes "
        f"({len(cached_pairs)} already cached)"
    )

    if not pairs_to_calculate:
        logger.info("All routes are cached — no API calls needed")
        output.set_mode("replace")
        output.write_table(valid_cached)
        return

    # -------------------------------------------------------------------------
    # 5. Call the Directions API for new pairs only (with hard limit)
    # -------------------------------------------------------------------------
    conn = source.get_https_connection()
    client = conn.get_client()
    base_url = conn.url
    api_key = source.get_secret("additionalSecretGoogleMapsApiKey")

    new_routes = []
    api_calls = 0

    for hub_row, inc_row in pairs_to_calculate:
        # ---- HARD LIMIT: stop entirely, not just break inner loop ----
        if api_calls >= HARD_API_LIMIT:
            logger.warning(
                f"HARD LIMIT of {HARD_API_LIMIT} API calls reached — "
                f"stopping. {len(pairs_to_calculate) - api_calls} pairs skipped."
            )
            break

        hub_id = hub_row["location_id"]
        hub_name = hub_row["hub_name"]
        hub_lat = hub_row["lat"]
        hub_lng = hub_row["lng"]
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
                    "key": api_key,
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            api_calls += 1

            if data.get("status") == "OK" and data.get("routes"):
                route = data["routes"][0]
                leg = route["legs"][0]
                new_routes.append({
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
            else:
                logger.warning(
                    f"API returned status={data.get('status')} for {hub_id}->{inc_id}"
                )
        except Exception as e:
            logger.warning(f"Directions API failed for {hub_id}->{inc_id}: {e}")
            continue

    logger.info(
        f"Calculated {len(new_routes)} new routes using {api_calls} API calls"
    )

    # -------------------------------------------------------------------------
    # 6. Combine cached + new routes and write as a complete snapshot
    # -------------------------------------------------------------------------
    if new_routes:
        new_df = pl.DataFrame(new_routes).cast(OUTPUT_SCHEMA)
        combined = pl.concat([valid_cached, new_df])
    else:
        combined = valid_cached

    # Deduplicate (in case of race conditions)
    combined = combined.unique(subset=["route_id"], keep="last")

    output.set_mode("replace")
    output.write_table(combined)

    logger.info(
        f"Output: {combined.height} total routes "
        f"({valid_cached.height} cached + {len(new_routes)} new)"
    )
