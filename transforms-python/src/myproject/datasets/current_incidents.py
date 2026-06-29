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
    )

    logger.info("Deduplicated incidents for ontology backing")
    output.write_table(deduped)
