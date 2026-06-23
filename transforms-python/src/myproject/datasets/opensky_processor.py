from transforms.api import transform, Output
from transforms.external.systems import external_systems, Source, ResolvedSource
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

# Keep @external_systems - this is what gives the transform network access
# through Foundry's egress proxy. Without it, DNS resolution fails entirely.
@external_systems(source=Source("ri.magritte..source.4d9c8591-4c74-46a9-b3f6-cc55aa1f9208"))
@transform(
    aircraft_telemetry_out=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/datasets/opensky_processor")
)
def compute(ctx, aircraft_telemetry_out, source: ResolvedSource):
    """
    Ingests live aircraft telemetry from OpenSky Network API.
    Uses anonymous access (400 credits/day) via the Data Connection
    egress proxy for network routing.
    Auth endpoint (auth.opensky-network.org) is not called - anonymous only.
    """
    spark_session = ctx.spark_session

    try:
        session = requests.Session()
        session.headers.update({"User-Agent": "Foundry-OpenSky-Integration/1.0"})

        api_url = "https://opensky-network.org/api/states/all"
        logger.info("Fetching aircraft state vectors (anonymous access via egress proxy)...")

        response = session.get(
            api_url,
            timeout=(15, 45)
        )

        if response.status_code == 429:
            retry_after = response.headers.get("X-Rate-Limit-Retry-After-Seconds", "Unknown")
            logger.warning(f"Rate limit exceeded. Retry after: {retry_after}s")
            aircraft_telemetry_out.write_dataframe(
                spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
            )
            return

        response.raise_for_status()

        remaining = response.headers.get("X-Rate-Limit-Remaining", "Unknown")
        logger.info(f"OpenSky anonymous credits remaining: {remaining}/400")

        data = response.json()
        states = data.get("states", [])

        if not states:
            logger.warning("OpenSky API returned empty states array")
            aircraft_telemetry_out.write_dataframe(
                spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
            )
            return

        logger.info(f"Retrieved {len(states)} aircraft state vectors")

    except requests.exceptions.Timeout as e:
        logger.error(f"Request timed out: {str(e)}")
        aircraft_telemetry_out.write_dataframe(
            spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
        )
        return
    except requests.exceptions.ConnectionError as e:
        logger.error(
            f"Connection error - check that opensky-network.org is whitelisted "
            f"in the Data Connection egress policy: {str(e)}"
        )
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

        if latitude is None or longitude is None:
            continue

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

    if parsed_records:
        output_df = spark_session.createDataFrame(parsed_records, AIRCRAFT_SCHEMA)
        logger.info(f"Successfully processed {len(parsed_records)} aircraft records")
    else:
        logger.warning("No valid aircraft records after filtering")
        output_df = spark_session.createDataFrame([], AIRCRAFT_SCHEMA)

    aircraft_telemetry_out.write_dataframe(output_df)