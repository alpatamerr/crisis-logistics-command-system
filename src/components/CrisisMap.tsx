import { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from "react-leaflet";
import { Icon, Tag } from "@blueprintjs/core";

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

// Multiple tile providers — cycle through on CSP errors
const TILE_PROVIDERS = [
  {
    name: "CartoDB",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  {
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
];

interface IncidentData {
  incidentId: string;
  latitude?: number | null;
  longitude?: number | null;
  severityLevel?: string | null;
  incidentType?: string | null;
  description?: string | null;
}

interface LocationData {
  locationId: string;
  latitude?: number | null;
  longitude?: number | null;
  locationName?: string | null;
  category?: string | null;
}

interface CrisisMapProps {
  incidents?: IncidentData[];
  locations?: LocationData[];
  height?: number;
  center?: [number, number];
  zoom?: number;
}

// Component to track tile load errors and try next provider
function TileErrorHandler({ onError }: { onError: () => void }) {
  const map = useMap();
  const errorCountRef = useRef(0);

  useEffect(() => {
    const handleError = () => {
      errorCountRef.current += 1;
      // If many tiles fail, switch provider
      if (errorCountRef.current >= 3) {
        onError();
      }
    };

    map.on("tileerror", handleError);
    return () => { map.off("tileerror", handleError); };
  }, [map, onError]);

  return null;
}

export default function CrisisMap({
  incidents = [],
  locations = [],
  height = 480,
  center = WEST_LONDON_CENTER,
  zoom = ZOOM,
}: CrisisMapProps) {
  const [tileIndex, setTileIndex] = useState(0);
  const [allTilesFailed, setAllTilesFailed] = useState(false);

  const sortedIncidents = [...incidents].sort(
    (a, b) => (SEVERITY_ORDER[b.severityLevel ?? ""] ?? 9) - (SEVERITY_ORDER[a.severityLevel ?? ""] ?? 9)
  );

  const handleTileError = () => {
    if (tileIndex < TILE_PROVIDERS.length - 1) {
      setTileIndex(prev => prev + 1);
    } else {
      setAllTilesFailed(true);
    }
  };

  const currentProvider = TILE_PROVIDERS[tileIndex];

  return (
    <div style={{
      height,
      borderRadius: 6,
      overflow: "hidden",
      border: "1px solid #e1e8ed",
      background: "#e8ecf0",
      position: "relative",
    }}>
      {allTilesFailed && (
        <div style={{
          position: "absolute",
          top: 8,
          left: 8,
          right: 8,
          zIndex: 1000,
          background: "rgba(255,255,255,0.95)",
          padding: "6px 10px",
          borderRadius: 4,
          fontSize: 11,
          color: "#5c7080",
          display: "flex",
          alignItems: "center",
          gap: 6,
          boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
        }}>
          <Icon icon="info-sign" size={12} />
          Map tiles blocked by CSP. Markers are still visible on the grid below.
        </div>
      )}
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", width: "100%", background: "#e8ecf0" }}
        zoomControl={true}
      >
        <TileLayer
          key={currentProvider.url}
          url={currentProvider.url}
          attribution={currentProvider.attribution}
        />
        <TileErrorHandler onError={handleTileError} />

        {locations.map((loc) => {
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
                <div style={{ minWidth: 180 }}>
                  <strong style={{ color }}>{inc.severityLevel}</strong> — {inc.incidentType}
                  <hr style={{ margin: "6px 0", border: "none", borderTop: "1px solid #e1e8ed" }} />
                  <span style={{ fontSize: 12 }}>{inc.description ?? "—"}</span>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Legend */}
      <div style={{
        position: "absolute",
        bottom: 8,
        right: 8,
        zIndex: 1000,
        background: "rgba(255,255,255,0.92)",
        padding: "8px 10px",
        borderRadius: 4,
        fontSize: 11,
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        display: "flex",
        gap: 10,
      }}>
        {Object.entries(SEVERITY_COLORS).map(([sev, col]) => (
          <span key={sev} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: col, display: "inline-block" }} />
            <Tag minimal style={{ fontSize: 10, padding: "0 4px" }}>{sev}</Tag>
          </span>
        ))}
      </div>
    </div>
  );
}
