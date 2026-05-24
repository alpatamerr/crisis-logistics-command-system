from transforms.api import transform, Input, Output
from pyspark.sql import functions as F

@transform(
    output_df=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/derived_routes"),
    routes_in=Input("/Atamer Systems-976c6b/Crisis Logistics Command System/01_raw_data/routes"),
    locations_in=Input("/Atamer Systems-976c6b/Crisis Logistics Command System/01_raw_data/locations"),
    incidents_in=Input("/Atamer Systems-976c6b/Crisis Logistics Command System/01_raw_data/incidents")
)
def compute_route_blocks(output_df, routes_in, locations_in, incidents_in):
    routes = routes_in.dataframe()
    locations = locations_in.dataframe()
    # Only pull active incidents (where resolved_at is blank!)
    incidents = incidents_in.dataframe().filter(F.col("resolved_at").isNull() | (F.col("resolved_at") == ""))

    # Bring coordinates onto the routes table for both origin and destination
    loc_coords = locations.select("location_id", "latitude", "longitude")
    
    routes_with_geo = routes \
        .join(loc_coords.withColumnRenamed("latitude", "orig_lat").withColumnRenamed("longitude", "orig_lon"), 
              routes.origin_location_id == loc_coords.location_id, "inner") \
        .drop("location_id") \
        .join(loc_coords.withColumnRenamed("latitude", "dest_lat").withColumnRenamed("longitude", "dest_lon"), 
              routes.destination_location_id == loc_coords.location_id, "inner") \
        .drop("location_id")

    # Cross-join routes with active incidents to calculate spatial intersections
    combined = routes_with_geo.crossJoin(incidents)

    # Approximate km distance from route endpoints to incident center
    combined = combined.withColumn(
        "dist_orig_to_inc",
        F.sqrt(((F.col("orig_lat") - F.col("latitude")) * 111.0)**2 + ((F.col("orig_lon") - F.col("longitude")) * 69.0)**2)
    ).withColumn(
        "dist_dest_to_inc",
        F.sqrt(((F.col("dest_lat") - F.col("latitude")) * 111.0)**2 + ((F.col("dest_lon") - F.col("longitude")) * 69.0)**2)
    )

    # If any endpoint falls within an active incident's radius, alter road status
    combined = combined.withColumn(
        "computed_status",
        F.when(
            ((F.col("dist_orig_to_inc") <= F.col("impact_radius_km")) | (F.col("dist_dest_to_inc") <= F.col("impact_radius_km"))) & (F.col("severity_level") >= 4),
            "BLOCKED"
        ).when(
            ((F.col("dist_orig_to_inc") <= F.col("impact_radius_km")) | (F.col("dist_dest_to_inc") <= F.col("impact_radius_km"))) & (F.col("severity_level") < 4),
            "CONGESTED"
        ).otherwise("OPEN")
    )

    # Group back to unique routes, choosing the worst status if multiple incidents touch a route
    final_routes = combined.groupBy(
        "route_id", "origin_location_id", "destination_location_id", "distance_km", "base_travel_time_mins"
    ).agg(
        F.min(
            F.when(F.col("computed_status") == "BLOCKED", 1)
            .when(F.col("computed_status") == "CONGESTED", 2)
            .otherwise(3)
        ).alias("status_rank")
    ).withColumn(
        "status",
        F.when(F.col("status_rank") == 1, "BLOCKED")
        .when(F.col("status_rank") == 2, "CONGESTED")
        .otherwise("OPEN")
    ).drop("status_rank")

    output_df.write_dataframe(final_routes)