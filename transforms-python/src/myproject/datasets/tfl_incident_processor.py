from transforms.api import transform, Output
from transforms.external.systems import external_systems, Source
from pyspark.sql import Row
from pyspark.sql.types import StructType, StructField, StringType, DoubleType
import requests
import logging

logger = logging.getLogger(__name__)

# Enforce a strict schema to guarantee downstream pipeline stability in Pipeline Builder
INCIDENT_SCHEMA = StructType([
    StructField("incident_id", StringType(), True),
    StructField("type", StringType(), True),
    StructField("severity_level", StringType(), True),
    StructField("description", StringType(), True),
    StructField("latitude", DoubleType(), True),
    StructField("longitude", DoubleType(), True)
])

# Re-use your existing secure network egress configuration
@external_systems(source=Source("ri.magritte..source.0049ef11-1810-4389-96bb-de55ac0f528f"))
@transform(
    live_incidents_out=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/raw_live_incidents")
)
# JUST ADD ', source' AT THE END OF THE ARGUMENTS HERE:
def fetch_tfl_live_data(ctx, live_incidents_out, source):
    """
    Ingests live traffic incidents and road hazards directly from the TfL Unified API.
    Parses complex nested GeoJSON structures into a standardized tabular Spark DataFrame.
    """
    url = "https://api.tfl.gov.uk/Road/All/Disruption"
    spark_session = ctx.spark_session
    
    try:
        logger.info("Initiating live telemetry pull from TfL API...")
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        disruptions = response.json()
        logger.info(f"Successfully retrieved {len(disruptions)} active road events.")
    except Exception as e:
        logger.error(f"Critical egress network failure hitting TfL: {str(e)}")
        # Graceful Fail-Safe: Write an empty dataframe matching schema to prevent breaking downstream builds
        empty_df = spark_session.createDataFrame([], INCIDENT_SCHEMA)
        live_incidents_out.write_dataframe(empty_df)
        return

    parsed_records = []
    
    for item in disruptions:
        # Extract base strings defensively using .get() to avoid key errors
        incident_id = item.get("id")
        category = item.get("category")
        severity = item.get("severity")
        comments = item.get("comments")
        
        # Enterprise Parsing: TfL returns geography as a standard GeoJSON Point object.
        # CRITICAL: Per RFC 7946, GeoJSON structures coordinates as [Longitude, Latitude]
        geo = item.get("geography", {})
        coords = geo.get("coordinates", [])
        
        lat = None
        lng = None
        
        if isinstance(coords, list) and len(coords) == 2:
            lng = float(coords[0])  # Longitude is always index 0
            lat = float(coords[1])  # Latitude is always index 1
            
        parsed_records.append(Row(
            incident_id=incident_id,
            type=category,
            severity_level=severity,
            description=comments,
            latitude=lat,
            longitude=lng
        ))
        
    # Construct final Spark DataFrame
    if parsed_records:
        output_df = spark_session.createDataFrame(parsed_records, INCIDENT_SCHEMA)
    else:
        logger.warn("TfL endpoint returned an empty disruption payload.")
        output_df = spark_session.createDataFrame([], INCIDENT_SCHEMA)
        
    live_incidents_out.write_dataframe(output_df)