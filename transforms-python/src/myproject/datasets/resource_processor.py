from transforms.api import transform, Input, Output
from pyspark.sql import functions as F

@transform(
    output_df=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/derived_resources"),
    resources_in=Input("/Atamer Systems-976c6b/Crisis Logistics Command System/01_raw_data/resources"),
    locations_in=Input("/Atamer Systems-976c6b/Crisis Logistics Command System/01_raw_data/locations")
)
def compute_priorities(output_df, resources_in, locations_in):
    res = resources_in.dataframe()
    loc = locations_in.dataframe()

    merged = res.join(loc, "location_id", "inner")

    # Calculate exactly how many resource units are missing
    merged = merged.withColumn(
        "resource_deficit",
        F.when(F.col("critical_threshold_units") > F.col("quantity_units"), 
               F.col("critical_threshold_units") - F.col("quantity_units")).otherwise(0)
    )

    # Compute how many hours of safety buffer are left before inventory hits zero
    merged = merged.withColumn(
        "hours_remaining",
        F.when(F.col("type") == "WAREHOUSE", 999.0)
        .otherwise(F.col("quantity_units") / (F.col("current_population") * F.col("consumption_rate_per_capita")))
    )

    # Algorithmic priority calculator (0 to 100 score)
    merged = merged.withColumn(
        "priority_score",
        F.when(F.col("type") == "WAREHOUSE", 0.0)
        .otherwise(
            F.round((F.col("resource_deficit") / F.col("critical_threshold_units") * 50) + (100.0 / F.greatest(F.lit(1.0), F.col("hours_remaining"))), 2)
        )
    )

    output_df.write_dataframe(merged.select(
        "resource_id", "location_id", "resource_type", "quantity_units", 
        "critical_threshold_units", "resource_deficit", "priority_score"
    ))