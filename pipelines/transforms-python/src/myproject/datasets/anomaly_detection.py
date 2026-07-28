"""Anomaly Detection — PySpark statistical anomaly detection on incident data.

Uses Z-score analysis to identify days with abnormal incident counts.
A day is flagged as anomalous if its incident count exceeds 2 standard deviations
from the rolling 14-day mean.
"""
from transforms.api import transform_df, Input, Output
from pyspark.sql import functions as F
from pyspark.sql.window import Window


@transform_df(
    Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/anomaly_detection"),
    raw_incidents=Input("ri.foundry.main.dataset.26801c50-1ffa-46d5-be54-c9c6d3a47066"),
)
def compute(raw_incidents):
    # Daily totals
    daily = (
        raw_incidents
        .filter(F.col("polled_at").isNotNull())
        .withColumn("incident_date", F.to_date(F.col("polled_at")))
        .groupBy("incident_date")
        .agg(
            F.count("*").alias("daily_count"),
            F.countDistinct("incident_id").alias("unique_incidents"),
            F.sum(F.when(F.col("severity_level") == "Severe", 1).otherwise(0)).alias("severe_count"),
        )
    )

    # 14-day rolling window for mean and stddev
    window_14d = Window.orderBy("incident_date").rowsBetween(-13, 0)

    result = (
        daily
        .withColumn("rolling_mean", F.avg("daily_count").over(window_14d))
        .withColumn("rolling_stddev", F.stddev("daily_count").over(window_14d))
        .withColumn(
            "z_score",
            F.when(
                F.col("rolling_stddev") > 0,
                (F.col("daily_count") - F.col("rolling_mean")) / F.col("rolling_stddev")
            ).otherwise(0.0)
        )
        .withColumn(
            "is_anomaly",
            F.abs(F.col("z_score")) > 2.0
        )
        .withColumn(
            "anomaly_type",
            F.when(F.col("z_score") > 2.0, "SPIKE")
            .when(F.col("z_score") < -2.0, "DROP")
            .otherwise("NORMAL")
        )
        .withColumn("anomaly_id", F.col("incident_date").cast("string"))
        .withColumn("analysis_generated_at", F.current_timestamp())
        .orderBy(F.col("incident_date").desc())
    )

    return result
