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
# West London bounding box
# Covers: Heathrow, Hayes, Southall, Ealing, Hammersmith, Fulham, Chelsea, Kensington
# Area: ~10 sq° → 1 credit per call
# ---------------------------------------------------------------------------
BBOX = dict(lamin=51.43, lomin=-0.52, lamax=51.55, lomax=-0.10)


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
        # 1. Get the HTTP client from Foundry's managed connection.
        #    Because the source is configured as OAuth 2.0 in the Source
        #    Setup UI, Foundry automatically injects a valid Bearer token
        #    into every request made through this client. No manual token
        #    fetching is needed or wanted here.
        # ------------------------------------------------------------------
        conn   = source.get_https_connection()
        client = conn.get_client()

        base_url = conn.url.rstrip("/")
        url = (
            f"{base_url}/api/states/all"
            f"?lamin={BBOX['lamin']}"
            f"&lomin={BBOX['lomin']}"
            f"&lamax={BBOX['lamax']}"
            f"&lomax={BBOX['lomax']}"
        )

        # Polite random back-off to avoid hammering the API
        time.sleep(random.uniform(1.0, 2.0))

        # ------------------------------------------------------------------
        # 2. Make the request — Foundry injects the Bearer token for us
        # ------------------------------------------------------------------
        response = client.get(url, timeout=30)
        response.raise_for_status()

        # ------------------------------------------------------------------
        # 3. Parse the response
        # ------------------------------------------------------------------
        data   = response.json()
        states = data.get("states") or []

        parsed_rows = []
        for state in states:
            row = _parse_state(state, current_time)
            if row is not None:
                parsed_rows.append(row)

        # ------------------------------------------------------------------
        # 4. Write output DataFrame
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
                    status       = "API connected — no aircraft in West London bbox right now",
                    timestamp    = current_time,
                )],
                AIRCRAFT_SCHEMA,
            )

        aircraft_telemetry_out.write_dataframe(output_df)

    except Exception as e:
        _write_error(
            spark,
            aircraft_telemetry_out,
            f"{type(e).__name__}: {str(e)[:220]}",
            current_time,
        )


def _write_error(spark, output, message: str, timestamp: str):
    """Write a single error sentinel row so downstream datasets never break."""
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