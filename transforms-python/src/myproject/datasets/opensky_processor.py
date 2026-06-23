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
API_URL = "https://opensky-network.org/api/states/all"

# West London bounding box (~10 sq° = 1 credit per call)
# Covers: Heathrow, Hayes, Southall, Ealing, Hammersmith, Fulham, Chelsea, Kensington
BBOX = dict(lamin=51.43, lomin=-0.52, lamax=51.55, lomax=-0.10)

# Tight timeouts — fail fast rather than hang
TOKEN_TIMEOUT = 10   # seconds
API_TIMEOUT   = 15   # seconds


# ---------------------------------------------------------------------------
# Helper: fetch OAuth2 Bearer token
# ---------------------------------------------------------------------------
def _get_bearer_token(client_id: str, client_secret: str) -> str:
    resp = requests.post(
        TOKEN_URL,
        data={
            "grant_type":    "client_credentials",
            "client_id":     client_id,
            "client_secret": client_secret,
        },
        timeout=TOKEN_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


# ---------------------------------------------------------------------------
# Helper: parse a single OpenSky state vector row
# ---------------------------------------------------------------------------
def _parse_state(state: list, timestamp: str):
    if len(state) < 9:
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
# Helper: write error row
# ---------------------------------------------------------------------------
def _write_error(spark, output, message: str, timestamp: str):
    output.write_dataframe(
        spark.createDataFrame(
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
    spark        = ctx.spark_session
    current_time = datetime.now(timezone.utc).isoformat(timespec="seconds")

    try:
        # ------------------------------------------------------------------
        # 1. Pull credentials from Foundry secrets
        # ------------------------------------------------------------------
        client_id     = source.get_secret("additionalSecretOauthClientId")
        client_secret = source.get_secret("additionalSecretOauthClientSecret")

        # ------------------------------------------------------------------
        # 2. Get Bearer token — fast timeout so we fail in <10s if blocked
        # ------------------------------------------------------------------
        token = _get_bearer_token(client_id, client_secret)

        # ------------------------------------------------------------------
        # 3. Call OpenSky directly with raw requests (not Foundry's client)
        #    so that our timeout is actually respected
        # ------------------------------------------------------------------
        time.sleep(random.uniform(0.5, 1.5))

        response = requests.get(
            API_URL,
            params={
                "lamin": BBOX["lamin"],
                "lomin": BBOX["lomin"],
                "lamax": BBOX["lamax"],
                "lomax": BBOX["lomax"],
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=API_TIMEOUT,   # (connect_timeout, read_timeout) can also be a tuple
        )
        response.raise_for_status()

        # ------------------------------------------------------------------
        # 4. Parse
        # ------------------------------------------------------------------
        states = response.json().get("states") or []

        parsed_rows = []
        for state in states:
            row = _parse_state(state, current_time)
            if row is not None:
                parsed_rows.append(row)

        # ------------------------------------------------------------------
        # 5. Write
        # ------------------------------------------------------------------
        if parsed_rows:
            output_df = spark.createDataFrame(parsed_rows, AIRCRAFT_SCHEMA)
        else:
            output_df = spark.createDataFrame(
                [Row(
                    unit_id      = "NO_DATA",
                    vehicle_type = "INFO",
                    latitude     = 0.0,
                    longitude    = 0.0,
                    status       = "API OK — no aircraft in West London bbox right now",
                    timestamp    = current_time,
                )],
                AIRCRAFT_SCHEMA,
            )

        aircraft_telemetry_out.write_dataframe(output_df)

    except requests.Timeout as e:
        _write_error(spark, aircraft_telemetry_out,
                     f"TIMEOUT after {API_TIMEOUT}s: {str(e)[:180]}", current_time)

    except requests.HTTPError as e:
        code = e.response.status_code if e.response is not None else "???"
        _write_error(spark, aircraft_telemetry_out,
                     f"HTTP {code}: {str(e)[:200]}", current_time)

    except requests.ConnectionError as e:
        _write_error(spark, aircraft_telemetry_out,
                     f"ConnectionError (egress policy?): {str(e)[:200]}", current_time)

    except Exception as e:
        _write_error(spark, aircraft_telemetry_out,
                     f"{type(e).__name__}: {str(e)[:220]}", current_time)