"""TfL Air Quality - current air quality forecast for London."""
from transforms.api import transform, Output, lightweight
from transforms.external.systems import external_systems, Source
import requests
import logging
import polars as pl
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

TFL_AQ_URL = "https://api.tfl.gov.uk/AirQuality"


@lightweight()
@external_systems(
    source=Source("ri.magritte..source.acf9fdf5-72dd-43fa-a501-2b418215791c"),
)
@transform(
    output=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/02_clean_derived/tfl_air_quality"),
)
def compute(ctx, output, source):
    """Fetch current air quality forecast from TfL."""
    polled_at = datetime.now(timezone.utc).isoformat()

    logger.info(f"Fetching TfL air quality from: {TFL_AQ_URL}")
    try:
        resp = requests.get(TFL_AQ_URL, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error(f"TfL Air Quality API failed: {e}")
        ctx.abort_job()
        return

    records = []
    forecasts = data.get("currentForecast", [])
    for forecast in forecasts:
        records.append({
            "forecast_type": forecast.get("forecastType", ""),
            "forecast_id": forecast.get("forecastID", ""),
            "forecast_band": forecast.get("forecastBand", ""),
            "forecast_summary": forecast.get("forecastSummary", ""),
            "no2_band": forecast.get("nO2Band", ""),
            "o3_band": forecast.get("o3Band", ""),
            "pm10_band": forecast.get("pM10Band", ""),
            "pm25_band": forecast.get("pM25Band", ""),
            "so2_band": forecast.get("sO2Band", ""),
            "forecast_text": forecast.get("forecastText", ""),
            "polled_at": polled_at,
        })

    if not records:
        logger.warning("No air quality forecast data")
        ctx.abort_job()
        return

    logger.info(f"Got {len(records)} air quality forecasts")
    df = pl.DataFrame(records)
    output.write_table(df)
