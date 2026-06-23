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

@external_systems(source=Source("ri.magritte..source.4d9c8591-4c74-46a9-b3f6-cc55aa1f9208"))
@transform(
    aircraft_telemetry_out=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/datasets/opensky_processor")
)
def compute(ctx, aircraft_telemetry_out, source: ResolvedSource):
    """
    Ingests live aircraft telemetry from OpenSky Network API using OAuth2.
    Per OpenSky documentation: OAuth2 client credentials flow is the only supported auth method.
    """
    spark_session = ctx.spark_session
    
    client_id = source.get_secret("additionalSecretOauthClientId")
    client_secret = source.get_secret("additionalSecretOauthClientSecret")
    
    try:
        session = requests.Session()
        
        # Step 1: Obtain OAuth2 access token
        # Per docs: https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token
        logger.info("Requesting OAuth2 access token from OpenSky Network...")
        token_url = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
        
        token_response = session.post(
            token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=45  # Increased timeout for auth endpoint
        )
        
        if token_response.status_code != 200:
            logger.error(f"OAuth2 token request failed. Status: {token_response.status_code}, Response: {token_response.text}")
            token_response.raise_for_status()
        
        token_data = token_response.json()
        access_token = token_data["access_token"]
        expires_in = token_data.get("expires_in", 1800)
        logger.info(f"Successfully obtained OAuth2 access token (expires in {expires_in}s)")
        
        # Step 2: Fetch aircraft state vectors
        logger.info("Fetching aircraft state vectors from OpenSky API...")
        api_url = "https://opensky-network.org/api/states/all"
        
        api_response = session.get(
            api_url,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=30
        )
        
        # Handle rate limiting (429 Too Many Requests)
        if api_response.status_code == 429:
            retry_after = int(api_response.headers.get("X-Rate-Limit-Retry-After-Seconds", 60))
            logger.warning(f"Rate limit exceeded. API requests retry after {retry_after} seconds")
            # Don't retry in transform - just return empty dataset
            aircraft_telemetry_out.write_dataframe(
                spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
            )
            return
        
        api_response.raise_for_status()
        
        # Log API credit usage
        remaining = api_response.headers.get("X-Rate-Limit-Remaining", "Unknown")
        limit = api_response.headers.get("X-Rate-Limit-Limit", "Unknown")
        logger.info(f"OpenSky API Credits: {remaining}/{limit} remaining")
        
        data = api_response.json()
        states = data.get("states", [])
        
        if not states:
            logger.warning("OpenSky API returned empty states array")
            aircraft_telemetry_out.write_dataframe(
                spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
            )
            return
        
        logger.info(f"Retrieved {len(states)} aircraft state vectors")
        
    except requests.exceptions.Timeout as e:
        logger.error(f"Request timeout: {str(e)}")
        aircraft_telemetry_out.write_dataframe(
            spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
        )
        return
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP error: {e.response.status_code} - {e.response.text}")
        aircraft_telemetry_out.write_dataframe(
            spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
        )
        return
    except Exception as e:
        logger.error(f"Unexpected error accessing OpenSky API: {str(e)}")
        aircraft_telemetry_out.write_dataframe(
            spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
        )
        return
    
    # Parse state vectors into records
    parsed_records = []
    current_time = datetime.now(timezone.utc).isoformat(timespec='seconds')
    
    # State vector format per OpenSky docs:
    # [0]=icao24, [5]=longitude, [6]=latitude, [8]=on_ground
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
        logger.info(f"Successfully processed {len(parsed_records)} aircraft records")
    else:
        logger.warning("No valid aircraft records after filtering")
        output_df = spark_session.createDataFrame([], AIRCRAFT_SCHEMA)
    
    aircraft_telemetry_out.write_dataframe(output_df)