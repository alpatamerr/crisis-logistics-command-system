"""Peak Hour Heatmap — PySpark analytics for temporal disruption patterns.

Computes a cross-tabulation of incidents by hour-of-day × day-of-week,
revealing when disruptions are most likely to occur. Enables crisis
coordinators to pre-position resources during peak disruption windows.

Uses PySpark pivot and aggregation for high-performance cross-tab computation.
"""
from transforms.api import transform_df, Input, Output
from pyspark.sql import functions as F


@transform_df(
    Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/peak_hour_heatmap"),
    raw_incidents=Input("ri.foundry.main.dataset.26801c50-1ffa-46d5-be54-c9c6d3a47066"),
)
def compute(raw_incidents):
    """Compute hour × day_of_week incident frequency matrix using PySpark."""

    # Extract temporal dimensions
    df = (
        raw_incidents
        .withColumn("incident_date", F.to_date(F.col("polled_at")))
        .withColumn("hour_of_day", F.hour(F.col("polled_at")))
        .withColumn("day_of_week", F.dayofweek(F.col("polled_at")))  # 1=Sun, 7=Sat
        .withColumn("day_name", F.date_format(F.col("polled_at"), "EEEE"))
    )

    # Deduplicate: one row per incident per day
    df_deduped = df.dropDuplicates(["incident_id", "incident_date"])

    # Cross-tab: incidents per hour × day_of_week
    heatmap = (
        df_deduped
        .groupBy("hour_of_day", "day_of_week", "day_name")
        .agg(
            F.count("*").alias("incident_count"),
            F.countDistinct("incident_id").alias("unique_incidents"),
        )
        .orderBy("day_of_week", "hour_of_day")
    )

    # Also compute severity distribution per time slot
    severity_by_hour = (
        df_deduped
        .groupBy("hour_of_day", "day_of_week", "day_name", "severity_level")
        .agg(F.count("*").alias("count_by_severity"))
    )

    # Pivot: create columns for each severity level per time slot
    pivoted = (
        severity_by_hour
        .groupBy("hour_of_day", "day_of_week", "day_name")
        .pivot("severity_level")
        .agg(F.sum("count_by_severity"))
        .fillna(0)
    )

    # Join heatmap totals with severity breakdown
    result = (
        heatmap
        .join(pivoted, on=["hour_of_day", "day_of_week", "day_name"], how="left")
        .withColumn("analysis_generated_at", F.current_timestamp())
        .orderBy("day_of_week", "hour_of_day")
    )

    return result
