"""TfL Vehicle API - tracks real-time bus positions in West London.

Uses the TfL Line Arrivals API to get live bus predictions, then maps
each bus to its next stop's coordinates for approximate positioning.

Attribution: Powered by TfL Open Data.
Contains OS data Crown copyright and database rights 2016.
"""
from transforms.api import transform, Input, Output, lightweight
from transforms.external.systems import external_systems, Source
import logging
import polars as pl
from datetime import datetime

logger = logging.getLogger(__name__)

TFL_SOURCE = Source("ri.magritte..source.acf9fdf5-72dd-43fa-a501-2b418215791c")

# West London bounding box
WEST_LONDON_LAT_MIN = 51.38
WEST_LONDON_LAT_MAX = 51.63
WEST_LONDON_LON_MIN = -0.51
WEST_LONDON_LON_MAX = -0.17

# Key West London bus lines (major routes through the 7 boroughs)
WEST_LONDON_BUS_LINES = [
    "65", "207", "427", "E1", "E3", "E5", "E7", "E8", "E9", "E10", "E11",
    "H91", "H98", "140", "195", "237", "267", "281", "285", "371",
    "482", "488", "490", "H17", "H20", "H22", "H28", "H32",
    "83", "72", "94", "148", "218", "220", "223", "228",
]

HARD_CALL_LIMIT = 40

OUTPUT_SCHEMA = {
    "unit_id": pl.Utf8,
    "vehicle_type": pl.Utf8,
    "latitude": pl.Float64,
    "longitude": pl.Float64,
    "status": pl.Utf8,
    "last_seen_at": pl.Utf8,
    "line_name": pl.Utf8,
    "destination": pl.Utf8,
    "direction": pl.Utf8,
}


def _empty_df():
    return pl.DataFrame({k: pl.Series([], dtype=v) for k, v in OUTPUT_SCHEMA.items()})


def _build_auth_params(app_key):
    """Build auth params dict from app_key (if available)."""
    return {"app_key": app_key} if app_key else {}


@lightweight()
@external_systems(source=TFL_SOURCE)
@transform(
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/tfl_vehicle_positions"),
)
def compute(ctx, output, source):
    """Fetch real-time bus positions from TfL Line Arrivals API."""
    conn = source.get_https_connection()
    client = conn.get_client()
    base_url = conn.url

    # Retrieve API key from data connection source secret
    try:
        app_key = source.get_secret("additionalSecretTflAppKey")
    except Exception:
        app_key = None
        logger.warning("TfL API key not found in source secrets — using keyless access (lower rate limits)")

    all_predictions = []
    api_calls = 0
    now_str = datetime.utcnow().isoformat() + "Z"

    # Step 1: Fetch arrival predictions for West London bus lines
    batch_size = 5
    for i in range(0, len(WEST_LONDON_BUS_LINES), batch_size):
        if api_calls >= HARD_CALL_LIMIT:
            logger.warning("Hard API call limit reached — stopping line fetch")
            break

        batch = WEST_LONDON_BUS_LINES[i:i + batch_size]
        line_ids = ",".join(batch)

        try:
            resp = client.get(
                base_url + f"/Line/{line_ids}/Arrivals",
                params={"direction": "all", **_build_auth_params(app_key)},
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            api_calls += 1

            # Keep one prediction per vehicle (the nearest stop)
            for prediction in data:
                vehicle_id = prediction.get("vehicleId")
                naptan_id = prediction.get("naptanId")
                if not vehicle_id or not naptan_id:
                    continue
                all_predictions.append(prediction)

        except Exception as e:
            logger.warning(f"TfL Arrivals API failed for lines {line_ids}: {e}")
            continue

    logger.info(f"Fetched {len(all_predictions)} predictions using {api_calls} API calls")

    if not all_predictions:
        output.write_table(_empty_df())
        return

    # Step 2: Deduplicate - keep closest stop per vehicle (lowest timeToStation)
    vehicle_best = {}
    for pred in all_predictions:
        vid = pred.get("vehicleId")
        time_to = pred.get("timeToStation", 9999)
        if vid not in vehicle_best or time_to < vehicle_best[vid].get("timeToStation", 9999):
            vehicle_best[vid] = pred

    # Step 3: Get unique stop NaPTAN IDs and fetch their coordinates
    unique_stops = set(p.get("naptanId") for p in vehicle_best.values() if p.get("naptanId"))
    logger.info(f"Looking up coordinates for {len(unique_stops)} unique stops")

    # Use StopPoint API to get stop coordinates (batched)
    stop_coords = {}
    stops_list = list(unique_stops)
    stop_batch_size = 20
    for i in range(0, len(stops_list), stop_batch_size):
        if api_calls >= HARD_CALL_LIMIT:
            break
        batch = stops_list[i:i + stop_batch_size]
        batch_ids = ",".join(batch)
        try:
            resp = client.get(
                base_url + f"/StopPoint/{batch_ids}",
                params={**_build_auth_params(app_key)},
                timeout=15,
            )
            api_calls += 1
            if resp.status_code == 200:
                data = resp.json()
                # Response can be a list or single object
                stops = data if isinstance(data, list) else [data]
                for stop in stops:
                    nid = stop.get("naptanId")
                    lat = stop.get("lat")
                    lon = stop.get("lon")
                    if nid and lat and lon:
                        stop_coords[nid] = (lat, lon)
        except Exception as e:
            logger.warning(f"StopPoint lookup failed: {e}")

    logger.info(f"Resolved coordinates for {len(stop_coords)} stops")

    # Step 4: Build vehicle position records using stop coordinates
    vehicles = []
    for vid, pred in vehicle_best.items():
        naptan_id = pred.get("naptanId")
        if naptan_id not in stop_coords:
            continue

        lat, lon = stop_coords[naptan_id]

        # Filter to West London bounding box
        if not (WEST_LONDON_LAT_MIN <= lat <= WEST_LONDON_LAT_MAX and
                WEST_LONDON_LON_MIN <= lon <= WEST_LONDON_LON_MAX):
            continue

        vehicles.append({
            "unit_id": f"BUS-{vid}",
            "vehicle_type": "BUS",
            "latitude": lat,
            "longitude": lon,
            "status": pred.get("currentLocation", "IN_SERVICE"),
            "last_seen_at": pred.get("timestamp", now_str),
            "line_name": pred.get("lineName", ""),
            "destination": pred.get("destinationName", ""),
            "direction": pred.get("direction", ""),
        })

    logger.info(f"Mapped {len(vehicles)} buses to West London positions using {api_calls} total API calls")

    if vehicles:
        df = pl.DataFrame(vehicles)
    else:
        df = _empty_df()

    output.write_table(df)
