"""Incident Trend Analysis — PySpark analytics over historical incident data.

Reads the incremental raw_live_incidents dataset and computes:
- Daily incident counts by severity level
- 7-day rolling averages
- Cumulative incident trends

Uses PySpark Window functions for time-series analytics at scale.
"""
from transforms.api import transform_df, Input, Output
from pyspark.sql import functions as F
from pyspark.sql.window import Window


@transform_df(
    Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/incident_trend_analysis"),
    raw_incidents=Input("ri.foundry.main.dataset.26801c50-1ffa-46d5-be54-c9c6d3a47066"),
)
def compute(raw_incidents):
    """Compute daily incident trends with rolling averages using PySpark."""

    # Extract date from polled_at timestamp
    df = raw_incidents.withColumn("incident_date", F.to_date(F.col("polled_at")))

    # Deduplicate: one row per incident per day (avoid counting same incident multiple times)
    df_deduped = df.dropDuplicates(["incident_id", "incident_date"])

    # Daily counts by severity
    daily_counts = (
        df_deduped
        .groupBy("incident_date", "severity_level")
        .agg(
            F.count("*").alias("incident_count"),
            F.countDistinct("type").alias("distinct_types"),
        )
    )

    # Total daily counts (all severities)
    daily_total = (
        df_deduped
        .groupBy("incident_date")
        .agg(F.count("*").alias("total_daily_count"))
    )

    # 7-day rolling average using Window function
    window_7d = (
        Window
        .partitionBy("severity_level")
        .orderBy(F.col("incident_date").cast("long"))
        .rangeBetween(-6 * 86400, 0)  # 6 days before + current day = 7 day window
    )

    daily_with_rolling = (
        daily_counts
        .withColumn(
            "rolling_7d_avg",
            F.round(F.avg("incident_count").over(window_7d), 2)
        )
    )

    # Join total daily count
    result = (
        daily_with_rolling
        .join(daily_total, on="incident_date", how="left")
        .withColumn("analysis_generated_at", F.current_timestamp())
        .withColumn(
            "trend_id",
            F.concat_ws("_", F.col("incident_date").cast("string"), F.col("severity_level"))
        )
        .orderBy("incident_date", "severity_level")
    )

    return result
