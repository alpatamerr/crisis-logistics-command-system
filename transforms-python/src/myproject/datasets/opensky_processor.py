from transforms.api import transform, Output
from transforms.external.systems import external_systems, Source, ResolvedSource
from pyspark.sql import Row
from pyspark.sql.types import StructType, StructField, StringType, DoubleType
from datetime import datetime, timezone
import requests
import time
import random

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------
AIRCRAFT_SCHEMA = StructType([
    StructField("unit_id",       StringType(), True),
    StructField("vehicle_type",  StringType(), True),
    StructField("latitude",      DoubleType(), True),
    StructField("longitude",     DoubleType(), True),
    StructField("status",        StringType(), True),
    StructField("timestamp",     StringType(), True),
])

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TOKEN_URL = (
    "https://auth.opensky-network.org"
    "/auth/realms/opensky-network/protocol/openid-connect/token"
)

# West London bounding box
# Covers: Heathrow, Hayes, Southall, Ealing, Hammersmith, Fulham, Chelsea, Kensington
BBOX = dict(lamin=51.43, lomin=-0.52, lamax=51.55, lomax=-0.10)


# ---------------------------------------------------------------------------
# Helper: fetch OAuth2 Bearer token using client credentials flow
# ---------------------------------------------------------------------------
def _get_bearer_token(client_id: str, client_secret: str, timeout: int = 15) -> str:
    """
    Exchange client_id / client_secret for an OAuth2 access token.
    Raises requests.HTTPError on failure so the caller can catch it.
    """
    response = requests.post(
        TOKEN_URL,
        data={
            "grant_type":    "client_credentials",
            "client_id":     client_id,
            "client_secret": client_secret,
        },
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()["access_token"]


# ---------------------------------------------------------------------------
# Helper: parse a single OpenSky state vector row
# ---------------------------------------------------------------------------
def _parse_state(state: list, timestamp: str) -> Row:
    if len(state) < 17:
        return None

    icao24    = state[0]
    lon       = state[5]
    lat       = state[6]
    on_ground = state[8]

    if on_ground is True:
        status = "GROUNDED"
    elif on_ground is False:
        status = "AIRBORNE"
    else:
        status = "UNKNOWN"

    return Row(
        unit_id      = str(icao24) if icao24 else None,
        vehicle_type = "AIRCRAFT",
        latitude     = float(lat) if lat is not None else None,
        longitude    = float(lon) if lon is not None else None,
        status       = status,
        timestamp    = timestamp,
    )


# ---------------------------------------------------------------------------
# Transform
# ---------------------------------------------------------------------------
@external_systems(
    source=Source("ri.magritte..source.4d9c8591-4c74-46a9-b3f6-cc55aa1f9208")
)
@transform(
    aircraft_telemetry_out=Output(
        "/Atamer Systems-976c6b/Crisis Logistics Command System/datasets/opensky_processor"
    )
)
def compute(ctx, aircraft_telemetry_out, source: ResolvedSource):
    spark          = ctx.spark_session
    current_time   = datetime.now(timezone.utc).isoformat(timespec="seconds")

    try:
        # ------------------------------------------------------------------
        # 1. Read credentials from Foundry secrets
        # ------------------------------------------------------------------
        client_id     = source.get_secret("additionalSecretOauthClientId")
        client_secret = source.get_secret("additionalSecretOauthClientSecret")

        # ------------------------------------------------------------------
        # 2. Obtain Bearer token (OAuth2 client credentials flow)
        #    Note: this call goes to auth.opensky-network.org — make sure
        #    that domain is also whitelisted in your Foundry egress policy.
        # ------------------------------------------------------------------
        access_token = _get_bearer_token(client_id, client_secret)

        # ------------------------------------------------------------------
        # 3. Build the OpenSky API request via the Foundry proxy connection
        # ------------------------------------------------------------------
        conn     = source.get_https_connection()
        client   = conn.get_client()
        client.auth = None          # disable any default auth on the client

        base_url = conn.url.rstrip("/")
        url      = (
            f"{base_url}/api/states/all"
            f"?lamin={BBOX['lamin']}"
            f"&lomin={BBOX['lomin']}"
            f"&lamax={BBOX['lamax']}"
            f"&lomax={BBOX['lomax']}"
        )

        # Polite random back-off before hitting the API
        time.sleep(random.uniform(1.0, 3.0))

        # ------------------------------------------------------------------
        # 4. Call the API with the Bearer token in the Authorization header
        # ------------------------------------------------------------------
        response = client.get(
            url,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=20,
        )
        response.raise_for_status()

        # ------------------------------------------------------------------
        # 5. Parse response
        # ------------------------------------------------------------------
        data   = response.json()
        states = data.get("states") or []

        parsed_rows = []
        for state in states:
            row = _parse_state(state, current_time)
            if row is not None:
                parsed_rows.append(row)

        # ------------------------------------------------------------------
        # 6. Write output DataFrame
        # ------------------------------------------------------------------
        if parsed_rows:
            output_df = spark.createDataFrame(parsed_rows, AIRCRAFT_SCHEMA)
        else:
            # API responded successfully but no aircraft in the bounding box
            output_df = spark.createDataFrame(
                [Row(
                    unit_id      = "NO_DATA",
                    vehicle_type = "INFO",
                    latitude     = 0.0,
                    longitude    = 0.0,
                    status       = "API connected but no aircraft found over London",
                    timestamp    = current_time,
                )],
                AIRCRAFT_SCHEMA,
            )

        aircraft_telemetry_out.write_dataframe(output_df)

    # ----------------------------------------------------------------------
    # Error handling — always write a row so downstream datasets don't break
    # ----------------------------------------------------------------------
    except requests.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else "???"
        _write_error(
            spark,
            aircraft_telemetry_out,
            f"HTTP {status_code}: {str(e)[:200]}",
            current_time,
        )

    except requests.Timeout:
        _write_error(
            spark,
            aircraft_telemetry_out,
            "Request timed out — OpenSky API did not respond in time",
            current_time,
        )

    except requests.ConnectionError as e:
        _write_error(
            spark,
            aircraft_telemetry_out,
            f"Connection error (check egress policy): {str(e)[:200]}",
            current_time,
        )

    except Exception as e:
        _write_error(
            spark,
            aircraft_telemetry_out,
            f"{type(e).__name__}: {str(e)[:200]}",
            current_time,
        )


def _write_error(spark, output, message: str, timestamp: str):
    """Write a single error sentinel row so the dataset always has output."""
    error_df = spark.createDataFrame(
        [Row(
            unit_id      = "SYS_FAIL",
            vehicle_type = "ERROR",
            latitude     = 0.0,
            longitude    = 0.0,
            status       = message[:250],
            timestamp    = timestamp,
        )],
        AIRCRAFT_SCHEMA,
    )
    output.write_dataframe(error_df)