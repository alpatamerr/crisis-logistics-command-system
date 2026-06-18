from transforms.api import transform, Output
from transforms.external.systems import external_systems, Source
from pyspark.sql import Row
from pyspark.sql.types import StructType, StructField, StringType, DoubleType
from datetime import datetime, timezone
import requests
import logging

logger = logging.getLogger(__name__)

# Define strict schema to guarantee downstream pipeline stability
AIRCRAFT_SCHEMA = StructType([
    StructField("unit_id", StringType(), True),
    StructField("vehicle_type", StringType(), True),
    StructField("latitude", DoubleType(), True),
    StructField("longitude", DoubleType(), True),
    StructField("status", StringType(), True),
    StructField("timestamp", StringType(), True)
])

# Configure to use approved OpenSky Network API source credentials
@external_systems(source=Source("ri.magritte..source.4d9c8591-4c74-46a9-b3f6-cc55aa1f9208"))
@transform(
    aircraft_telemetry_out=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/datasets/opensky_processor")
)
def compute(ctx, aircraft_telemetry_out, source):
    """
    Ingests live aircraft telemetry from the OpenSky Network API.
    Parses the nested JSON array structure into a standardized tabular Spark DataFrame.
    Filters out records with invalid geolocation data.
    """
    url = "https://opensky-network.org/api/states/all"
    spark_session = ctx.spark_session
    
    try:
        logger.info("Initiating live aircraft telemetry pull from OpenSky Network API...")
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        data = response.json()
        
        # OpenSky API returns data in format: {"time": timestamp, "states": [[array of values]]}
        states = data.get("states", [])
        
        if not states:
            logger.warn("OpenSky API returned an empty states payload.")
            empty_df = spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
            aircraft_telemetry_out.write_dataframe(empty_df)
            return
            
        logger.info(f"Successfully retrieved {len(states)} active aircraft tracks.")
        
    except Exception as e:
        logger.error(f"Critical network failure hitting OpenSky Network API: {str(e)}")
        # Graceful Fail-Safe: Write an empty dataframe matching schema to prevent breaking downstream builds
        empty_df = spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
        aircraft_telemetry_out.write_dataframe(empty_df)
        return

    parsed_records = []
    current_time = datetime.now(timezone.utc).isoformat(timespec='seconds')
    
    # OpenSky API states array format (indices):
    # [0]=icao24, [1]=callsign, [2]=origin_country, [3]=time_position, [4]=last_contact,
    # [5]=longitude, [6]=latitude, [7]=baro_altitude, [8]=on_ground, [9]=velocity, [10]=true_track,
    # [11]=vertical_rate, [12]=sensors, [13]=geo_altitude, [14]=squawk, [15]=spi, [16]=position_source
    
    for state in states:
        # Extract fields defensively to avoid index errors
        if len(state) < 7:
            continue
            
        icao24 = state[0]  # Unique aircraft identifier
        latitude = state[6]
        longitude = state[5]
        on_ground = state[8] if len(state) > 8 else None
        
        # Determine operational status
        if on_ground is True:
            status = "GROUNDED"
        elif on_ground is False:
            status = "AIRBORNE"
        else:
            status = "UNKNOWN"
        
        # Apply null coordinate filter - skip records with invalid geolocation
        if latitude is None or longitude is None:
            continue
            
        parsed_records.append(Row(
            unit_id=str(icao24) if icao24 else None,
            vehicle_type="AIRCRAFT",
            latitude=float(latitude),
            longitude=float(longitude),
            status=status,
            timestamp=current_time
        ))
    
    # Construct final Spark DataFrame
    if parsed_records:
        output_df = spark_session.createDataFrame(parsed_records, AIRCRAFT_SCHEMA)
        logger.info(f"Successfully processed {len(parsed_records)} aircraft records with valid coordinates.")
    else:
        logger.warn("No valid aircraft records found after filtering null coordinates.")
        output_df = spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
    
    aircraft_telemetry_out.write_dataframe(output_df)