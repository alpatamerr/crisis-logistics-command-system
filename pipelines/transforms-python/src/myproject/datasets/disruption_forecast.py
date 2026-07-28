"""Disruption Forecast — PySpark pattern-based disruption prediction.

Aggregates the last 4 weeks of incident data by day_of_week × hour × grid_zone
to produce predicted disruption levels and risk scores for operational planning.
"""
from transforms.api import transform_df, Input, Output
from pyspark.sql import functions as F


DAYS_OF_WEEK = {1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday",
                5: "Friday", 6: "Saturday", 7: "Sunday"}

days_udf = F.udf(lambda d: DAYS_OF_WEEK.get(d, "Unknown"))


@transform_df(
    Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/disruption_forecast"),
    raw_incidents=Input("ri.foundry.main.dataset.26801c50-1ffa-46d5-be54-c9c6d3a47066"),
)
def compute(raw_incidents):
    # Filter to valid incidents with timestamps
    incidents = (
        raw_incidents
        .filter(F.col("polled_at").isNotNull())
        .filter(F.col("latitude").isNotNull())
        .filter(F.col("longitude").isNotNull())
        # West London bounding box (consistent with current_incidents)
        .filter(
            (F.col("latitude") >= 51.38) & (F.col("latitude") <= 51.63) &
            (F.col("longitude") >= -0.51) & (F.col("longitude") <= -0.17)
        )
    )

    # Extract time dimensions and grid zone
    with_dims = (
        incidents
        .withColumn("incident_date", F.to_date(F.col("polled_at")))
        .withColumn("day_of_week", F.dayofweek(F.col("incident_date")))  # 1=Sun..7=Sat in Spark
        .withColumn("hour_block", F.hour(F.col("polled_at")))
        .withColumn(
            "grid_zone",
            F.concat(
                F.round(F.col("latitude"), 2).cast("string"),
                F.lit(","),
                F.round(F.col("longitude"), 2).cast("string"),
            )
        )
    )

    # Remap Spark dayofweek (1=Sun) to ISO (1=Mon)
    iso_day = (
        F.when(F.col("day_of_week") == 1, 7)  # Sunday -> 7
        .otherwise(F.col("day_of_week") - 1)    # Mon=2->1, Tue=3->2, etc.
    )

    with_dims = with_dims.withColumn("day_of_week", iso_day)

    # Daily counts per day × hour × zone
    daily_counts = (
        with_dims
        .groupBy("incident_date", "day_of_week", "hour_block", "grid_zone")
        .agg(
            F.count("*").alias("incident_count"),
            F.countDistinct("incident_id").alias("unique_incidents"),
            F.sum(F.when(F.col("severity_level") == "Severe", 1).otherwise(0)).alias("severe_count"),
            F.sum(F.when(F.col("severity_level") == "Serious", 1).otherwise(0)).alias("serious_count"),
        )
    )

    # Aggregate across all dates -> averages per day_of_week × hour × zone
    forecast = (
        daily_counts
        .groupBy("day_of_week", "hour_block", "grid_zone")
        .agg(
            F.round(F.avg("incident_count"), 1).alias("avg_incident_count"),
            F.round(F.avg("severe_count"), 1).alias("avg_severe_count"),
            F.round(F.avg("serious_count"), 1).alias("avg_serious_count"),
            F.max("incident_count").alias("max_incident_count"),
            F.count("incident_date").alias("sample_days"),
        )
    )

    # Risk level classification
    result = (
        forecast
        .withColumn(
            "risk_level",
            F.when(
                (F.col("avg_severe_count") >= 1) | (F.col("avg_serious_count") >= 3), "HIGH"
            ).when(
                (F.col("avg_serious_count") >= 1) | (F.col("avg_incident_count") >= 5), "MEDIUM"
            ).otherwise("LOW")
        )
        .withColumn("day_name", days_udf(F.col("day_of_week")))
        .withColumn(
            "forecast_id",
            F.concat(
                F.col("day_of_week").cast("string"),
                F.lit("-"),
                F.lpad(F.col("hour_block").cast("string"), 2, "0"),
                F.lit("-"),
                F.col("grid_zone"),
            )
        )
        .withColumn("generated_at", F.current_timestamp())
        .select(
            "forecast_id",
            "day_of_week",
            "day_name",
            "hour_block",
            "grid_zone",
            "avg_incident_count",
            "avg_severe_count",
            "avg_serious_count",
            "max_incident_count",
            "sample_days",
            "risk_level",
            "generated_at",
        )
        .orderBy("day_of_week", "hour_block", F.desc("avg_incident_count"))
    )

    return result
