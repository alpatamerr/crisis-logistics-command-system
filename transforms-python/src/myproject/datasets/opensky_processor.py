from transforms.api import transform, Output
from transforms.external.systems import external_systems, Source, ResolvedSource
from pyspark.sql import Row
from pyspark.sql.types import StructType, StructField, StringType, DoubleType
from datetime import datetime, timezone
import time
import random

AIRCRAFT_SCHEMA = StructType([
    StructField("unit_id", StringType(), True),
    StructField("vehicle_type", StringType(), True),
    StructField("latitude", DoubleType(), True),
    StructField("longitude", DoubleType(), True),
    StructField("status", StringType(), True),
    StructField("timestamp", StringType(), True)
])

@external_systems(source=Source("ri.magritte..source.4d9c8591-4c74-46a9-b3f6-cc55aa1f9208"))
@transform(
    aircraft_telemetry_out=Output("/Atamer Systems-976c6b/Crisis Logistics Command System/datasets/opensky_processor")
)
def compute(ctx, aircraft_telemetry_out, source: ResolvedSource):
    spark_session = ctx.spark_session
    current_time = datetime.now(timezone.utc).isoformat(timespec='seconds')
    
    try:
        username = source.get_secret("additionalSecretOauthClientId")
        password = source.get_secret("additionalSecretOauthClientSecret")
        
        # İnternete çıkabilmek için mecburen Proxy bilen Foundry client'ını alıyoruz
        conn = source.get_https_connection()
        client = conn.get_client()
        
        # Foundry Arayüzündeki (UI) bozuk Auth ayarını zorla devreden çıkarıyoruz
        client.auth = None 
        
        # Base URL üzerinden ana adrese vuruyoruz
        url = f"{conn.url.rstrip('/')}/api/states/all"
        
        time.sleep(random.uniform(1.0, 3.0))
        
        # İsteği Basic Auth ile atıyoruz
        response = client.get(
            url,
            auth=(username, password),
            timeout=20
        )

        response.raise_for_status()

        data = response.json()
        states = data.get("states", [])

        parsed_records = []
        for state in states:
            if len(state) < 7:
                continue

            icao24, lon, lat, on_ground = state[0], state[5], state[6], state[8]
            parsed_records.append(Row(
                unit_id=str(icao24) if icao24 else None,
                vehicle_type="AIRCRAFT",
                latitude=float(lat) if lat is not None else None,
                longitude=float(lon) if lon is not None else None,
                status="GROUNDED" if on_ground is True else ("AIRBORNE" if on_ground is False else "UNKNOWN"),
                timestamp=current_time
            ))

        if parsed_records:
            output_df = spark_session.createDataFrame(parsed_records, AIRCRAFT_SCHEMA)
        else:
            # Veri gelmediyse boşluk yerine uyarı yaz
            output_df = spark_session.createDataFrame([Row("WARN", "NO_DATA", 0.0, 0.0, "API baglandi ama data gelmedi", current_time)], AIRCRAFT_SCHEMA)
            
        aircraft_telemetry_out.write_dataframe(output_df)

    except Exception as e:
        # HİLE BURADA: Hatayı yutma, direkt tablonun STATÜSÜNE yaz!
        error_msg = f"ERROR: {type(e).__name__} - {str(e)}"
        
        error_row = Row(
            unit_id="SYS_FAIL",
            vehicle_type="ERROR",
            latitude=0.0,
            longitude=0.0,
            status=error_msg[:250], # Tabloya sığsın diye 250 karaktere kestik
            timestamp=current_time
        )
        output_df = spark_session.createDataFrame([error_row], AIRCRAFT_SCHEMA)
        aircraft_telemetry_out.write_dataframe(output_df)