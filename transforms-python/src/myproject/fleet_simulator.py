import os
import json
import urllib.request
from datetime import datetime, timezone

def fetch_real_london_data(output_filename="raw_transport_units.json"):
    """Connects to the live TfL API and dumps actual infrastructure tracks."""
    
    # 1. Target the exact same directory structure
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    mock_data_dir = os.path.join(base_dir, "test_resources")
    os.makedirs(mock_data_dir, exist_ok=True)
    output_path = os.path.join(mock_data_dir, output_filename)
    
    print("🌐 Establishing live connection to Transport for London Open Data API...")
    
    # Querying live TfL network assets (Real IDs, actual geolocations, live operational feeds)
    url = "https://api.tfl.gov.uk/BikePoint/"
    
    try:
        # Request data securely using native python urllib
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            
        records_written = 0
        current_time = datetime.now(timezone.utc).isoformat(timespec='seconds')
        
        with open(output_path, "w") as f:
            # Loop through the active live physical assets across London
            for item in data[:300]:  
                unit_id = item.get("id", "UNKNOWN")
                lat = item.get("lat", 0.0)
                lon = item.get("lon", 0.0)
                
                # Read genuine real-time maintenance states directly from TfL properties
                status = "ACTIVE"
                for prop in item.get("additionalProperties", []):
                    if prop.get("key") == "InService" and prop.get("value") == "false":
                        status = "MAINTENANCE"
                
                # Strictly map the live API fields into your exact 5-column production schema
                telemetry = {
                    "unit_id": str(unit_id),
                    "latitude": float(lat),
                    "longitude": float(lon),
                    "status": status,
                    "timestamp": current_time
                }
                
                # Save as Newline-Delimited JSON (Foundry standard)
                f.write(json.dumps(telemetry) + "\n")
                records_written += 1
                
        print(f"✅ Success! Ingested {records_written} REAL live London asset tracks from TfL.")
        print(f"👉 Saved straight to production path:\n{output_path}")
        
    except Exception as e:
        print(f"❌ Live API connection failed: {e}")

if __name__ == "__main__":
    fetch_real_london_data()