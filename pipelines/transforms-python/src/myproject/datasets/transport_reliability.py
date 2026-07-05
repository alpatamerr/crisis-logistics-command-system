"""Transport Reliability Scoring — PySpark analytics for area-level disruption patterns.

Computes reliability metrics for geographic zones and incident types:
- Incident frequency per geohash grid cell (hotspot detection)
- Type-level frequency analysis (which categories are most common)
- Severity-weighted disruption scoring per area
- Weekly trend comparison (this week vs previous week)

Uses PySpark Window functions and aggregations for large-scale spatial analytics.
"""
from transforms.api import transform_df, Input, Output
from pyspark.sql import functions as F
from pyspark.sql.window import Window


@transform_df(
    Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/transport_reliability"),
    raw_incidents=Input("ri.foundry.main.dataset.26801c50-1ffa-46d5-be54-c9c6d3a47066"),
)
def compute(raw_incidents):
    """Compute area reliability scores and hotspot detection using PySpark."""

    # Severity weights for scoring (lower = worse)
    severity_weights = {
        "Severe": 4,
        "Serious": 3,
        "Moderate": 2,
        "Minimal": 1,
    }

    # Extract date and create geohash grid (simplified: round to 2 decimal places = ~1km grid)
    df = (
        raw_incidents
        .withColumn("incident_date", F.to_date(F.col("polled_at")))
        .withColumn("incident_week", F.weekofyear(F.col("polled_at")))
        .withColumn("incident_year", F.year(F.col("polled_at")))
        .withColumn("grid_lat", F.round(F.col("latitude"), 2))
        .withColumn("grid_lng", F.round(F.col("longitude"), 2))
        .withColumn("grid_cell", F.concat_ws(",", F.col("grid_lat"), F.col("grid_lng")))
        .dropDuplicates(["incident_id", "incident_date"])
    )

    # Map severity to numeric weight
    severity_map_expr = F.coalesce(
        *[F.when(F.col("severity_level") == k, F.lit(v)) for k, v in severity_weights.items()],
        F.lit(1)
    )
    df = df.withColumn("severity_weight", severity_map_expr)

    # === HOTSPOT DETECTION: incidents per grid cell ===
    hotspots = (
        df
        .groupBy("grid_cell", "grid_lat", "grid_lng")
        .agg(
            F.count("*").alias("total_incidents"),
            F.sum("severity_weight").alias("weighted_severity_score"),
            F.countDistinct("type").alias("incident_type_diversity"),
            F.countDistinct("incident_date").alias("active_days"),
            F.min("incident_date").alias("first_incident_date"),
            F.max("incident_date").alias("last_incident_date"),
        )
    )

    # Rank hotspots by severity-weighted score
    hotspot_window = Window.orderBy(F.col("weighted_severity_score").desc())
    hotspots = hotspots.withColumn("hotspot_rank", F.row_number().over(hotspot_window))

    # === TYPE FREQUENCY: which incident types dominate ===
    type_frequency = (
        df
        .groupBy("type")
        .agg(
            F.count("*").alias("type_total_count"),
            F.avg("severity_weight").alias("avg_severity_weight"),
            F.countDistinct("grid_cell").alias("affected_grid_cells"),
        )
        .withColumn(
            "type_rank",
            F.row_number().over(Window.orderBy(F.col("type_total_count").desc()))
        )
    )

    # === WEEKLY COMPARISON: trend detection ===
    weekly_counts = (
        df
        .groupBy("incident_year", "incident_week")
        .agg(
            F.count("*").alias("weekly_incident_count"),
            F.sum("severity_weight").alias("weekly_severity_score"),
        )
        .orderBy("incident_year", "incident_week")
    )

    # Compute week-over-week change using lag window
    week_window = Window.orderBy("incident_year", "incident_week")
    weekly_with_trend = (
        weekly_counts
        .withColumn("prev_week_count", F.lag("weekly_incident_count", 1).over(week_window))
        .withColumn(
            "wow_change_pct",
            F.when(
                F.col("prev_week_count") > 0,
                F.round(
                    (F.col("weekly_incident_count") - F.col("prev_week_count"))
                    / F.col("prev_week_count") * 100,
                    1
                )
            ).otherwise(F.lit(None))
        )
    )

    # Return hotspot analysis (primary output)
    result = (
        hotspots
        .withColumn("analysis_type", F.lit("hotspot"))
        .withColumn("analysis_generated_at", F.current_timestamp())
        .orderBy("hotspot_rank")
    )

    return result
