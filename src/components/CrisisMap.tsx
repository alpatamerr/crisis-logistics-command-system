import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MapContainer, CircleMarker, Popup, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { Tag } from "@blueprintjs/core";

// ─── Types ───
interface IncidentData {
  incidentId?: string;
  severityLevel?: string | null;
  incidentType?: string | null;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface LocationData {
  locationId?: string;
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

// ─── Constants ───
const LONDON_CENTER: [number, number] = [51.5, -0.12];
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

// ─── Tile providers (ordered by preference) ───
const TILE_URLS = [
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
];

// ─── Custom fetch-based TileLayer that bypasses CSP img-src ───
// This fetches tiles via fetch() (connect-src) and converts to blob URLs (img-src: blob:)
function createFetchTileLayer(urlTemplate: string): L.TileLayer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FetchTileLayer = (L.TileLayer as any).extend({
    createTile: function (
      this: { getTileUrl(c: L.Coords): string },
      coords: L.Coords,
      done: (err: Error | null, tile: HTMLElement) => void
    ) {
      const tile = document.createElement("img");
      tile.setAttribute("role", "presentation");
      tile.crossOrigin = "anonymous";

      const url = this.getTileUrl(coords);

      fetch(url, { mode: "cors" })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`Tile fetch failed: ${res.status}`);
          }
          return res.blob();
        })
        .then((blob) => {
          tile.src = URL.createObjectURL(blob);
          done(null, tile);
        })
        .catch(() => {
          // Fallback: try loading directly (in case fetch fails but img-src allows it)
          tile.src = url;
          tile.onload = () => done(null, tile);
          tile.onerror = () => done(new Error("Tile load failed"), tile);
        });

      return tile;
    },
  });

  return new FetchTileLayer(urlTemplate, {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    subdomains: "abc",
  });
}

// ─── Component: Adds tile layer with fallback ───
function TileLayerWithFallback() {
  const map = useMap();
  const layerRef = useRef<L.TileLayer | null>(null);
  const providerIndexRef = useRef(0);
  const [, setRetry] = useState(0);

  const addTileLayer = useCallback(
    (index: number) => {
      if (index >= TILE_URLS.length) {
        return;
      }

      // Remove previous layer
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
      }

      const layer = createFetchTileLayer(TILE_URLS[index]);
      layerRef.current = layer;
      layer.addTo(map);

      // Listen for tile errors to try next provider
      let errorCount = 0;
      layer.on("tileerror", () => {
        errorCount++;
        if (errorCount > 3 && index < TILE_URLS.length - 1) {
          providerIndexRef.current = index + 1;
          setRetry((r) => r + 1);
        }
      });
    },
    [map]
  );

  useEffect(() => {
    addTileLayer(providerIndexRef.current);
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
      }
    };
  }, [addTileLayer, map]);

  return null;
}

// ─── Component: FitBounds ───
function FitBounds({
  incidents,
  locations,
}: {
  incidents: IncidentData[];
  locations: LocationData[];
}) {
  const map = useMap();
  const hasFitted = useRef(false);

  useEffect(() => {
    if (hasFitted.current) {
      return;
    }
    const points: [number, number][] = [];
    incidents.forEach((inc) => {
      if (inc.latitude != null && inc.longitude != null) {
        points.push([inc.latitude, inc.longitude]);
      }
    });
    locations.forEach((loc) => {
      if (loc.latitude != null && loc.longitude != null) {
        points.push([loc.latitude, loc.longitude]);
      }
    });
    if (points.length > 1) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
      hasFitted.current = true;
    }
  }, [incidents, locations, map]);

  return null;
}

// ─── Main Component ───
export default function CrisisMap({
  incidents,
  locations,
  height,
  center,
  zoom,
}: CrisisMapProps) {
  const sortedIncidents = useMemo(
    () =>
      [...incidents].sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severityLevel ?? ""] ?? 9) -
          (SEVERITY_ORDER[b.severityLevel ?? ""] ?? 9)
      ),
    [incidents]
  );

  return (
    <div
      style={{
        height: height != null ? height : "100%",
        minHeight: height ?? 520,
        width: "100%",
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid #d3d8de",
        boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
        background: "#dde6e9",
        position: "relative",
      }}
    >
      <MapContainer
        center={center ?? LONDON_CENTER}
        zoom={zoom ?? DEFAULT_ZOOM}
        style={{ height: "100%", width: "100%", background: "#dde6e9" }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayerWithFallback />
        {center == null && (
          <FitBounds incidents={incidents} locations={locations} />
        )}

        {/* Location markers (grey, subtle) */}
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
                {loc.category ?? ""}
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* Incident markers (severity-colored, prominent) */}
        {sortedIncidents.map((inc) => {
          if (inc.latitude == null || inc.longitude == null) {
            return null;
          }
          const color =
            SEVERITY_COLORS[inc.severityLevel ?? ""] ?? "#5C7080";
          return (
            <CircleMarker
              key={inc.incidentId}
              center={[inc.latitude, inc.longitude]}
              radius={10}
              pathOptions={{
                color: "#fff",
                fillColor: color,
                fillOpacity: 0.9,
                weight: 2.5,
              }}
            >
              <Popup>
                <div style={{ minWidth: 220 }}>
                  <strong style={{ color, fontSize: 13 }}>
                    {inc.severityLevel}
                  </strong>{" "}
                  — {inc.incidentType}
                  <hr
                    style={{
                      margin: "6px 0",
                      border: "none",
                      borderTop: "1px solid #e1e8ed",
                    }}
                  />
                  <span style={{ fontSize: 12, color: "#394B59" }}>
                    {inc.description ?? "—"}
                  </span>
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
          background: "rgba(255,255,255,0.95)",
          borderRadius: 6,
          padding: "8px 12px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
          zIndex: 1000,
          display: "flex",
          gap: 10,
          alignItems: "center",
          fontSize: 11,
        }}
      >
        {Object.entries(SEVERITY_COLORS).map(([label, clr]) => (
          <span
            key={label}
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: clr,
                border: "1.5px solid #fff",
                boxShadow: "0 0 2px rgba(0,0,0,0.3)",
                display: "inline-block",
              }}
            />
            <Tag minimal style={{ fontSize: 10 }}>
              {label}
            </Tag>
          </span>
        ))}
      </div>
    </div>
  );
}
