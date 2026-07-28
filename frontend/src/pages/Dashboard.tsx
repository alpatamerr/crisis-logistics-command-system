import { lazy, Suspense, useMemo, useState, useEffect, useRef, Component, type ReactNode } from "react";
import { Card, Tag, Intent, Spinner, Callout, Icon, Button, ButtonGroup } from "@blueprintjs/core";
import { notifySevereIncident } from "../utils/notifications";
import { useOsdkObjects } from "@osdk/react/experimental";
import { LiveIncident, LiveLocation, LineStatus, CrisisResource, LiveTransportUnit, IncidentTrend } from "@crisis-logistics-command-app/sdk";

const CrisisMap = lazy(() => import("@/components/CrisisMap"));

class MapErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="map-fallback" style={{ height: 500 }}>
          <Icon icon="map" size={32} />
          <span>Map could not be loaded</span>
        </div>
      );
    }
    return this.props.children;
  }
}

function HistogramPanel({ title, items, activeFilters, onToggle, onClear }: {
  title: string;
  items: { label: string; count: number; color?: string }[];
  activeFilters: Set<string>;
  onToggle: (label: string) => void;
  onClear: () => void;
}) {
  const maxCount = Math.max(...items.map(i => i.count), 1);
  return (
    <div className="filter-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h5 style={{ margin: 0 }}>{title}</h5>
        {activeFilters.size > 0 && (
          <Tag minimal interactive intent={Intent.PRIMARY} onClick={onClear} style={{ fontSize: 10 }}>
            Clear ({activeFilters.size})
          </Tag>
        )}
      </div>
      {items.map((item) => (
        <div
          key={item.label}
          role="button"
          tabIndex={0}
          className={`histogram-item ${activeFilters.has(item.label) ? "active" : ""}`}
          onClick={() => onToggle(item.label)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { onToggle(item.label); } }}
        >
          <span className="histogram-label">{item.label}</span>
          <div className="histogram-bar-container">
            <div
              className="histogram-bar"
              style={{
                width: `${(item.count / maxCount) * 100}%`,
                background: activeFilters.size === 0 || activeFilters.has(item.label) ? (item.color ?? "#2d72d2") : "#d8e1e8",
              }}
            />
          </div>
          <span className="histogram-count">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ title, value, intent, icon, loading }: {
  title: string;
  value: string | number;
  intent: Intent;
  icon: "warning-sign" | "train" | "inbox" | "drive-time";
  loading: boolean;
}) {
  return (
    <Card className="metric-card" elevation={0}>
      <div className="metric-value">
        {loading ? <Spinner size={20} /> : <Tag large minimal intent={intent}>{value}</Tag>}
      </div>
      <div className="metric-title">
        <Icon icon={icon} size={12} style={{ marginRight: 4, opacity: 0.6 }} />
        {title}
      </div>
    </Card>
  );
}

const SEVERITY_LEVELS = ["Severe", "Serious", "Moderate", "Minimal"];
const SEVERITY_COLORS: Record<string, Intent> = {
  Severe: Intent.DANGER,
  Serious: Intent.WARNING,
  Moderate: Intent.PRIMARY,
  Minimal: Intent.NONE,
};

type TimeRange = "all" | "1h" | "6h" | "24h" | "7d";
const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
];

function getTimeThreshold(range: TimeRange): number {
  const now = Date.now();
  switch (range) {
    case "1h": return now - 3600000;
    case "6h": return now - 21600000;
    case "24h": return now - 86400000;
    case "7d": return now - 604800000;
    default: return 0;
  }
}

export default function Dashboard() {
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set());
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set());
  const [severityFilters, setSeverityFilters] = useState<Set<string>>(new Set());
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  const toggleTypeFilter = (label: string) => {
    setTypeFilters(prev => {
      const next = new Set(prev);
      if (next.has(label)) { next.delete(label); } else { next.add(label); }
      return next;
    });
  };
  const toggleCategoryFilter = (label: string) => {
    setCategoryFilters(prev => {
      const next = new Set(prev);
      if (next.has(label)) { next.delete(label); } else { next.add(label); }
      return next;
    });
  };
  const toggleSeverityFilter = (sev: string) => {
    setSeverityFilters(prev => {
      const next = new Set(prev);
      if (next.has(sev)) { next.delete(sev); } else { next.add(sev); }
      return next;
    });
  };

  const incidents = useOsdkObjects(LiveIncident, { pageSize: 200 });
  const locations = useOsdkObjects(LiveLocation, { pageSize: 200 });
  const disrupted = useOsdkObjects(LineStatus, { where: { isDisrupted: { $eq: true } }, pageSize: 100 });
  const resources = useOsdkObjects(CrisisResource, { pageSize: 100 });
  const units = useOsdkObjects(LiveTransportUnit, { pageSize: 200 });
  const trends = useOsdkObjects(IncidentTrend, { pageSize: 30 });

  // Anomaly detection: compare latest day's total to 7-day average
  const anomaly = useMemo(() => {
    const data = trends.data ?? [];
    if (data.length < 4) { return null; }

    // Aggregate incidentCount by date
    const byDate = new Map<string, number>();
    data.forEach(t => {
      const d = String(t.incidentDate ?? "");
      if (!d) { return; }
      byDate.set(d, (byDate.get(d) ?? 0) + Number(t.incidentCount ?? 0));
    });

    const sortedDays = [...byDate.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]));

    if (sortedDays.length < 3) { return null; }

    const [latestDate, latestCount] = sortedDays[0];
    const previousDays = sortedDays.slice(1, 8);
    const avg = previousDays.reduce((sum, [, c]) => sum + c, 0) / previousDays.length;

    if (avg <= 0) { return null; }
    const ratio = latestCount / avg;

    if (ratio >= 1.8) {
      return { type: "SPIKE" as const, ratio: Math.round(ratio * 10) / 10, count: latestCount, avg: Math.round(avg), date: latestDate };
    }
    if (ratio <= 0.4 && latestCount > 0) {
      return { type: "DROP" as const, ratio: Math.round(ratio * 10) / 10, count: latestCount, avg: Math.round(avg), date: latestDate };
    }
    return null;
  }, [trends.data]);

  // Notify on new severe incidents
  const prevSevereCount = useRef(0);
  useEffect(() => {
    const severeCount = (incidents.data ?? []).filter(i => i.severityLevel === "Severe").length;
    if (severeCount > prevSevereCount.current && prevSevereCount.current > 0) {
      notifySevereIncident(severeCount);
    }
    prevSevereCount.current = severeCount;
  }, [incidents.data]);

  // Compute TYPE histogram from incidents
  const typeHistogram = useMemo(() => {
    const counts: Record<string, number> = {};
    (incidents.data ?? []).forEach((inc) => {
      const t = inc.incidentType ?? "Unknown";
      counts[t] = (counts[t] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count, color: "#2d72d2" }));
  }, [incidents.data]);

  // Compute CATEGORY histogram from locations
  const categoryHistogram = useMemo(() => {
    const counts: Record<string, number> = {};
    (locations.data ?? []).forEach((loc) => {
      const c = loc.category ?? "Unknown";
      counts[c] = (counts[c] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count, color: "#5c7080" }));
  }, [locations.data]);

  // Filter incidents by type + severity + time range for the map
  const filteredIncidents = useMemo(() => {
    let data = incidents.data ?? [];
    if (typeFilters.size > 0) {
      data = data.filter(inc => typeFilters.has(inc.incidentType ?? "Unknown"));
    }
    if (severityFilters.size > 0) {
      data = data.filter(inc => severityFilters.has(inc.severityLevel ?? ""));
    }
    if (timeRange !== "all") {
      const threshold = getTimeThreshold(timeRange);
      data = data.filter(inc => {
        const ts = inc.polledAt != null ? new Date(inc.polledAt).getTime() : 0;
        return ts >= threshold;
      });
    }
    return data;
  }, [incidents.data, typeFilters, severityFilters, timeRange]);

  // Filter locations by selected categories for the map
  const filteredLocations = useMemo(() => {
    const data = locations.data ?? [];
    if (categoryFilters.size === 0) {
      return data;
    }
    return data.filter(loc => categoryFilters.has(loc.category ?? "Unknown"));
  }, [locations.data, categoryFilters]);

  // Metrics
  const incidentCount = filteredIncidents.length;
  const disruptedCount = disrupted.data?.length ?? 0;
  const lowResourcesList = (resources.data ?? []).filter(
    r => (r.quantityUnits ?? 0) < (r.criticalThreshold ?? 0)
  );
  const lowResources = lowResourcesList.length;
  const unitCount = units.data?.length ?? 0;

  const hasError = incidents.error || disrupted.error || resources.error || units.error;
  const activeFilterCount = typeFilters.size + categoryFilters.size + severityFilters.size + (timeRange !== "all" ? 1 : 0);

  return (
    <div>
      {hasError && (
        <Callout intent={Intent.DANGER} title="Data Fetch Error" style={{ marginBottom: 12 }}>
          Some data could not be loaded. Please check your connection.
        </Callout>
      )}

      {/* ─── Anomaly Alert Banner ─── */}
      {anomaly && (
        <Callout
          intent={anomaly.type === "SPIKE" ? Intent.DANGER : Intent.PRIMARY}
          icon={anomaly.type === "SPIKE" ? "warning-sign" : "trending-down"}
          style={{ marginBottom: 12, fontWeight: 500 }}
        >
          <strong>⚠️ {anomaly.type} DETECTED:</strong>{" "}
          {anomaly.type === "SPIKE"
            ? `Today's incidents (${anomaly.count}) are ${anomaly.ratio}x above the 7-day average (${anomaly.avg}). Consider additional resources.`
            : `Today's incidents (${anomaly.count}) are significantly below the 7-day average (${anomaly.avg}).`
          }
        </Callout>
      )}

      {/* ─── Low Stock Alert Banner ─── */}
      {lowResources > 0 && (
        <Callout
          intent={Intent.WARNING}
          icon="inbox"
          style={{ marginBottom: 12, fontWeight: 500 }}
        >
          <strong>📦 LOW STOCK ALERT:</strong>{" "}
          {lowResources === 1
            ? `${lowResourcesList[0].resourceType ?? "A resource"} is below its critical threshold (${lowResourcesList[0].quantityUnits ?? 0} of ${lowResourcesList[0].criticalThreshold ?? 0} units). Restock recommended.`
            : `${lowResources} resources are below their critical thresholds. Check the Resources tab to restock.`
          }
        </Callout>
      )}

      {/* ─── Filter Bar: Severity chips + Time range ─── */}
      <Card style={{ marginBottom: 12, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap", position: "relative" }}>
        {/* Severity filter chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#5c7080", marginRight: 4 }}>Severity:</span>
          {SEVERITY_LEVELS.map(sev => (
            <Tag
              key={sev}
              interactive
              intent={severityFilters.has(sev) ? SEVERITY_COLORS[sev] : Intent.NONE}
              minimal={!severityFilters.has(sev)}
              onClick={() => toggleSeverityFilter(sev)}
              style={{ cursor: "pointer", fontSize: 11 }}
            >
              {sev}
            </Tag>
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: "#d8e1e8" }} />

        {/* Time range */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#5c7080", marginRight: 4 }}>
            <Icon icon="time" size={12} /> Time:
          </span>
          <ButtonGroup minimal>
            {TIME_RANGES.map(tr => (
              <Button
                key={tr.value}
                text={tr.label}
                small
                active={timeRange === tr.value}
                intent={timeRange === tr.value ? Intent.PRIMARY : Intent.NONE}
                onClick={() => setTimeRange(tr.value)}
              />
            ))}
          </ButtonGroup>
        </div>

        {/* Active filter count + Clear all — absolutely positioned so center doesn't shift */}
        {activeFilterCount > 0 && (
          <Button
            small
            minimal
            intent={Intent.WARNING}
            icon="filter-remove"
            text={`Clear all (${activeFilterCount})`}
            style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)" }}
            onClick={() => {
              setTypeFilters(new Set());
              setCategoryFilters(new Set());
              setSeverityFilters(new Set());
              setTimeRange("all");
            }}
          />
        )}
      </Card>

      {/* 3-column layout: Filter | Map | Filter */}
      <div className="split-layout split-layout-3-col" style={{ marginBottom: 16, height: "calc(100vh - 320px)", minHeight: 360, overflow: "hidden" }}>
        {/* Left: TYPE filter */}
        <HistogramPanel
          title="Incident Type"
          items={typeHistogram}
          activeFilters={typeFilters}
          onToggle={toggleTypeFilter}
          onClear={() => setTypeFilters(new Set())}
        />

        {/* Center: Map */}
        <div style={{ height: "100%", overflow: "hidden", borderRadius: 6, border: "1px solid #e1e8ed" }}>
          <MapErrorBoundary>
            <Suspense fallback={<div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner /></div>}>
              <CrisisMap incidents={filteredIncidents} locations={filteredLocations} />
            </Suspense>
          </MapErrorBoundary>
        </div>

        {/* Right: CATEGORY filter */}
        <HistogramPanel
          title="Location Category"
          items={categoryHistogram}
          activeFilters={categoryFilters}
          onToggle={toggleCategoryFilter}
          onClear={() => setCategoryFilters(new Set())}
        />
      </div>

      {/* Bottom: 4 metric cards */}
      <div className="metrics-grid">
        <MetricCard title="Active Incidents" value={incidentCount} intent={Intent.DANGER} icon="warning-sign" loading={incidents.isLoading} />
        <MetricCard title="Disrupted Lines" value={disruptedCount} intent={Intent.WARNING} icon="train" loading={disrupted.isLoading} />
        <MetricCard title="Low Resources" value={lowResources} intent={lowResources > 0 ? Intent.DANGER : Intent.SUCCESS} icon="inbox" loading={resources.isLoading} />
        <MetricCard title="Transport Units" value={unitCount} intent={Intent.PRIMARY} icon="drive-time" loading={units.isLoading} />
      </div>
    </div>
  );
}
