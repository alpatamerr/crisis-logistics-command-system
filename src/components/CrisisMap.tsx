import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { useOsdkObjects } from "@osdk/react/experimental";
import { LiveIncident, LiveLocation } from "@crisis-logistics-command-app/sdk";


const WEST_LONDON_CENTER: [number, number] = [51.49, -0.35];
const ZOOM = 12;

const SEVERITY_COLORS: Record<string, string> = {
  Severe: "#DB3737",
  Serious: "#D9822B",
  Moderate: "#2D72D2",
  Minimal: "#0D8050",
};

export default function CrisisMap() {
  const incidents = useOsdkObjects(LiveIncident, { pageSize: 200 });
  const locations = useOsdkObjects(LiveLocation, { pageSize: 200 });

  return (
    <div style={{ height: 500, borderRadius: 8, overflow: "hidden", border: "1px solid #d3d8de", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
      <MapContainer center={WEST_LONDON_CENTER} zoom={ZOOM} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {(locations.data ?? []).map((loc) => {
          if (loc.latitude == null || loc.longitude == null) {
            return null;
          }
          return (
            <CircleMarker
              key={loc.locationId}
              center={[loc.latitude, loc.longitude]}
              radius={5}
              pathOptions={{ color: "#8C9DA6", fillColor: "#8C9DA6", fillOpacity: 0.4, weight: 1 }}
            >
              <Popup>
                <strong>{loc.locationName ?? loc.locationId}</strong>
                <br />
                {loc.category ?? "—"}
              </Popup>
            </CircleMarker>
          );
        })}

        {(incidents.data ?? []).map((inc) => {
          if (inc.latitude == null || inc.longitude == null) {
            return null;
          }
          const color = SEVERITY_COLORS[inc.severityLevel ?? ""] ?? "#5C7080";
          return (
            <CircleMarker
              key={inc.incidentId}
              center={[inc.latitude, inc.longitude]}
              radius={9}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.8, weight: 2 }}
            >
              <Popup>
                <strong>{inc.severityLevel}</strong> — {inc.incidentType}
                <br />
                {inc.description ?? "—"}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
