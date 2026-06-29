"""Unified Fleet - merges airlabs aircraft + TfL bikepoints."""
from transforms.api import transform, Input, Output, lightweight
import polars as pl


@lightweight()
@transform(
    airlabs=Input("ri.foundry.main.dataset.380832ab-a9ed-47f7-a5a9-c9df05e43938"),
    bikepoints=Input("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/tfl_bikepoints"),
    output=Output("ri.foundry.main.dataset.a774feec-e2a6-4f7e-8d14-279efe3f34ac"),
)
def compute(airlabs, bikepoints, output):
    """Merge aircraft and bikepoint data into unified fleet view."""
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

    # Union both sources
    unified = pl.concat([aircraft_cols, bikes_cols], how="vertical_relaxed")

    # Deduplicate on unit_id — keep latest position per unit
    unified = unified.sort("last_seen_at", descending=True)
    unified = unified.unique(subset=["unit_id"], keep="first")

    output.write_table(unified)
