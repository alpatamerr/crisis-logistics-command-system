from transforms.api import transform, Output
from transforms.external.systems import external_systems, Source, ResolvedSource
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

@external_systems(source=Source("ri.magritte..source.4d9c8591-4c74-46a9-b3f6-cc55aa1f9208"))
@transform(
    aircraft_telemetry_out=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/datasets/opensky_processor")
)
def compute(ctx, aircraft_telemetry_out, source: ResolvedSource):
    spark_session = ctx.spark_session
    
    # Retrieve OAuth2 credentials from Foundry Data Connection
    client_id = source.get_secret("additionalSecretOauthClientId")
    client_secret = source.get_secret("additionalSecretOauthClientSecret")
    
    try:
        # Step 1: Obtain OAuth2 access token via OpenID Connect
        token_url = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
        
        token_response = requests.post(
            token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15
        )
        
        if token_response.status_code != 200:
            logger.error(f"Auth failed! Status: {token_response.status_code}, Response: {token_response.text}")
            token_response.raise_for_status()
            
        access_token = token_response.json()["access_token"]
        
        # Step 2: Fetch aircraft telemetry using the Bearer token
        url = "https://opensky-network.org/api/states/all"
        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15
        )
        response.raise_for_status()
        data = response.json()
        logger.info(f"DEBUG: Response keys: {list(data.keys())}")
        states = data.get("states", [])
        logger.info(f"DEBUG: 'states' found: {states is not None}, count: {len(states) if states else 0}")
        states = data.get("states", [])
        
    except Exception as e:
        logger.error(f"Critical failure hitting OpenSky Network: {str(e)}")
        # Graceful Fail-Safe
        aircraft_telemetry_out.write_dataframe(spark_session.createDataFrame([], AIRCRAFT_SCHEMA))
        return

    # Process records
    parsed_records = []
    current_time = datetime.now(timezone.utc).isoformat(timespec='seconds')
    
    for state in states:
        if len(state) < 7: continue
            
        icao24, lon, lat, on_ground = state[0], state[5], state[6], state[8]
        
        parsed_records.append(Row(
            unit_id=str(icao24) if icao24 else None,
            vehicle_type="AIRCRAFT",
            latitude=float(lat) if lat is not None else None,
            longitude=float(lon) if lon is not None else None,
            status="GROUNDED" if on_ground is True else ("AIRBORNE" if on_ground is False else "UNKNOWN"),
            timestamp=current_time
        ))
    
    # Final write
    output_df = spark_session.createDataFrame(parsed_records, AIRCRAFT_SCHEMA) if parsed_records else spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
    aircraft_telemetry_out.write_dataframe(output_df)