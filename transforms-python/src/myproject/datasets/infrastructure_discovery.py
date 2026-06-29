from transforms.api import transform, Input, Output
from transforms.external.systems import external_systems, Source, ResolvedSource
import logging

logger = logging.getLogger(__name__)

# Enterprise Array: Add or remove any Google API category string here to scale dynamically
TARGET_INFRASTRUCTURE = [
    "hospital",
    "fire_station",
    "police",
    "gas_station"
]


@external_systems(source=Source("ri.magritte..source.0049ef11-1810-4389-96bb-de55ac0f528f"))
@transform(
    discovered_infrastructure=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/nearby_infrastructure"),
    validated_hubs=Input("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/validated_logistics_hubs")
)
def discover_nearby_infrastructure(validated_hubs, discovered_infrastructure, source: ResolvedSource):
    # Get API key from source secrets and use HTTPS client for requests
    conn = source.get_https_connection()
    client = conn.get_client()
    base_url = conn.url
    api_key = source.get_secret("additionalSecretGoogleMapsApiKey")

    # Grab the incoming PySpark DataFrame
    hubs_dataframe = validated_hubs.dataframe()
    df = hubs_dataframe.toPandas()

    assets_discovered = []

    if df.empty:
        logger.info("Zero new tracking coordinates detected. API pipeline idle.")
        return

    for index, row in df.iterrows():
        hub_name = row.get('hub_name', f"Zone_{index}")
        lat, lng = row['lat'], row['lng']

        for infra_type in TARGET_INFRASTRUCTURE:
            try:
                response = client.get(
                    base_url + "/maps/api/place/nearbysearch/json",
                    params={
                        "location": f"{lat},{lng}",
                        "radius": 5000,
                        "type": infra_type,
                        "key": api_key,
                    },
                    timeout=10,
                )
                data = response.json()
                status = data.get("status")

                if status == "OK":
                    for place in data.get("results", []):
                        assets_discovered.append({
                            "logistics_hub_origin": hub_name,
                            "infrastructure_category": infra_type,
                            "asset_name": place.get("name"),
                            "place_unique_id": place.get("place_id"),
                            "asset_lat": place.get("geometry", {}).get("location", {}).get("lat"),
                            "asset_lng": place.get("geometry", {}).get("location", {}).get("lng"),
                            "asset_address": place.get("vicinity")
                        })
            except Exception as e:
                logger.error(f"Network call dropped for {hub_name}: {str(e)}")
                continue

    from pyspark.sql.types import StructType, StructField, StringType, DoubleType

    schema = StructType([
        StructField("logistics_hub_origin", StringType(), True),
        StructField("infrastructure_category", StringType(), True),
        StructField("asset_name", StringType(), True),
        StructField("place_unique_id", StringType(), True),
        StructField("asset_lat", DoubleType(), True),
        StructField("asset_lng", DoubleType(), True),
        StructField("asset_address", StringType(), True),
    ])

    spark = hubs_dataframe.sparkSession
    if assets_discovered:
        spark_df = spark.createDataFrame(assets_discovered, schema=schema)
    else:
        logger.warning("No infrastructure discovered — writing empty schema")
        spark_df = spark.createDataFrame([], schema=schema)

    discovered_infrastructure.write_dataframe(spark_df)
