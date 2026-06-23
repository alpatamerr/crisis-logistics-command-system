from transforms.api import transform, Output
from transforms.external.systems import external_systems, Source, ResolvedSource
from pyspark.sql import Row
from pyspark.sql.types import StructType, StructField, StringType, DoubleType
from datetime import datetime, timezone
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
TOKEN_PATH = "/auth/realms/opensky-network/protocol/openid-connect/token"

# West London bounding box (~10 sq° = 1 credit per call)
# Covers: Heathrow, Ealing, Hammersmith, Fulham, Chelsea, Kensington
BBOX = dict(lamin=51.43, lomin=-0.52, lamax=51.55, lomax=-0.10)

TOKEN_TIMEOUT = 10  # seconds
API_TIMEOUT   = 15  # seconds


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _get_bearer_token(source: ResolvedSource, client_id: str, client_secret: str) -> str:
    """
    Fetch OAuth2 token via Foundry's managed connection to auth.opensky-network.org.
    We use a second source connection so egress is routed correctly.
    """
    conn   = source.get_https_connection("auth.opensky-network.org")
    client = conn.get_client()
    client.hooks = {}  # clear any retry/hook behaviour

    resp = client.post(
        conn.url.rstrip("/") + TOKEN_PATH,
        data={
            "grant_type":    "client_credentials",
            "client_id":     client_id,
            "client_secret": client_secret,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=TOKEN_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def _parse_state(state: list, timestamp: str):
    if len(state) < 9:
        return None
    icao24, lon, lat, on_ground = state[0], state[5], state[6], state[8]
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
        # 1. Read credentials
        # ------------------------------------------------------------------
        client_id     = source.get_secret("additionalSecretOauthClientId")
        client_secret = source.get_secret("additionalSecretOauthClientSecret")

        # ------------------------------------------------------------------
        # 2. Fetch Bearer token through Foundry egress
        # ------------------------------------------------------------------
        token = _get_bearer_token(source, client_id, client_secret)

        # ------------------------------------------------------------------
        # 3. Call OpenSky API through Foundry egress
        # ------------------------------------------------------------------
        time.sleep(random.uniform(0.5, 1.5))

        conn   = source.get_https_connection()
        client = conn.get_client()
        client.hooks = {}  # suppress any internal retry loops

        response = client.get(
            conn.url.rstrip("/") + "/api/states/all",
            params={
                "lamin": BBOX["lamin"],
                "lomin": BBOX["lomin"],
                "lamax": BBOX["lamax"],
                "lomax": BBOX["lomax"],
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=API_TIMEOUT,
        )
        response.raise_for_status()

        # ------------------------------------------------------------------
        # 4. Parse
        # ------------------------------------------------------------------
        states = response.json().get("states") or []
        parsed_rows = [r for r in (_parse_state(s, current_time) for s in states) if r]

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

    except Exception as e:
        _write_error(
            spark, aircraft_telemetry_out,
            f"{type(e).__name__}: {str(e)[:220]}",
            current_time,
        )