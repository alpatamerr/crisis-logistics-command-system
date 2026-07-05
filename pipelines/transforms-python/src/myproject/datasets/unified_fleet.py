"""Unified Fleet - merges airlabs aircraft + TfL bikepoints."""
from transforms.api import transform, Input, Output, lightweight
import polars as pl


@lightweight()
@transform(
    airlabs=Input("ri.foundry.main.dataset.380832ab-a9ed-47f7-a5a9-c9df05e43938"),
    bikepoints=Input("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/tfl_bikepoints"),
    buses=Input("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/tfl_vehicle_positions"),
    trains=Input("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/tfl_train_positions"),
    output=Output("ri.foundry.main.dataset.a774feec-e2a6-4f7e-8d14-279efe3f34ac"),
)
def compute(airlabs, bikepoints, buses, trains, output):
    """Merge aircraft, bikepoint, and bus data into unified fleet view."""
    # Read airlabs aircraft data
    aircraft_df = airlabs.polars()
    aircraft_cols = aircraft_df.select([
        pl.col("unit_id"),
        pl.col("vehicle_type"),
        pl.col("latitude"),
        pl.col("longitude"),
        pl.col("status"),
        pl.col("timestamp").alias("last_seen_at"),
    ])

    # Read bikepoints data
    bikes_df = bikepoints.polars()
    bikes_cols = bikes_df.select([
        pl.col("unit_id"),
        pl.col("vehicle_type"),
        pl.col("latitude"),
        pl.col("longitude"),
        pl.col("status"),
        pl.col("last_seen_at"),
    ])

    # Read TfL bus positions
    buses_df = buses.polars()
    if buses_df.height > 0:
        buses_cols = buses_df.select([
            pl.col("unit_id"),
            pl.col("vehicle_type"),
            pl.col("latitude"),
            pl.col("longitude"),
            pl.col("status"),
            pl.col("last_seen_at"),
        ])
    else:
        buses_cols = pl.DataFrame({
            "unit_id": pl.Series([], dtype=pl.Utf8),
            "vehicle_type": pl.Series([], dtype=pl.Utf8),
            "latitude": pl.Series([], dtype=pl.Float64),
            "longitude": pl.Series([], dtype=pl.Float64),
            "status": pl.Series([], dtype=pl.Utf8),
            "last_seen_at": pl.Series([], dtype=pl.Utf8),
        })

    # Read train positions
    trains_df = trains.polars()
    if trains_df.height > 0:
        trains_cols = trains_df.select([
            pl.col("unit_id"),
            pl.col("vehicle_type"),
            pl.col("latitude"),
            pl.col("longitude"),
            pl.lit("active").alias("status"),
            pl.col("last_seen_at"),
        ])
    else:
        trains_cols = pl.DataFrame({
            "unit_id": pl.Series([], dtype=pl.Utf8),
            "vehicle_type": pl.Series([], dtype=pl.Utf8),
            "latitude": pl.Series([], dtype=pl.Float64),
            "longitude": pl.Series([], dtype=pl.Float64),
            "status": pl.Series([], dtype=pl.Utf8),
            "last_seen_at": pl.Series([], dtype=pl.Utf8),
        })

    # Union all sources
    unified = pl.concat([aircraft_cols, bikes_cols, buses_cols, trains_cols], how="vertical_relaxed")

    # Filter to West London bounding box
    unified = unified.filter(
        (pl.col("latitude") >= 51.38) & (pl.col("latitude") <= 51.63) &
        (pl.col("longitude") >= -0.51) & (pl.col("longitude") <= -0.17)
    )

    # Deduplicate on unit_id — keep latest position per unit
    unified = unified.sort("last_seen_at", descending=True)
    unified = unified.unique(subset=["unit_id"], keep="first")

    # Add geohash for Map widget
    unified = unified.with_columns(
        pl.struct([pl.col("latitude"), pl.col("longitude")])
        .map_elements(
            lambda s: _geohash(s["latitude"], s["longitude"]),
            return_dtype=pl.Utf8,
        )
        .alias("geohash")
    )

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
