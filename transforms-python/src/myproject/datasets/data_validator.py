from transforms.api import transform, Input, Output
from pyspark.sql import functions as F
from pyspark.sql.types import DoubleType

@transform(
    validated_hubs=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/validated_logistics_hubs"),
    raw_hubs=Input("ri.foundry.main.dataset.89addc0e-00be-4277-86d8-d5ba5a9f9f39")
)
def validate_incoming_data(raw_hubs, validated_hubs):
    df = raw_hubs.dataframe()

    # Map the production enterprise columns to standardized internal names and cast to Double
    df_typed = df.withColumn("lat", F.col("latitude").cast(DoubleType())) \
                 .withColumn("lng", F.col("longitude").cast(DoubleType())) \
                 .withColumn("hub_name", F.col("name"))

    # Global boundary verification check
    valid_coords_condition = (
        F.col("lat").isNotNull() & 
        F.col("lng").isNotNull() & 
        (F.col("lat") >= -90.0) & (F.col("lat") <= 90.0) & 
        (F.col("lng") >= -180.0) & (F.col("lng") <= 180.0)
    )

    clean_df = df_typed.filter(valid_coords_condition)
    validated_hubs.write_dataframe(clean_df)