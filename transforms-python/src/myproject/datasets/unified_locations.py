"""
Unified Locations — merges TfL stations with Google Maps nearby infrastructure
into a single canonical locations dataset for the Location object type.

All locations are REAL data from live APIs:
- TfL stations (Metro, Rail, Bus, Ferry)
- Google Maps Places (Hospitals, Police, Fire Stations, Gas Stations)
"""
from transforms.api import transform, Input, Output, lightweight
import polars as pl
import logging

logger = logging.getLogger(__name__)


@lightweight()
@transform(
    tfl_stations=Input("ri.foundry.main.dataset.4bc28207-5239-4f47-99f5-805da54d8e89"),
    nearby_infra=Input("ri.foundry.main.dataset.0188eb65-eb2f-4b4f-8a72-c0003eb00b7b"),
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/03_ontology_backings/unified_locations"),
)
def compute(tfl_stations, nearby_infra, output):
    """Merge TfL stations and Google Maps infrastructure into unified locations."""

    # Load TfL stations
    tfl_df = tfl_stations.polars(lazy=True)
    tfl_normalized = tfl_df.select([
        pl.col("location_id"),
        pl.col("name"),
        pl.col("type").alias("category"),
        pl.col("latitude"),
        pl.col("longitude"),
        pl.lit(None).cast(pl.Utf8).alias("address"),
        pl.lit("tfl").alias("source"),
    ])

    # Load Google Maps nearby infrastructure (may be empty if API hasn't returned data yet)
    try:
        infra_df = nearby_infra.polars(lazy=True)
        infra_normalized = infra_df.select([
            pl.col("place_unique_id").alias("location_id"),
            pl.col("asset_name").alias("name"),
            pl.col("infrastructure_category").alias("category"),
            pl.col("asset_lat").alias("latitude"),
            pl.col("asset_lng").alias("longitude"),
            pl.col("asset_address").alias("address"),
            pl.lit("google_maps").alias("source"),
        ])
        unified = pl.concat([tfl_normalized, infra_normalized])
        logger.info("Merged TfL stations + Google Maps infrastructure")
    except Exception as e:
        logger.warning(f"Could not load nearby_infrastructure (may not have data yet): {e}")
        unified = tfl_normalized
        logger.info("Using TfL stations only (Google Maps data not yet available)")

    # Filter to West London bounding box (safety net)
    unified = unified.filter(
        (pl.col("latitude") >= 51.38) & (pl.col("latitude") <= 51.63) &
        (pl.col("longitude") >= -0.51) & (pl.col("longitude") <= -0.17)
    )

    # Deduplicate on location_id (keep first occurrence)
    unified = unified.unique(subset=["location_id"], keep="first")

    # Add geohash for Map widget
    unified = unified.with_columns(
        pl.struct([pl.col("latitude"), pl.col("longitude")])
        .map_elements(
            lambda s: _geohash(s["latitude"], s["longitude"]),
            return_dtype=pl.Utf8,
        )
        .alias("geohash")
    )

    logger.info("Unified locations dataset created from TfL + Google Maps")
    output.write_table(unified)


def _geohash(lat, lng, precision=12):
    if lat is None or lng is None:
        return None
    BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"
    lat_range, lng_range = [-90.0, 90.0], [-180.0, 180.0]
    bits = [16, 8, 4, 2, 1]
    geohash = []
    even = True
    bit = 0
    ch = 0
    while len(geohash) < precision:
        if even:
            mid = (lng_range[0] + lng_range[1]) / 2
            if lng > mid:
                ch |= bits[bit]
                lng_range[0] = mid
            else:
                lng_range[1] = mid
        else:
            mid = (lat_range[0] + lat_range[1]) / 2
            if lat > mid:
                ch |= bits[bit]
                lat_range[0] = mid
            else:
                lat_range[1] = mid
        even = not even
        if bit < 4:
            bit += 1
        else:
            geohash.append(BASE32[ch])
            bit = 0
            ch = 0
    return "".join(geohash)
