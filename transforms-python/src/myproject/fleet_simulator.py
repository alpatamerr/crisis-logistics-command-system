import os
import time
import random
import json
from datetime import datetime, timezone, timedelta

# 1. Coordinate anchors for actual London logistics hubs
LONDON_HUBS = {
    "Chiswick_Main_Hub": (51.4914, -0.2681),
    "Heathrow_Cargo_Depot": (51.4700, -0.4543),
    "Stratford_Distribution": (51.5417, -0.0036),
    "City_Logistics_Center": (51.5128, -0.0918),
    "Croydon_South_Gateway": (51.3762, -0.0982),
    "Wembley_Fulfillment": (51.5560, -0.2796)
}

class TransportUnit:
    def __init__(self, unit_id):
        self.unit_id = unit_id
        self.spawn_new_route()

    def spawn_new_route(self):
        hubs = list(LONDON_HUBS.keys())
        self.start_hub, self.dest_hub = random.sample(hubs, 2)
        self.lat, self.lon = LONDON_HUBS[self.start_hub]
        self.dest_lat, self.dest_lon = LONDON_HUBS[self.dest_hub]
        self.status = "EN_ROUTE"
        self.step_size = random.uniform(0.0008, 0.0015)

    def update_position(self):
        if self.status == "ARRIVED":
            self.spawn_new_route()
            return

        d_lat = self.dest_lat - self.lat
        d_lon = self.dest_lon - self.lon
        total_distance = (d_lat**2 + d_lon**2)**0.5

        if total_distance <= self.step_size:
            self.lat, self.lon = self.dest_lat, self.dest_lon
            self.status = "ARRIVED"
        else:
            self.lat += (d_lat / total_distance) * self.step_size
            self.lon += (d_lon / total_distance) * self.step_size
            self.lat += random.uniform(-0.0001, 0.0001)
            self.lon += random.uniform(-0.0001, 0.0001)

    def generate_telemetry(self, current_time):
        return {
            "unit_id": self.unit_id,
            "latitude": round(self.lat, 5),
            "longitude": round(self.lon, 5),
            "status": self.status,
            "timestamp": current_time.isoformat(timespec='seconds')
        }

def generate_mock_dataset(num_vehicles=4, total_ticks=100, output_filename="raw_transport_units.json"):
    """Generates a fixed history batch and drops it outside the src directory."""
    
    # Dynamically locate the project root folder (2 levels up from src/myproject/)
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    mock_data_dir = os.path.join(base_dir, "test_resources")
    os.makedirs(mock_data_dir, exist_ok=True)
    
    output_path = os.path.join(mock_data_dir, output_filename)
    
    print(f"🚀 Simulating {num_vehicles} units over {total_ticks} timeline ticks...")
    fleet = [TransportUnit(unit_id=f"TX-{1000 + i}") for i in range(num_vehicles)]
    
    sim_time = datetime.now(timezone.utc)
    records_written = 0

    with open(output_path, "w") as f:
        for _ in range(total_ticks):
            sim_time += timedelta(seconds=15)  # Advance time step by step
            for unit in fleet:
                unit.update_position()
                telemetry = unit.generate_telemetry(sim_time)
                
                # Write each JSON object as a newline-delimited row (Foundry standard)
                f.write(json.dumps(telemetry) + "\n")
                records_written += 1

    print(f"✨ Success! Saved {records_written} data rows to:\n👉 {output_path}")

if __name__ == "__main__":
    # Generates a solid test batch of historical telemetry
    generate_mock_dataset(num_vehicles=5, total_ticks=100)