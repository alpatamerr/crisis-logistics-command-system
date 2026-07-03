"""Google Distance Matrix - travel time matrix from West London hubs to active incidents.

Implements caching via previous output to avoid redundant API calls:
- Reads previous output to identify existing hub-incident travel time pairs
- Only calculates times for NEW pairs not already cached
- Prunes stale entries for resolved incidents
- Hard limit of 500 API elements per run to control costs
"""
from transforms.api import transform, Input, Output, lightweight, incremental
from transforms.external.systems import external_systems, Source
import logging
import polars as pl

logger = logging.getLogger(__name__)

MAPS_SOURCE = Source("ri.magritte..source.0049ef11-1810-4389-96bb-de55ac0f528f")

# Hard limit on API elements per run (each origin-destination pair = 1 element)
HARD_ELEMENT_LIMIT = 500

# Schema for reading previous output (all columns nullable for safety)
OUTPUT_SCHEMA = {
    "hub_id": pl.Utf8,
    "hub_name": pl.Utf8,
    "incident_id": pl.Utf8,
    "travel_time_seconds": pl.Int64,
    "travel_time_text": pl.Utf8,
    "distance_meters": pl.Int64,
    "distance_text": pl.Utf8,
}


def _empty_df():
    """Return an empty DataFrame with the expected schema."""
    return pl.DataFrame({k: pl.Series([], dtype=v) for k, v in OUTPUT_SCHEMA.items()})


@incremental(snapshot_inputs=["hubs", "incidents"])
@lightweight()
@external_systems(source=MAPS_SOURCE)
@transform(
    hubs=Input("ri.foundry.main.dataset.4bc28207-5239-4f47-99f5-805da54d8e89"),
    incidents=Input("ri.foundry.main.dataset.26801c50-1ffa-46d5-be54-c9c6d3a47066"),
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/travel_time_matrix"),
)
def compute(ctx, hubs, incidents, output, source):
    """Build a travel time matrix from logistics hubs to incident sites with caching."""
    output.set_mode("replace")

    # --- 1. Read previous output as cache ---
    try:
        cached_df = output.polars("previous")
        logger.info(f"Cache loaded: {cached_df.height} existing travel time entries")
    except Exception:
        cached_df = _empty_df()
        logger.info("No previous cache found — first run")

    # --- 2. Read current hubs and incidents ---
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
        output.write_table(_empty_df())
        return

    # --- 3. Determine which pairs are already cached ---
    active_incident_ids = set(active_incidents["incident_id"].to_list())
    hub_ids = set(major_hubs["location_id"].to_list())

    # Prune stale cache entries (incidents no longer active or hubs removed)
    if cached_df.height > 0:
        valid_cached = cached_df.filter(
            pl.col("incident_id").is_in(list(active_incident_ids)) &
            pl.col("hub_id").is_in(list(hub_ids))
        )
        stale_count = cached_df.height - valid_cached.height
        if stale_count > 0:
            logger.info(f"Pruned {stale_count} stale cache entries")
    else:
        valid_cached = _empty_df()

    # Build set of already-cached pairs
    cached_pairs = set()
    if valid_cached.height > 0:
        for row in valid_cached.select(["hub_id", "incident_id"]).iter_rows():
            cached_pairs.add((row[0], row[1]))

    # Identify pairs that need calculation
    hub_rows = list(major_hubs.iter_rows(named=True))
    inc_rows = list(active_incidents.iter_rows(named=True))

    needed_pairs = []
    for hub_row in hub_rows:
        for inc_row in inc_rows:
            pair = (hub_row["location_id"], inc_row["incident_id"])
            if pair not in cached_pairs:
                needed_pairs.append((hub_row, inc_row))

    logger.info(
        f"Cache: {len(cached_pairs)} pairs | "
        f"New pairs to calculate: {len(needed_pairs)} | "
        f"Hard limit: {HARD_ELEMENT_LIMIT}"
    )

    if not needed_pairs:
        logger.info("All pairs cached — no API calls needed")
        output.write_table(valid_cached)
        return

    # --- 4. Calculate new pairs with hard limit ---
    if len(needed_pairs) > HARD_ELEMENT_LIMIT:
        logger.warning(
            f"Needed pairs ({len(needed_pairs)}) exceed hard limit ({HARD_ELEMENT_LIMIT}). "
            f"Processing only first {HARD_ELEMENT_LIMIT}."
        )
        needed_pairs = needed_pairs[:HARD_ELEMENT_LIMIT]

    conn = source.get_https_connection()
    client = conn.get_client()
    base_url = conn.url
    api_key = source.get_secret("additionalSecretGoogleMapsApiKey")

    # Group needed pairs by hub for efficient batching
    from collections import defaultdict
    hub_to_incidents = defaultdict(list)
    for hub_row, inc_row in needed_pairs:
        hub_to_incidents[hub_row["location_id"]].append((hub_row, inc_row))

    new_results = []
    total_elements = 0

    for hub_id, pairs in hub_to_incidents.items():
        if total_elements >= HARD_ELEMENT_LIMIT:
            logger.warning("Hard element limit reached — stopping API calls")
            break

        hub_row = pairs[0][0]
        origin = f"{hub_row['lat']},{hub_row['lng']}"

        # Batch destinations (API limit: 25 destinations per request)
        batch_size = 10
        incident_rows = [p[1] for p in pairs]

        for i in range(0, len(incident_rows), batch_size):
            if total_elements >= HARD_ELEMENT_LIMIT:
                break

            batch = incident_rows[i:i + batch_size]
            destinations = "|".join(
                f"{d['latitude']},{d['longitude']}" for d in batch
            )

            try:
                resp = client.get(
                    base_url + "/maps/api/distancematrix/json",
                    params={
                        "origins": origin,
                        "destinations": destinations,
                        "mode": "driving",
                        "departure_time": "now",
                        "key": api_key,
                    },
                    timeout=20,
                )
                resp.raise_for_status()
                data = resp.json()
                total_elements += len(batch)

                if data.get("status") != "OK":
                    logger.warning(f"Distance Matrix API: {data.get('status')}")
                    continue

                rows = data.get("rows", [])
                if rows:
                    elements = rows[0].get("elements", [])
                    for dest_idx, elem in enumerate(elements):
                        if elem.get("status") != "OK":
                            continue
                        new_results.append({
                            "hub_id": hub_id,
                            "hub_name": hub_row["hub_name"],
                            "incident_id": batch[dest_idx]["incident_id"],
                            "travel_time_seconds": elem["duration"]["value"],
                            "travel_time_text": elem["duration"]["text"],
                            "distance_meters": elem["distance"]["value"],
                            "distance_text": elem["distance"]["text"],
                        })
            except Exception as e:
                logger.warning(f"Distance Matrix batch failed for hub {hub_id}: {e}")
                continue

    logger.info(
        f"Calculated {len(new_results)} new travel time entries "
        f"using {total_elements} API elements"
    )

    # --- 5. Combine cached + new results and write ---
    if new_results:
        new_df = pl.DataFrame(new_results)
        combined = pl.concat([valid_cached, new_df], how="vertical_relaxed")
    else:
        combined = valid_cached

    # Deduplicate (prefer new results over stale cache)
    combined = combined.unique(subset=["hub_id", "incident_id"], keep="last")

    # Add primary key column for object type backing
    combined = combined.with_columns(
        (pl.col("hub_id") + "___" + pl.col("incident_id")).alias("pair_id")
    )

    output.write_table(combined)
    logger.info(f"Written {combined.height} total travel time entries")
