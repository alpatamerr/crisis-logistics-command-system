from transforms.api import transform, Input, Output
from pyspark.sql import functions as F

@transform(
    output_df=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/derived_resources"),
    resources_in=Input("ri.foundry.main.dataset.4f3670e9-107e-423c-a3fc-cc95da5ec382"),
    locations_in=Input("ri.foundry.main.dataset.89addc0e-00be-4277-86d8-d5ba5a9f9f39")
)
def compute_priorities(output_df, resources_in, locations_in):
    res = resources_in.dataframe()
    loc = locations_in.dataframe()

    # Null Mitigation: Default un-audited values to zero to guarantee mathematical stability
    res_clean = res.withColumn("quantity_units", F.coalesce(F.col("quantity_units"), F.lit(0))) \
                   .withColumn("critical_threshold_units", F.coalesce(F.col("critical_threshold_units"), F.lit(0))) \
                   .withColumn("consumption_rate_per_capita", F.coalesce(F.col("consumption_rate_per_capita"), F.lit(0.0)))

    # Isolate specific columns from the locations dataset to prevent column namespace overlapping
    loc_clean = loc.select("location_id", "type", "current_population")

    merged = res_clean.join(loc_clean, "location_id", "inner")

    # 1. Calculate precise logistical item deficit
    merged = merged.withColumn(
        "resource_deficit",
        F.when(F.col("critical_threshold_units") > F.col("quantity_units"), 
               F.col("critical_threshold_units") - F.col("quantity_units")).otherwise(0)
    )

    # 2. Compute safety runway hours while protecting against Division-by-Zero
    hourly_consumption = F.col("current_population") * F.col("consumption_rate_per_capita")
    
    merged = merged.withColumn(
        "hours_remaining",
        F.when((F.col("type") == "WAREHOUSE") | (hourly_consumption <= 0) | (hourly_consumption.isNull()), 999.0)
         .otherwise(F.col("quantity_units") / hourly_consumption)
    )

    # 3. Dynamic Priority Scoring Matrix (Balanced 0 - 100 metric)
    deficit_ratio = F.when(F.col("critical_threshold_units") > 0, 
                           F.col("resource_deficit") / F.col("critical_threshold_units")).otherwise(0.0)
    
    raw_priority = F.when(F.col("type") == "WAREHOUSE", 0.0) \
                    .otherwise((deficit_ratio * 50.0) + (50.0 / F.greatest(F.lit(1.0), F.col("hours_remaining"))))

    # Strict operational bounding constraint
    merged = merged.withColumn(
        "priority_score",
        F.round(F.when(raw_priority > 100.0, 100.0).when(raw_priority < 0.0, 0.0).otherwise(raw_priority), 2)
    )

    output_df.write_dataframe(merged.select(
        "resource_id", "location_id", "resource_type", "quantity_units", 
        "critical_threshold_units", "resource_deficit", "priority_score"
    ))