from transforms.api import transform, Output
from transforms.external.systems import external_systems, Source, ResolvedSource
from pyspark.sql import Row
from pyspark.sql.types import StructType, StructField, StringType, DoubleType
from datetime import datetime, timezone
import requests
import logging
import time
import random

logger = logging.getLogger(__name__)

AIRCRAFT_SCHEMA = StructType([
    StructField("unit_id", StringType(), True),
    StructField("vehicle_type", StringType(), True),
    StructField("latitude", DoubleType(), True),
    StructField("longitude", DoubleType(), True),
    StructField("status", StringType(), True),
    StructField("timestamp", StringType(), True)
])

@external_systems(source=Source("ri.magritte..source.4d9c8591-4c74-46a9-b3f6-cc55aa1f9208"))
@transform(
    aircraft_telemetry_out=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/datasets/opensky_processor")
)
def compute(ctx, aircraft_telemetry_out, source: ResolvedSource):
    spark_session = ctx.spark_session

    username = source.get_secret("additionalSecretOauthClientId")
    password = source.get_secret("additionalSecretOauthClientSecret")
    
    try:
        url = "https://opensky-network.org/api/states/all"
        
        time.sleep(random.uniform(1.0, 3.0))
        
        # PURE REQUESTS. Foundry arayüzünü ve proxy'sini tamamen bypass ediyoruz.
        response = requests.get(
            url,
            auth=(username, password),
            timeout=15
        )

        if response.status_code == 429:
            retry_after = int(response.headers.get("Retry-After", 60))
            logger.warning(f"429 Limit hit! Waiting {retry_after}s...")
            time.sleep(retry_after + 1)
            response = requests.get(url, auth=(username, password), timeout=15)

        response.raise_for_status()

        remaining = response.headers.get("X-Rate-Limit-Remaining", "Unknown")
        logger.info(f"==== REMAINING REAL OPENSKY CREDITS: {remaining} ====")

        data = response.json()
        states = data.get("states", [])

    except Exception as e:
        # Hatanın tam tipini yazdırıyoruz ki ne olduğunu bilelim
        logger.error(f"Critical failure hitting OpenSky Network: {type(e).__name__} - {str(e)}")
        aircraft_telemetry_out.write_dataframe(spark_session.createDataFrame([], AIRCRAFT_SCHEMA))
        return

    parsed_records = []
    current_time = datetime.now(timezone.utc).isoformat(timespec='seconds')

    for state in states:
        if len(state) < 7:
            continue

        icao24, lon, lat, on_ground = state[0], state[5], state[6], state[8]

        parsed_records.append(Row(
            unit_id=str(icao24) if icao24 else None,
            vehicle_type="AIRCRAFT",
            latitude=float(lat) if lat is not None else None,
            longitude=float(lon) if lon is not None else None,
            status="GROUNDED" if on_ground is True else ("AIRBORNE" if on_ground is False else "UNKNOWN"),
            timestamp=current_time
        ))

    if parsed_records:
        output_df = spark_session.createDataFrame(parsed_records, AIRCRAFT_SCHEMA)
    else:
        output_df = spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
        
    aircraft_telemetry_out.write_dataframe(output_df)