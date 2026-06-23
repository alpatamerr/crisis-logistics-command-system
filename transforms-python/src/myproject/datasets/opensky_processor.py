from transforms.api import transform, Output
from transforms.external.systems import external_systems, Source, ResolvedSource
from pyspark.sql import Row
from pyspark.sql.types import StructType, StructField, StringType, DoubleType
from datetime import datetime, timezone
import os

AIRCRAFT_SCHEMA = StructType([
    StructField("unit_id",       StringType(), True),
    StructField("vehicle_type",  StringType(), True),
    StructField("latitude",      DoubleType(), True),
    StructField("longitude",     DoubleType(), True),
    StructField("status",        StringType(), True),
    StructField("timestamp",     StringType(), True),
])

SOURCE_RID = "ri.magritte..source.4d9c8591-4c74-46a9-b3f6-cc55aa1f9208"
BBOX       = dict(lamin=51.43, lomin=-0.52, lamax=51.55, lomax=-0.10)

TOKEN_URL  = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
API_URL    = "https://opensky-network.org/api/states/all"


def _write_row(spark, output, unit_id, vehicle_type, lat, lon, status, timestamp):
    output.write_dataframe(
        spark.createDataFrame(
            [Row(unit_id=unit_id, vehicle_type=vehicle_type,
                 latitude=lat, longitude=lon,
                 status=str(status)[:250], timestamp=timestamp)],
            AIRCRAFT_SCHEMA,
        )
    )


def _parse_state(state, timestamp):
    if len(state) < 9:
        return None
    icao24, lon, lat, on_ground = state[0], state[5], state[6], state[8]
    return Row(
        unit_id      = str(icao24) if icao24 else None,
        vehicle_type = "AIRCRAFT",
        latitude     = float(lat) if lat is not None else None,
        longitude    = float(lon) if lon is not None else None,
        status       = "GROUNDED" if on_ground is True else ("AIRBORNE" if on_ground is False else "UNKNOWN"),
        timestamp    = timestamp,
    )


@external_systems(
    source=Source(SOURCE_RID)
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
        # The CustomCaBundleSession can reach external URLs directly —
        # the egress firewall policy is enforced at the network level by
        # Kubernetes/Istio, not via a proxy. REQUESTS_CA_BUNDLE=ca.cer
        # handles SSL for both internal and external hosts.
        # We just need to use the session correctly with our own token.
        # ------------------------------------------------------------------
        conn   = source.get_https_connection()
        client = conn.get_client()

        # Step 1: fetch OAuth2 token
        # Use the same session — it has the right CA bundle for external HTTPS
        token_resp = client.post(
            TOKEN_URL,
            data={
                "grant_type":    "client_credentials",
                "client_id":     client_id,
                "client_secret": client_secret,
            },
            timeout=(5, 10),   # connect, read
        )

        if token_resp.status_code != 200:
            _write_row(spark, aircraft_telemetry_out,
                       "TOKEN_FAIL", "ERROR", 0.0, 0.0,
                       f"HTTP {token_resp.status_code}: {token_resp.text[:180]}",
                       current_time)
            return

        token = token_resp.json()["access_token"]

        # Step 2: call OpenSky API
        api_resp = client.get(
            API_URL,
            params=BBOX,
            headers={"Authorization": f"Bearer {token}"},
            timeout=(5, 10),
        )

        if api_resp.status_code != 200:
            _write_row(spark, aircraft_telemetry_out,
                       "API_FAIL", "ERROR", 0.0, 0.0,
                       f"HTTP {api_resp.status_code}: {api_resp.text[:180]}",
                       current_time)
            return

        # Step 3: parse
        states = api_resp.json().get("states") or []
        rows   = [r for r in (_parse_state(s, current_time) for s in states) if r]

        if rows:
            aircraft_telemetry_out.write_dataframe(
                spark.createDataFrame(rows, AIRCRAFT_SCHEMA)
            )
        else:
            _write_row(spark, aircraft_telemetry_out,
                       "NO_DATA", "INFO", 0.0, 0.0,
                       "API OK — no aircraft in West London bbox right now",
                       current_time)

    except Exception as e:
        _write_row(spark, aircraft_telemetry_out,
                   "SYS_FAIL", "ERROR", 0.0, 0.0,
                   f"{type(e).__name__}: {str(e)[:220]}",
                   current_time)