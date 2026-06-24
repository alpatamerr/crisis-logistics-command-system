from transforms.api import transform, Output, lightweight, incremental
from transforms.external.systems import external_systems, Source, ResolvedSource
from datetime import datetime, timezone
import pandas as pd

SOURCE_RID = "ri.magritte..source.4d9c8591-4c74-46a9-b3f6-cc55aa1f9208"
API_PATH = "/api/v9/flights"
BBOX = "51.43,-0.52,51.55,-0.10"  # West London / Heathrow area


def _parse_flights(flights, current_time):
    """Parse Airlabs flight data into rows."""
    rows = []
    for flight in flights:
        hex_id = flight.get("hex")
        lat = flight.get("lat")
        lng = flight.get("lng")
        alt = flight.get("alt")
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


@incremental()
@lightweight
@external_systems(source=Source(SOURCE_RID))
@transform(
    output=Output("ri.foundry.main.dataset.380832ab-a9ed-47f7-a5a9-c9df05e43938"),
)
def compute(output, source: ResolvedSource):
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
            # Don't write error rows to avoid polluting historical data
            return

        # Parse flight data
        data = api_resp.json()
        flights = data.get("response") or []
        rows = _parse_flights(flights, current_time)

        if rows:
            df = pd.DataFrame(rows)
            output.write_table(df)
        # If no rows, don't write anything (preserves clean history)

    except Exception:
        # Don't append error rows to historical dataset
        return
