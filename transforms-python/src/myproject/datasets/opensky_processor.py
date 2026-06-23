from transforms.api import transform, Output
from pyspark.sql import Row
from pyspark.sql.types import StructType, StructField, StringType, DoubleType
from datetime import datetime, timezone
import requests
import logging

logger = logging.getLogger(__name__)

AIRCRAFT_SCHEMA = StructType([
    StructField("unit_id", StringType(), True),
    StructField("vehicle_type", StringType(), True),
    StructField("latitude", DoubleType(), True),
    StructField("longitude", DoubleType(), True),
    StructField("status", StringType(), True),
    StructField("timestamp", StringType(), True)
])

@transform(
    aircraft_telemetry_out=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/datasets/opensky_processor")
)
def compute(ctx, aircraft_telemetry_out):
    """
    Ingests live aircraft telemetry from OpenSky Network API using anonymous access.
    
    Anonymous limitations:
    - 400 API credits per day
    - 10-second time resolution
    - Only current state vectors (no historical data)
    """
    spark_session = ctx.spark_session
    
    try:
        session = requests.Session()
        session.headers.update({
            "User-Agent": "Foundry-OpenSky-Integration/1.0"
        })
        
        api_url = "https://opensky-network.org/api/states/all"
        
        logger.info("Fetching aircraft state vectors (anonymous access)...")
        
        response = session.get(
            api_url,
            timeout=(15, 45)  # (connect timeout, read timeout)
        )
        
        # Handle rate limiting
        if response.status_code == 429:
            retry_after = response.headers.get("X-Rate-Limit-Retry-After-Seconds", "Unknown")
            logger.warning(f"Rate limit exceeded. Retry after: {retry_after}s")
            aircraft_telemetry_out.write_dataframe(
                spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
            )
            return
        
        response.raise_for_status()
        
        # Log API credit usage
        remaining = response.headers.get("X-Rate-Limit-Remaining", "Unknown")
        limit = response.headers.get("X-Rate-Limit-Limit", "400")
        logger.info(f"✓ Anonymous API Credits: {remaining}/{limit} remaining")
        
        data = response.json()
        states = data.get("states", [])
        
        if not states:
            logger.warning("OpenSky API returned empty states array")
            aircraft_telemetry_out.write_dataframe(
                spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
            )
            return
        
        logger.info(f"✓ Retrieved {len(states)} aircraft state vectors")
        
    except requests.exceptions.Timeout as e:
        logger.error(f"Request timeout: {str(e)}")
        aircraft_telemetry_out.write_dataframe(
            spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
        )
        return
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP error: {e.response.status_code} - {e.response.text[:500]}")
        aircraft_telemetry_out.write_dataframe(
            spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
        )
        return
    except Exception as e:
        logger.error(f"Unexpected error: {type(e).__name__}: {str(e)}")
        aircraft_telemetry_out.write_dataframe(
            spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
        )
        return
    
    # Parse state vectors
    parsed_records = []
    current_time = datetime.now(timezone.utc).isoformat(timespec='seconds')
    
    for state in states:
        if len(state) < 9:
            continue
        
        icao24 = state[0]
        longitude = state[5]
        latitude = state[6]
        on_ground = state[8]
        
        # Skip records with null coordinates
        if latitude is None or longitude is None:
            continue
        
        # Determine flight status
        if on_ground is True:
            status = "GROUNDED"
        elif on_ground is False:
            status = "AIRBORNE"
        else:
            status = "UNKNOWN"
        
        parsed_records.append(Row(
            unit_id=str(icao24) if icao24 else None,
            vehicle_type="AIRCRAFT",
            latitude=float(latitude),
            longitude=float(longitude),
            status=status,
            timestamp=current_time
        ))
    
    # Write output
    if parsed_records:
        output_df = spark_session.createDataFrame(parsed_records, AIRCRAFT_SCHEMA)
        logger.info(f"✓ Successfully processed {len(parsed_records)} aircraft records")
    else:
        logger.warning("No valid aircraft records after filtering")
        output_df = spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
    
    aircraft_telemetry_out.write_dataframe(output_df)