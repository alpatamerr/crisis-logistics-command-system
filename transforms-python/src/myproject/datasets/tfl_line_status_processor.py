"""TfL Line Status - real-time Tube/Rail/Bus service status for West London."""
from transforms.api import transform, Output, lightweight
from transforms.external.systems import external_systems, Source
import requests
import logging
import polars as pl
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# TfL modes relevant to West London crisis logistics
LINE_MODES = "tube,elizabeth-line,overground,dlr,tram,bus"
# West London relevant tube lines
WEST_LONDON_LINES = {
    "piccadilly", "district", "central", "hammersmith-city",
    "circle", "metropolitan", "elizabeth", "overground",
}
TFL_STATUS_URL = "https://api.tfl.gov.uk/Line/Mode/{mode}/Status"


@lightweight()
@external_systems(
    source=Source("ri.magritte..source.acf9fdf5-72dd-43fa-a501-2b418215791c"),
)
@transform(
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/tfl_line_status"),
)
def compute(ctx, output, source):
    """Fetch live service status for all relevant transport lines."""
    polled_at = datetime.now(timezone.utc).isoformat()
    records = []

    for mode in ["tube,elizabeth-line,overground,dlr", "bus", "river-bus"]:
        url = TFL_STATUS_URL.format(mode=mode)
        logger.info(f"Fetching TfL line status: {url}")
        try:
            resp = requests.get(url, timeout=30)
            resp.raise_for_status()
            lines = resp.json()
        except Exception as e:
            logger.warning(f"Failed to fetch {mode} status: {e}")
            continue

        for line in lines:
            line_id = line.get("id", "")
            line_name = line.get("name", "")
            mode_name = line.get("modeName", "")

            # For tube/rail, filter to West London relevant lines
            if mode_name in ("tube", "elizabeth-line") and line_id not in WEST_LONDON_LINES:
                continue

            # For bus, only include routes serving West London (routes starting with numbers common in W London)
            if mode_name == "bus":
                # Include major West London bus routes
                west_london_bus_prefixes = ("9", "10", "27", "28", "49", "65", "70", "71", "72", "94", "110", "111", "116", "117", "120", "140", "148", "207", "237", "266", "267", "272", "281", "283", "285", "371", "391", "406", "411", "418", "440", "E1", "E2", "E3", "E5", "E7", "E8", "E9", "E10", "E11", "H91", "H98")
                if line_id not in west_london_bus_prefixes:
                    continue

            statuses = line.get("lineStatuses", [])
            for status in statuses:
                severity = status.get("statusSeverity", 10)
                severity_desc = status.get("statusSeverityDescription", "Unknown")
                reason = status.get("reason", "")

                records.append({
                    "line_id": line_id,
                    "line_name": line_name,
                    "mode": mode_name,
                    "status_severity": severity,
                    "status_description": severity_desc,
                    "disruption_reason": reason if reason else None,
                    "is_disrupted": severity < 10,
                    "polled_at": polled_at,
                })

    if not records:
        logger.error("No line status data retrieved")
        ctx.abort_job()
        return

    logger.info(f"Got status for {len(records)} line/service entries")
    df = pl.DataFrame(records)

    # Deduplicate: keep worst status per line (lowest severity = worst)
    df = df.sort("status_severity", descending=False)
    df = df.unique(subset=["line_id"], keep="first")

    output.write_table(df)
