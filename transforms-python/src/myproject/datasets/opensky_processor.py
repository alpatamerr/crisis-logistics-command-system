from transforms.api import transform_pandas, Output, lightweight
from transforms.external.systems import external_systems, Source, ResolvedSource
from datetime import datetime, timezone
import pandas as pd

SOURCE_RID = "ri.magritte..source.4d9c8591-4c74-46a9-b3f6-cc55aa1f9208"
API_PATH = "/api/v9/flights"
BBOX = "51.43,-0.52,51.55,-0.10"  # West London / Heathrow area


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


def _parse_flights(flights, current_time):
    """Parse Airlabs flight data into rows."""
    rows = []
    for flight in flights:
        hex_id = flight.get("hex")
        lat = flight.get("lat")
        lng = flight.get("lng")
        alt = flight.get("alt")
        on_ground = (alt == 0 or alt is None) if lat is not None else None
        status_raw = flight.get("status", "unknown")

        if status_raw == "landed":
            status = "GROUNDED"
        elif status_raw in ("en-route", "scheduled"):
            status = "AIRBORNE"
        else:
            status = "UNKNOWN"

        rows.append({
            "unit_id": str(hex_id) if hex_id else None,
            "vehicle_type": "AIRCRAFT",
            "latitude": float(lat) if lat is not None else None,
            "longitude": float(lng) if lng is not None else None,
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
        # Get pre-configured HTTP client from the source
        conn = source.get_https_connection()
        client = conn.get_client()
        base_url = conn.url  # https://airlabs.co

        # Retrieve API key from source secrets
        api_key = source.get_secret("additionalSecretAirlabsApiKey")

        # Call Airlabs flights API with bounding box
        api_resp = client.get(
            base_url + API_PATH,
            params={
                "api_key": api_key,
                "bbox": BBOX,
            },
            timeout=20,
        )

        if api_resp.status_code != 200:
            return _error_row(
                "API_FAIL",
                f"HTTP {api_resp.status_code}: {api_resp.text[:180]}",
                current_time,
            )

        # Parse flight data
        data = api_resp.json()
        flights = data.get("response") or []
        rows = _parse_flights(flights, current_time)

        if rows:
            return pd.DataFrame(rows)
        else:
            return pd.DataFrame([{
                "unit_id": "NO_DATA",
                "vehicle_type": "INFO",
                "latitude": 0.0,
                "longitude": 0.0,
                "status": "API OK — no aircraft in West London bbox right now",
                "timestamp": current_time,
            }])

    except Exception as e:
        return _error_row(
            "SYS_FAIL",
            f"{type(e).__name__}: {str(e)[:220]}",
            current_time,
        )
