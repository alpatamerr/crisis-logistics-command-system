"""Current Incidents — deduplicated view of live incidents for ontology backing.

Reads the incremental raw_live_incidents (which accumulates rows across polling
cycles) and deduplicates on incident_id, keeping only the most recent observation.
This ensures unique primary keys for the Live Incident object type.
"""
from transforms.api import transform, Input, Output, lightweight
import polars as pl
import logging

logger = logging.getLogger(__name__)


@lightweight()
@transform(
    raw_incidents=Input("ri.foundry.main.dataset.26801c50-1ffa-46d5-be54-c9c6d3a47066"),
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/03_ontology_backings/current_incidents"),
)
def compute(raw_incidents, output):
    """Deduplicate incidents keeping latest observation per incident_id."""
    df = raw_incidents.polars(lazy=True)

    deduped = (
        df
        .sort("polled_at", descending=True)
        .unique(subset=["incident_id"], keep="first")
        # Filter to West London bounding box
        .filter(
            (pl.col("latitude") >= 51.41) & (pl.col("latitude") <= 51.60) &
            (pl.col("longitude") >= -0.50) & (pl.col("longitude") <= -0.15)
        )
        .with_columns(
            pl.struct([pl.col("latitude"), pl.col("longitude")])
            .map_elements(
                lambda s: _geohash(s["latitude"], s["longitude"]),
                return_dtype=pl.Utf8,
            )
            .alias("geohash")
        )
    )

    logger.info("Deduplicated incidents for ontology backing")
    output.write_table(deduped)


def _geohash(lat, lng, precision=12):
    """Compute a geohash string from lat/lng."""
    if lat is None or lng is None:
        return None
    BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"
    lat_range, lng_range = [-90.0, 90.0], [-180.0, 180.0]
    bits = [16, 8, 4, 2, 1]
    geohash = []
    even = True
    bit = 0
    ch = 0
    while len(geohash) < precision:
        if even:
            mid = (lng_range[0] + lng_range[1]) / 2
            if lng > mid:
                ch |= bits[bit]
                lng_range[0] = mid
            else:
                lng_range[1] = mid
        else:
            mid = (lat_range[0] + lat_range[1]) / 2
            if lat > mid:
                ch |= bits[bit]
                lat_range[0] = mid
            else:
                lat_range[1] = mid
        even = not even
        if bit < 4:
            bit += 1
        else:
            geohash.append(BASE32[ch])
            bit = 0
            ch = 0
    return "".join(geohash)
