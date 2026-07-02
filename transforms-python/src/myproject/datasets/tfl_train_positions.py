"""TfL Train Positions - tracks real-time tube and rail train positions in West London.

Uses the TfL Line Arrivals API (same pattern as bus tracking) to get live train
predictions, then maps each train to its nearest station's coordinates.

Covers: Central, District, Piccadilly, Metropolitan, Circle, H&C, Jubilee,
Bakerloo, Elizabeth Line, and Overground services through West London.
"""
from transforms.api import transform, Output, lightweight
from transforms.external.systems import external_systems, Source
import logging
import polars as pl
import requests

logger = logging.getLogger(__name__)

TFL_SOURCE = Source("ri.magritte..source.acf9fdf5-72dd-43fa-a501-2b418215791c")

# Hard limit on API calls per run
HARD_CALL_LIMIT = 200

# West London bounding box
WEST_LONDON_BOUNDS = {
    "lat_min": 51.38, "lat_max": 51.63,
    "lng_min": -0.51, "lng_max": -0.17,
}

# Tube and rail lines serving West London
TUBE_LINES = [
    "central", "district", "piccadilly", "metropolitan",
    "circle", "hammersmith-city", "jubilee", "bakerloo",
]

RAIL_LINES = [
    "elizabeth", "london-overground",
]

ALL_LINES = TUBE_LINES + RAIL_LINES

OUTPUT_SCHEMA = {
    "unit_id": pl.Utf8,
    "vehicle_type": pl.Utf8,
    "latitude": pl.Float64,
    "longitude": pl.Float64,
    "last_seen_at": pl.Utf8,
    "line_name": pl.Utf8,
    "destination": pl.Utf8,
}


def _empty_df():
    return pl.DataFrame({k: pl.Series([], dtype=v) for k, v in OUTPUT_SCHEMA.items()})


@lightweight()
@external_systems(source=TFL_SOURCE)
@transform(
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/tfl_train_positions"),
)
def compute(ctx, output, source):
    """Fetch real-time train positions from TfL Line Arrivals API."""
    conn = source.get_https_connection()
    client = conn.get_client()
    base_url = conn.url
    app_key = source.get_secret("additionalSecretTflAppKey")

    all_vehicles = {}
    api_calls = 0
    stop_coords_cache = {}

    # Batch lines in groups of 3 for efficient API usage
    batch_size = 3
    for i in range(0, len(ALL_LINES), batch_size):
        if api_calls >= HARD_CALL_LIMIT:
            logger.warning("Hard API call limit reached")
            break

        batch = ALL_LINES[i:i + batch_size]
        line_ids = ",".join(batch)

        try:
            params = {"direction": "all"}
            if app_key:
                params["app_key"] = app_key

            resp = client.get(
                base_url + f"/Line/{line_ids}/Arrivals",
                params=params,
                timeout=20,
            )
            resp.raise_for_status()
            predictions = resp.json()
            api_calls += 1

            for pred in predictions:
                vehicle_id = pred.get("vehicleId")
                if not vehicle_id:
                    continue

                naptan_id = pred.get("naptanId", "")
                time_to_station = pred.get("timeToStation", 9999)
                line_id = pred.get("lineId", "")

                # Keep the prediction with lowest timeToStation per vehicle
                if vehicle_id not in all_vehicles or time_to_station < all_vehicles[vehicle_id]["timeToStation"]:
                    vehicle_type = "TUBE" if line_id in TUBE_LINES else "RAIL"
                    all_vehicles[vehicle_id] = {
                        "vehicleId": vehicle_id,
                        "naptanId": naptan_id,
                        "timeToStation": time_to_station,
                        "lineId": line_id,
                        "lineName": pred.get("lineName", ""),
                        "destinationName": pred.get("destinationName", ""),
                        "timestamp": pred.get("timestamp", ""),
                        "vehicleType": vehicle_type,
                    }
        except Exception as e:
            logger.warning(f"TfL Line Arrivals failed for {line_ids}: {e}")
            continue

    if not all_vehicles:
        logger.info("No train predictions found")
        output.write_table(_empty_df())
        return

    logger.info(f"Found {len(all_vehicles)} unique trains from {api_calls} API calls")

    # Resolve station coordinates
    unique_naptan_ids = list(set(v["naptanId"] for v in all_vehicles.values() if v["naptanId"]))

    # Batch StopPoint lookups (max 20 per request)
    stop_batch_size = 20
    for i in range(0, len(unique_naptan_ids), stop_batch_size):
        if api_calls >= HARD_CALL_LIMIT:
            break

        batch = unique_naptan_ids[i:i + stop_batch_size]
        ids_str = ",".join(batch)

        try:
            params = {}
            if app_key:
                params["app_key"] = app_key

            resp = client.get(
                base_url + f"/StopPoint/{ids_str}",
                params=params,
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            api_calls += 1

            stops = data if isinstance(data, list) else [data]
            for stop in stops:
                nid = stop.get("naptanId", stop.get("id", ""))
                lat = stop.get("lat")
                lon = stop.get("lon")
                if nid and lat and lon:
                    stop_coords_cache[nid] = (lat, lon)
        except Exception as e:
            logger.warning(f"StopPoint lookup failed: {e}")
            continue

    # Build results with coordinates
    results = []
    for vehicle_id, info in all_vehicles.items():
        naptan_id = info["naptanId"]
        coords = stop_coords_cache.get(naptan_id)
        if not coords:
            continue

        lat, lon = coords
        # Filter to West London
        if not (WEST_LONDON_BOUNDS["lat_min"] <= lat <= WEST_LONDON_BOUNDS["lat_max"] and
                WEST_LONDON_BOUNDS["lng_min"] <= lon <= WEST_LONDON_BOUNDS["lng_max"]):
            continue

        results.append({
            "unit_id": f"train_{vehicle_id}",
            "vehicle_type": info["vehicleType"],
            "latitude": lat,
            "longitude": lon,
            "last_seen_at": info["timestamp"],
            "line_name": info["lineName"],
            "destination": info["destinationName"],
        })

    if results:
        df = pl.DataFrame(results)
    else:
        df = _empty_df()

    logger.info(f"Output: {df.height} trains in West London ({api_calls} total API calls)")
    output.write_table(df)
