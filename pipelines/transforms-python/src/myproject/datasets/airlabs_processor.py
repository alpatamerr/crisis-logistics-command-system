from transforms.api import transform, Output, lightweight, incremental
from transforms.external.systems import external_systems, Source, ResolvedSource
from datetime import datetime, timezone
import pandas as pd

SOURCE_RID = "ri.magritte..source.4d9c8591-4c74-46a9-b3f6-cc55aa1f9208"
API_PATH = "/api/v9/flights"
BBOX = "51.41,-0.50,51.56,-0.15"  # West London bounding box

# Known helicopter ICAO type designators for cross-reference detection
HELICOPTER_ICAO_CODES = {
    # Airbus Helicopters
    "EC20", "EC25", "EC30", "EC35", "EC45", "EC55", "EC75",
    "H125", "H130", "H135", "H145", "H155", "H160", "H175", "H215", "H225",
    "AS32", "AS33", "AS35", "AS50", "AS55", "AS65", "SA34", "SA36",
    # Leonardo/AgustaWestland
    "A109", "A119", "A139", "A149", "A169", "A189", "EH10", "NH90",
    # Bell
    "B06", "B105", "B206", "B212", "B214", "B222", "B230", "B407", "B412",
    "B429", "B430", "B505", "BK17",
    # Robinson
    "R22", "R44", "R66",
    # Sikorsky
    "S61", "S64", "S70", "S76", "S92", "S300", "S330", "S333",
    # MD Helicopters
    "MD52", "MD60", "MD90", "EXPL",
    # Mil/Kamov
    "MI8", "MI17", "MI24", "MI26", "KA32", "KA62",
    # Other
    "W3", "LYNX", "GUZL", "S269", "CABR", "HUCO",
}


def _classify_aircraft(aircraft_icao):
    """Classify aircraft as HELICOPTER or AIRCRAFT based on ICAO type code."""
    if not aircraft_icao:
        return "AIRCRAFT"
    code = aircraft_icao.upper().strip()
    if code in HELICOPTER_ICAO_CODES:
        return "HELICOPTER"
    return "AIRCRAFT"


def _parse_flights(flights, current_time):
    """Parse Airlabs flight data into rows with helicopter detection."""
    rows = []
    for flight in flights:
        hex_id = flight.get("hex")
        lat = flight.get("lat")
        lng = flight.get("lng")
        alt = flight.get("alt")
        aircraft_icao = flight.get("aircraft_icao")
        status_raw = flight.get("status", "unknown")

        if status_raw == "landed":
            status = "GROUNDED"
        elif status_raw in ("en-route", "scheduled"):
            status = "AIRBORNE"
        else:
            status = "UNKNOWN"

        vehicle_type = _classify_aircraft(aircraft_icao)

        rows.append({
            "unit_id": str(hex_id) if hex_id else None,
            "vehicle_type": vehicle_type,
            "aircraft_icao": aircraft_icao,
            "latitude": float(lat) if lat is not None else None,
            "longitude": float(lng) if lng is not None else None,
            "status": status,
            "timestamp": current_time,
        })
    return rows


@incremental(semantic_version=2)
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
