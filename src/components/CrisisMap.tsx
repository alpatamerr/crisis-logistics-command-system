import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from "react-leaflet";
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

const SEVERITY_ORDER: Record<string, number> = {
  Severe: 0,
  Serious: 1,
  Moderate: 2,
  Minimal: 3,
};

const TILE_PROVIDERS = [
  {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
];

export default function CrisisMap() {
  const incidents = useOsdkObjects(LiveIncident, { pageSize: 200 });
  const locations = useOsdkObjects(LiveLocation, { pageSize: 200 });

  const sortedIncidents = [...(incidents.data ?? [])].sort(
    (a, b) => (SEVERITY_ORDER[b.severityLevel ?? ""] ?? 9) - (SEVERITY_ORDER[a.severityLevel ?? ""] ?? 9)
  );

  return (
    <div style={{
      height: 500,
      borderRadius: 8,
      overflow: "hidden",
      border: "1px solid #d3d8de",
      boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      background: "#e8ecf0",
    }}>
      <MapContainer
        center={WEST_LONDON_CENTER}
        zoom={ZOOM}
        style={{ height: "100%", width: "100%", background: "#e8ecf0" }}
        zoomControl={true}
      >
        <TileLayer url={TILE_PROVIDERS[0].url} attribution={TILE_PROVIDERS[0].attribution} />

        {(locations.data ?? []).map((loc) => {
          if (loc.latitude == null || loc.longitude == null) {
            return null;
          }
          return (
            <CircleMarker
              key={loc.locationId}
              center={[loc.latitude, loc.longitude]}
              radius={5}
              pathOptions={{ color: "#8C9DA6", fillColor: "#8C9DA6", fillOpacity: 0.35, weight: 1 }}
            >
              <Tooltip direction="top" offset={[0, -5]}>
                <strong>{loc.locationName ?? loc.locationId}</strong><br />
                {loc.category ?? ""}
              </Tooltip>
            </CircleMarker>
          );
        })}

        {sortedIncidents.map((inc) => {
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
                <div style={{ minWidth: 200 }}>
                  <strong style={{ color }}>{inc.severityLevel}</strong> — {inc.incidentType}
                  <hr style={{ margin: "6px 0", border: "none", borderTop: "1px solid #e1e8ed" }} />
                  <span style={{ fontSize: 12 }}>{inc.description ?? "—"}</span>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
