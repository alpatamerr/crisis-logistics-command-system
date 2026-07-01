"""Google Places API - discovers nearby infrastructure (hospitals, fire stations, police, gas stations).

Implements caching via previous output to avoid redundant API calls:
- Infrastructure locations are mostly STATIC (hospitals don't move!)
- Only calls API for NEW hubs not already in the cache
- Keeps all previously discovered infrastructure unless the hub is removed
- Hard limit of 200 API calls per run (4 types × 50 hubs max)
"""
from transforms.api import transform, Input, Output, lightweight, incremental
from transforms.external.systems import external_systems, Source
import logging
import polars as pl

logger = logging.getLogger(__name__)

MAPS_SOURCE = Source("ri.magritte..source.0049ef11-1810-4389-96bb-de55ac0f528f")

# Infrastructure categories to search for near each hub
TARGET_INFRASTRUCTURE = [
    "hospital",
    "fire_station",
    "police",
    "gas_station",
]

# Hard limit on API calls per run (each hub × type = 1 call)
HARD_CALL_LIMIT = 200

# Schema for the output
OUTPUT_SCHEMA = {
    "logistics_hub_origin": pl.Utf8,
    "infrastructure_category": pl.Utf8,
    "asset_name": pl.Utf8,
    "place_unique_id": pl.Utf8,
    "asset_lat": pl.Float64,
    "asset_lng": pl.Float64,
    "asset_address": pl.Utf8,
}


def _empty_df():
    """Return an empty DataFrame with the expected schema."""
    return pl.DataFrame({k: pl.Series([], dtype=v) for k, v in OUTPUT_SCHEMA.items()})


@incremental(snapshot_inputs=["validated_hubs"])
@lightweight()
@external_systems(source=MAPS_SOURCE)
@transform(
    validated_hubs=Input("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/validated_logistics_hubs"),
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/nearby_infrastructure"),
)
def compute(ctx, validated_hubs, output, source):
    """Discover nearby infrastructure for logistics hubs with caching."""
    output.set_mode("replace")

    # --- 1. Read previous output as cache ---
    try:
        cached_df = output.polars("previous")
        logger.info(f"Cache loaded: {cached_df.height} infrastructure entries")
    except Exception:
        cached_df = _empty_df()
        logger.info("No previous cache found — first run")

    # --- 2. Read current hubs ---
    hubs_df = validated_hubs.polars()

    if hubs_df.height == 0:
        logger.info("No hubs available — writing empty output")
        output.write_table(_empty_df())
        return

    # --- 3. Determine which hubs are already cached ---
    current_hub_names = set(hubs_df["hub_name"].to_list())

    # Prune cache entries for hubs that no longer exist
    if cached_df.height > 0:
        valid_cached = cached_df.filter(
            pl.col("logistics_hub_origin").is_in(list(current_hub_names))
        )
        stale_count = cached_df.height - valid_cached.height
        if stale_count > 0:
            logger.info(f"Pruned {stale_count} entries for removed hubs")
    else:
        valid_cached = _empty_df()

    # Build set of already-cached hub names (all 4 categories searched)
    cached_hubs_complete = set()
    if valid_cached.height > 0:
        hub_category_counts = (
            valid_cached
            .group_by("logistics_hub_origin")
            .agg(pl.col("infrastructure_category").n_unique().alias("cat_count"))
        )
        # A hub is fully cached if we've searched all 4 categories for it
        for row in hub_category_counts.filter(
            pl.col("cat_count") >= len(TARGET_INFRASTRUCTURE)
        ).iter_rows(named=True):
            cached_hubs_complete.add(row["logistics_hub_origin"])

    # Identify hubs that need API calls
    hubs_needing_search = []
    for row in hubs_df.iter_rows(named=True):
        if row["hub_name"] not in cached_hubs_complete:
            hubs_needing_search.append(row)

    logger.info(
        f"Cached hubs: {len(cached_hubs_complete)} | "
        f"New hubs to search: {len(hubs_needing_search)} | "
        f"Hard limit: {HARD_CALL_LIMIT} calls"
    )

    if not hubs_needing_search:
        logger.info("All hubs fully cached — no API calls needed")
        output.write_table(valid_cached)
        return

    # --- 4. Call Places API for new hubs only, with hard limit ---
    conn = source.get_https_connection()
    client = conn.get_client()
    base_url = conn.url
    api_key = source.get_secret("additionalSecretGoogleMapsApiKey")

    new_results = []
    api_calls = 0

    for hub_row in hubs_needing_search:
        if api_calls >= HARD_CALL_LIMIT:
            logger.warning("Hard API call limit reached — stopping")
            break

        hub_name = hub_row["hub_name"]
        lat = hub_row["lat"]
        lng = hub_row["lng"]

        for infra_type in TARGET_INFRASTRUCTURE:
            if api_calls >= HARD_CALL_LIMIT:
                break

            try:
                response = client.get(
                    base_url + "/maps/api/place/nearbysearch/json",
                    params={
                        "location": f"{lat},{lng}",
                        "radius": 5000,
                        "type": infra_type,
                        "key": api_key,
                    },
                    timeout=10,
                )
                response.raise_for_status()
                data = response.json()
                api_calls += 1

                if data.get("status") == "OK":
                    for place in data.get("results", []):
                        new_results.append({
                            "logistics_hub_origin": hub_name,
                            "infrastructure_category": infra_type,
                            "asset_name": place.get("name"),
                            "place_unique_id": place.get("place_id"),
                            "asset_lat": place.get("geometry", {}).get("location", {}).get("lat"),
                            "asset_lng": place.get("geometry", {}).get("location", {}).get("lng"),
                            "asset_address": place.get("vicinity"),
                        })
                elif data.get("status") == "ZERO_RESULTS":
                    pass  # No infrastructure of this type nearby
                else:
                    logger.warning(f"Places API: {data.get('status')} for {hub_name}/{infra_type}")
            except Exception as e:
                logger.warning(f"Places API failed for {hub_name}/{infra_type}: {e}")
                continue

    logger.info(f"Discovered {len(new_results)} new infrastructure entries using {api_calls} API calls")

    # --- 5. Combine cached + new results and write ---
    if new_results:
        new_df = pl.DataFrame(new_results)
        combined = pl.concat([valid_cached, new_df], how="vertical_relaxed")
    else:
        combined = valid_cached

    # Deduplicate by hub + place_id combination
    combined = combined.unique(subset=["logistics_hub_origin", "place_unique_id"], keep="last")

    output.write_table(combined)
    logger.info(f"Written {combined.height} total infrastructure entries")
