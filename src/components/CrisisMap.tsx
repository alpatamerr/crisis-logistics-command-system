import { useMemo, useEffect, useRef, useCallback, useState } from "react";
import {
  APIProvider,
  Map,
  useMap,
  AdvancedMarker,
  InfoWindow,
  useAdvancedMarkerRef,
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
      map.fitBounds(bounds, { top: 30, right: 30, bottom: 30, left: 30 });
      hasFitted.current = true;
    }
  }, [map, incidents, locations]);

  return null;
}

// ─── Location dot marker ───
function LocationDot({ loc }: { loc: LocationData }) {
  if (loc.latitude == null || loc.longitude == null) {
    return null;
  }
  return (
    <AdvancedMarker
      position={{ lat: loc.latitude, lng: loc.longitude }}
      title={loc.locationName ?? loc.locationId ?? ""}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: "#8A9BA8",
          opacity: 0.45,
          border: "1px solid #5C7080",
        }}
      />
    </AdvancedMarker>
  );
}

// ─── Incident marker with InfoWindow ───
function IncidentMarker({ inc }: { inc: IncidentData }) {
  const [open, setOpen] = useState(false);
  const [markerRef, marker] = useAdvancedMarkerRef();

  const color = SEVERITY_COLORS[inc.severityLevel ?? ""] ?? "#5C7080";

  const handleClick = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  if (inc.latitude == null || inc.longitude == null) {
    return null;
  }

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: inc.latitude, lng: inc.longitude }}
        title={`${inc.severityLevel} — ${inc.incidentType}`}
        onClick={handleClick}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: color,
            border: "2.5px solid #fff",
            boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
            cursor: "pointer",
          }}
        />
      </AdvancedMarker>

      {open && marker && (
        <InfoWindow anchor={marker} onCloseClick={handleClose}>
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
        Google Maps API key not configured (VITE_GOOGLE_MAPS_API_KEY)
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
          mapId="crisis-map"
          style={{ width: "100%", height: "100%" }}
        >
          {center == null && (
            <FitBounds incidents={incidents} locations={locations} />
          )}

          {/* Location markers (grey dots) */}
          {locations.map((loc) => (
            <LocationDot key={loc.locationId} loc={loc} />
          ))}

          {/* Incident markers (severity-colored) */}
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
