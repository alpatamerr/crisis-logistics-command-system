import { useMemo, useEffect, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";

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
  center?: { lat: number; lng: number };
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

// ─── MapUpdater: fly to new center when props change ───
function MapUpdater({ center, zoom }: { center?: [number, number]; zoom?: number }) {
  const map = useMap();
  const prevCenter = useRef<[number, number] | undefined>(undefined);

  useEffect(() => {
    if (!center) return;
    // Only fly if center actually changed
    if (
      prevCenter.current &&
      prevCenter.current[0] === center[0] &&
      prevCenter.current[1] === center[1]
    ) {
      return;
    }
    prevCenter.current = center;
    map.flyTo(center, zoom ?? 15, { duration: 0.8 });
  }, [center, zoom, map]);

  return null;
}

// ─── FitBounds component ───
function FitBounds({ incidents, locations }: { incidents: IncidentData[]; locations: LocationData[] }) {
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
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      hasFitted.current = true;
    }
  }, [incidents, locations, map]);

  return null;
}

// ─── Main Component ───
export default function CrisisMap({ incidents, locations, height, center, zoom }: CrisisMapProps) {
  const sortedIncidents = useMemo(
    () =>
      [...incidents].sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severityLevel ?? ""] ?? 9) -
          (SEVERITY_ORDER[b.severityLevel ?? ""] ?? 9)
      ),
    [incidents]
  );

  const mapCenter: [number, number] = center ? [center.lat, center.lng] : LONDON_CENTER;
  const mapZoom = zoom ?? DEFAULT_ZOOM;

  return (
    <div
      style={{
        height: height ?? "100%",
        minHeight: height ?? 520,
        width: "100%",
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid #d3d8de",
        boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
        position: "relative",
      }}
    >
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        style={{ height: "100%", width: "100%" }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        {/* Standard TileLayer — requires imgSrc CSP to include https://*.basemaps.cartocdn.com */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
          maxZoom={19}
          subdomains="abcd"
        />

        {center != null && <MapUpdater center={mapCenter} zoom={mapZoom} />}
        {center == null && <FitBounds incidents={incidents} locations={locations} />}

        {/* Location markers */}
        {locations.map((loc) => {
          if (loc.latitude == null || loc.longitude == null) {
            return null;
          }
          return (
            <CircleMarker
              key={loc.locationId}
              center={[loc.latitude, loc.longitude]}
              radius={5}
              pathOptions={{ color: "#5C7080", fillColor: "#8A9BA8", fillOpacity: 0.4, weight: 1 }}
            >
              <Tooltip direction="top" offset={[0, -5]}>
                <strong>{loc.locationName ?? loc.locationId}</strong><br />
                {loc.category ?? ""}
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* Incident markers */}
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
              pathOptions={{ color: "#fff", fillColor: color, fillOpacity: 0.9, weight: 2.5 }}
            >
              <Popup>
                <div style={{ minWidth: 220 }}>
                  <strong style={{ color, fontSize: 13 }}>{inc.severityLevel}</strong>{" "}
                  — {inc.incidentType}
                  <hr style={{ margin: "6px 0", border: "none", borderTop: "1px solid #e1e8ed" }} />
                  <span style={{ fontSize: 12, color: "#394B59" }}>{inc.description ?? "—"}</span>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          bottom: 28,
          right: 12,
          background: "rgba(255,255,255,0.95)",
          borderRadius: 6,
          padding: "8px 14px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
          zIndex: 1000,
          display: "flex",
          gap: 12,
          alignItems: "center",
          fontSize: 11,
          fontWeight: 500,
        }}
      >
        {Object.entries(SEVERITY_COLORS).map(([label, clr]) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                width: 10, height: 10, borderRadius: "50%", background: clr,
                border: "1.5px solid #fff", boxShadow: "0 0 2px rgba(0,0,0,0.3)", display: "inline-block",
              }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
