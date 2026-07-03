import { useState, useEffect, useRef, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { Tag } from "@blueprintjs/core";

const LONDON_CENTER: [number, number] = [51.505, -0.09];
const DEFAULT_ZOOM = 12;

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

/**
 * CartoDB Voyager — colorful, labeled, Google Maps-like appearance
 * Shows streets, parks, water, buildings with good contrast
 */
const TILE_PROVIDERS = [
  {
    name: "CartoDB Voyager",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  {
    name: "CartoDB Voyager Labels Under",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  {
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
];

interface IncidentData {
  incidentId: string;
  severityLevel?: string | null;
  incidentType?: string | null;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface LocationData {
  locationId: string;
  locationName?: string | null;
  category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface CrisisMapProps {
  incidents: IncidentData[];
  locations: LocationData[];
  height?: number;
  center?: [number, number];
  zoom?: number;
}

/** Auto-fits map to all visible markers */
function FitBounds({ incidents, locations }: { incidents: IncidentData[]; locations: LocationData[] }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current) {
      return;
    }

    const points: [number, number][] = [];
    for (const inc of incidents) {
      if (inc.latitude != null && inc.longitude != null) {
        points.push([inc.latitude, inc.longitude]);
      }
    }
    for (const loc of locations) {
      if (loc.latitude != null && loc.longitude != null) {
        points.push([loc.latitude, loc.longitude]);
      }
    }

    if (points.length > 1) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
      fitted.current = true;
    } else if (points.length === 1) {
      map.setView(points[0], 13);
      fitted.current = true;
    }
  }, [incidents, locations, map]);

  return null;
}

/** Handles tile load errors and switches to next provider */
function TileErrorHandler({ onError }: { onError: () => void }) {
  const map = useMap();
  const errorCount = useRef(0);

  useEffect(() => {
    const handleTileError = () => {
      errorCount.current += 1;
      if (errorCount.current >= 3) {
        onError();
      }
    };

    map.on("tileerror", handleTileError);
    return () => {
      map.off("tileerror", handleTileError);
    };
  }, [map, onError]);

  return null;
}

export default function CrisisMap({ incidents, locations, height, center, zoom }: CrisisMapProps) {
  const [tileIndex, setTileIndex] = useState(0);
  const [tilesFailed, setTilesFailed] = useState(false);

  const sortedIncidents = useMemo(() => {
    return [...incidents].sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severityLevel ?? ""] ?? 9) -
        (SEVERITY_ORDER[b.severityLevel ?? ""] ?? 9)
    );
  }, [incidents]);

  const handleTileError = () => {
    if (tileIndex < TILE_PROVIDERS.length - 1) {
      setTileIndex((prev) => prev + 1);
    } else {
      setTilesFailed(true);
    }
  };

  const currentProvider = TILE_PROVIDERS[tileIndex];

  return (
    <div
      style={{
        height: height != null ? height : "100%",
        width: "100%",
        borderRadius: 6,
        overflow: "hidden",
        border: "1px solid #ced9e0",
        position: "relative",
        background: "#dde6ed",
      }}
    >
      {tilesFailed && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 50,
            right: 50,
            zIndex: 1000,
            background: "rgba(219, 55, 55, 0.92)",
            borderRadius: 4,
            padding: "8px 14px",
            fontSize: 12,
            color: "#fff",
            textAlign: "center",
            fontWeight: 500,
          }}
        >
          ⚠️ Map tiles could not load. Please add tile domains to CORS/CSP settings.
        </div>
      )}

      <MapContainer
        center={center ?? LONDON_CENTER}
        zoom={zoom ?? DEFAULT_ZOOM}
        style={{ height: "100%", width: "100%", background: "#dde6ed" }}
        zoomControl={true}
      >
        <TileLayer
          key={currentProvider.url}
          url={currentProvider.url}
          attribution={currentProvider.attribution}
          maxZoom={19}
          subdomains="abcd"
        />

        <TileErrorHandler onError={handleTileError} />
        {center == null && <FitBounds incidents={incidents} locations={locations} />}

        {/* Location markers — smaller, grey, behind incidents */}
        {locations.map((loc) => {
          if (loc.latitude == null || loc.longitude == null) {
            return null;
          }
          return (
            <CircleMarker
              key={loc.locationId}
              center={[loc.latitude, loc.longitude]}
              radius={5}
              pathOptions={{
                color: "#5C7080",
                fillColor: "#8A9BA8",
                fillOpacity: 0.4,
                weight: 1,
              }}
            >
              <Tooltip direction="top" offset={[0, -5]}>
                <strong>{loc.locationName ?? loc.locationId}</strong>
                <br />
                <span style={{ fontSize: 11, color: "#5c7080" }}>
                  {loc.category ?? "Location"}
                </span>
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* Incident markers — larger, severity-colored, on top */}
        {sortedIncidents.map((inc) => {
          if (inc.latitude == null || inc.longitude == null) {
            return null;
          }
          const color = SEVERITY_COLORS[inc.severityLevel ?? ""] ?? "#5C7080";
          return (
            <CircleMarker
              key={inc.incidentId}
              center={[inc.latitude, inc.longitude]}
              radius={10}
              pathOptions={{
                color: "#fff",
                fillColor: color,
                fillOpacity: 0.85,
                weight: 2,
              }}
            >
              <Popup>
                <div style={{ minWidth: 220 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: color,
                        display: "inline-block",
                      }}
                    />
                    <strong>{inc.severityLevel ?? "Unknown"}</strong>
                    <span style={{ color: "#5c7080", fontSize: 12 }}>
                      {inc.incidentType ?? ""}
                    </span>
                  </div>
                  <hr
                    style={{
                      margin: "6px 0",
                      border: "none",
                      borderTop: "1px solid #e1e8ed",
                    }}
                  />
                  <p style={{ fontSize: 12, margin: 0, color: "#394b59" }}>
                    {inc.description ?? "No description available"}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Severity Legend */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          right: 12,
          zIndex: 1000,
          background: "rgba(255,255,255,0.95)",
          borderRadius: 6,
          padding: "8px 12px",
          display: "flex",
          gap: 12,
          alignItems: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
          border: "1px solid #e1e8ed",
        }}
      >
        {Object.entries(SEVERITY_COLORS).map(([label, color]) => (
          <Tag
            key={label}
            minimal
            style={{
              background: color,
              color: "#fff",
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {label}
          </Tag>
        ))}
      </div>
    </div>
  );
}
