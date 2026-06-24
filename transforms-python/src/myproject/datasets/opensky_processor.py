from transforms.api import transform_pandas, Output, lightweight
from transforms.external.systems import external_systems, Source, ResolvedSource
from datetime import datetime, timezone
import pandas as pd

SOURCE_RID = "ri.magritte..source.4d9c8591-4c74-46a9-b3f6-cc55aa1f9208"
TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
API_PATH = "/api/states/all"
BBOX = {"lamin": 51.43, "lomin": -0.52, "lamax": 51.55, "lomax": -0.10}


def _error_row(unit_id, status, current_time):
    """Create a single-row error/info DataFrame."""
    return pd.DataFrame([{
        "unit_id": unit_id,
        "vehicle_type": "ERROR",
        "latitude": 0.0,
        "longitude": 0.0,
        "status": str(status)[:250],
        "timestamp": current_time,
    }])


def _parse_states(states, current_time):
    """Parse OpenSky state vector array into rows."""
    rows = []
    for state in states:
        if len(state) < 9:
            continue
        icao24, lon, lat, on_ground = state[0], state[5], state[6], state[8]
        status = ("GROUNDED" if on_ground is True
                  else "AIRBORNE" if on_ground is False
                  else "UNKNOWN")
        rows.append({
            "unit_id": str(icao24) if icao24 else None,
            "vehicle_type": "AIRCRAFT",
            "latitude": float(lat) if lat is not None else None,
            "longitude": float(lon) if lon is not None else None,
            "status": status,
            "timestamp": current_time,
        })
    return rows


@lightweight
@external_systems(source=Source(SOURCE_RID))
@transform_pandas(
    Output("/Atamer Systems-976c6b/Crisis Logistics Command System/datasets/opensky_processor")
)
def compute(source: ResolvedSource) -> pd.DataFrame:
    current_time = datetime.now(timezone.utc).isoformat(timespec="seconds")

    try:
        # Get pre-configured HTTP client from the source (requests.Session
        # with Foundry SSL/proxy settings - routes through egress sidecar)
        conn = source.get_https_connection()
        client = conn.get_client()
        base_url = conn.url  # https://opensky-network.org

        # Retrieve OAuth2 credentials from source secrets
        client_id = source.get_secret("additionalSecretOauthClientId")
        client_secret = source.get_secret("additionalSecretOauthClientSecret")

        # Step 1: OAuth2 Client Credentials token exchange
        # Traffic to auth.opensky-network.org is allowed by the attached egress policy
        token_resp = client.post(
            TOKEN_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        # Step 2: Call OpenSky API with Bearer token
        api_resp = client.get(
            base_url + API_PATH,
            params=BBOX,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=20,
        )

        if api_resp.status_code != 200:
            return _error_row(
                "API_FAIL",
                f"HTTP {api_resp.status_code}: {api_resp.text[:180]}",
                current_time,
            )

        # Step 3: Parse state vectors
        states = api_resp.json().get("states") or []
        rows = _parse_states(states, current_time)

        if rows:
            return pd.DataFrame(rows)
        else:
            return pd.DataFrame([{
                "unit_id": "NO_DATA",
                "vehicle_type": "INFO",
                "latitude": 0.0,
                "longitude": 0.0,
                "status": "API OK - no aircraft in West London bbox right now",
                "timestamp": current_time,
            }])

    except Exception as e:
        return _error_row(
            "SYS_FAIL",
            f"{type(e).__name__}: {str(e)[:220]}",
            current_time,
        )
