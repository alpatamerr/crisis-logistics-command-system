from transforms.api import transform, Output
from transforms.external.systems import external_systems, Source, ResolvedSource
from pyspark.sql import Row
from pyspark.sql.types import StructType, StructField, StringType, DoubleType
from datetime import datetime, timezone
import time
import random

AIRCRAFT_SCHEMA = StructType([
    StructField("unit_id",       StringType(), True),
    StructField("vehicle_type",  StringType(), True),
    StructField("latitude",      DoubleType(), True),
    StructField("longitude",     DoubleType(), True),
    StructField("status",        StringType(), True),
    StructField("timestamp",     StringType(), True),
])

BBOX = dict(lamin=51.43, lomin=-0.52, lamax=51.55, lomax=-0.10)

TOKEN_PATH = "/auth/realms/opensky-network/protocol/openid-connect/token"
API_PATH   = "/api/states/all"


def _write_row(spark, output, unit_id, vehicle_type, lat, lon, status, timestamp):
    output.write_dataframe(
        spark.createDataFrame(
            [Row(unit_id=unit_id, vehicle_type=vehicle_type,
                 latitude=lat, longitude=lon,
                 status=str(status)[:250], timestamp=timestamp)],
            AIRCRAFT_SCHEMA,
        )
    )


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
        client_id     = source.get_secret("additionalSecretOauthClientId")
        client_secret = source.get_secret("additionalSecretOauthClientSecret")

        # ------------------------------------------------------------------
        # STEP 1: Inspect what the source connection actually exposes
        # ------------------------------------------------------------------
        conn = source.get_https_connection()
        base_url = conn.url.rstrip("/")

        debug = (
            f"base_url={base_url} | "
            f"conn_type={type(conn).__name__} | "
            f"conn_attrs={[a for a in dir(conn) if not a.startswith('_')]} | "
        )

        client = conn.get_client()
        client_attrs = [a for a in dir(client) if not a.startswith('_')]
        debug += f"client_type={type(client).__name__} | client_attrs={client_attrs}"

        _write_row(spark, aircraft_telemetry_out,
                   "DEBUG", "INFO", 0.0, 0.0, debug[:250], current_time)

    except Exception as e:
        _write_row(spark, aircraft_telemetry_out,
                   "SYS_FAIL", "ERROR", 0.0, 0.0,
                   f"{type(e).__name__}: {str(e)[:220]}", current_time)