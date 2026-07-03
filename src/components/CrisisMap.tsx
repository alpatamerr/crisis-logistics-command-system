import { useMemo, useEffect, useRef, useCallback, useState } from "react";
import {
  APIProvider,
  Map,
  useMap,
  Marker,
  InfoWindow,
} from "@vis.gl/react-google-maps";

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
const LONDON_CENTER = { lat: 51.5, lng: -0.12 };
const DEFAULT_ZOOM = 12;
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

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

// ─── SVG marker icon creator ───
function createSvgMarkerUrl(color: string, size: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${color}" stroke="white" stroke-width="2.5"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const LOCATION_ICON_URL = createSvgMarkerUrl("#8A9BA8", 12);

// ─── FitBounds component ───
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
    if (!map || hasFitted.current) {
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    incidents.forEach((inc) => {
      if (inc.latitude != null && inc.longitude != null) {
        bounds.extend({ lat: inc.latitude, lng: inc.longitude });
        hasPoints = true;
      }
    });
    locations.forEach((loc) => {
      if (loc.latitude != null && loc.longitude != null) {
        bounds.extend({ lat: loc.latitude, lng: loc.longitude });
        hasPoints = true;
      }
    });

    if (hasPoints) {
      map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
      hasFitted.current = true;
    }
  }, [map, incidents, locations]);

  return null;
}

// ─── Incident marker with InfoWindow ───
function IncidentMarker({ inc }: { inc: IncidentData }) {
  const [open, setOpen] = useState(false);

  const color = SEVERITY_COLORS[inc.severityLevel ?? ""] ?? "#5C7080";
  const iconUrl = useMemo(() => createSvgMarkerUrl(color, 22), [color]);

  const handleClick = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  if (inc.latitude == null || inc.longitude == null) {
    return null;
  }

  const position = { lat: inc.latitude, lng: inc.longitude };

  return (
    <>
      <Marker
        position={position}
        title={`${inc.severityLevel} — ${inc.incidentType}`}
        onClick={handleClick}
        icon={{
          url: iconUrl,
          scaledSize: new google.maps.Size(22, 22),
          anchor: new google.maps.Point(11, 11),
        }}
      />

      {open && (
        <InfoWindow position={position} onCloseClick={handleClose}>
          <div style={{ minWidth: 220, padding: 4 }}>
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
        </InfoWindow>
      )}
    </>
  );
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

  const mapCenter = center ?? LONDON_CENTER;
  const mapZoom = zoom ?? DEFAULT_ZOOM;

  if (!API_KEY) {
    return (
      <div
        style={{
          height: height ?? 520,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#e8ecf0",
          borderRadius: 8,
          border: "1px solid #d3d8de",
          color: "#5C7080",
          fontSize: 14,
        }}
      >
        Google Maps API key not configured
      </div>
    );
  }

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
      <APIProvider apiKey={API_KEY}>
        <Map
          defaultCenter={mapCenter}
          defaultZoom={mapZoom}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: "100%", height: "100%" }}
        >
          {center == null && (
            <FitBounds incidents={incidents} locations={locations} />
          )}

          {/* Location markers (small grey dots) */}
          {locations.map((loc) => {
            if (loc.latitude == null || loc.longitude == null) {
              return null;
            }
            return (
              <Marker
                key={loc.locationId}
                position={{ lat: loc.latitude, lng: loc.longitude }}
                title={loc.locationName ?? loc.locationId ?? ""}
                icon={{
                  url: LOCATION_ICON_URL,
                  scaledSize: new google.maps.Size(12, 12),
                  anchor: new google.maps.Point(6, 6),
                }}
                opacity={0.5}
              />
            );
          })}

          {/* Incident markers (severity-colored circles) */}
          {sortedIncidents.map((inc) => (
            <IncidentMarker key={inc.incidentId} inc={inc} />
          ))}
        </Map>
      </APIProvider>

      {/* Severity Legend */}
      <div
        style={{
          position: "absolute",
          bottom: 28,
          right: 60,
          background: "rgba(255,255,255,0.95)",
          borderRadius: 6,
          padding: "8px 14px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
          zIndex: 1,
          display: "flex",
          gap: 12,
          alignItems: "center",
          fontSize: 11,
          fontWeight: 500,
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
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
