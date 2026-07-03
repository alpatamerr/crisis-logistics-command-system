import { lazy, Suspense, useMemo, useState, Component, type ReactNode } from "react";
import { Card, Tag, Intent, Spinner, Callout, Icon } from "@blueprintjs/core";
import { useOsdkObjects } from "@osdk/react/experimental";
import { LiveIncident, LiveLocation, LineStatus, CrisisResource, LiveTransportUnit } from "@crisis-logistics-command-app/sdk";

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

export default function Dashboard() {
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set());
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set());

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

  const incidents = useOsdkObjects(LiveIncident, { pageSize: 200 });
  const locations = useOsdkObjects(LiveLocation, { pageSize: 200 });
  const disrupted = useOsdkObjects(LineStatus, { where: { isDisrupted: { $eq: true } }, pageSize: 100 });
  const resources = useOsdkObjects(CrisisResource, { pageSize: 100 });
  const units = useOsdkObjects(LiveTransportUnit, { pageSize: 200 });

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

  // Filter incidents by selected types for the map
  const filteredIncidents = useMemo(() => {
    const data = incidents.data ?? [];
    if (typeFilters.size === 0) {
      return data;
    }
    return data.filter(inc => typeFilters.has(inc.incidentType ?? "Unknown"));
  }, [incidents.data, typeFilters]);

  // Filter locations by selected categories for the map
  const filteredLocations = useMemo(() => {
    const data = locations.data ?? [];
    if (categoryFilters.size === 0) {
      return data;
    }
    return data.filter(loc => categoryFilters.has(loc.category ?? "Unknown"));
  }, [locations.data, categoryFilters]);

  // Metrics
  const incidentCount = incidents.data?.length ?? 0;
  const disruptedCount = disrupted.data?.length ?? 0;
  const lowResources = (resources.data ?? []).filter(
    r => (r.quantityUnits ?? 0) < (r.criticalThreshold ?? 0)
  ).length;
  const unitCount = units.data?.length ?? 0;

  const hasError = incidents.error || disrupted.error || resources.error || units.error;

  return (
    <div>
      {hasError && (
        <Callout intent={Intent.DANGER} title="Data Fetch Error" style={{ marginBottom: 12 }}>
          Some data could not be loaded. Please check your connection.
        </Callout>
      )}

      {/* 3-column layout: Filter | Map | Filter */}
      <div className="split-layout split-layout-3-col" style={{ marginBottom: 16 }}>
        {/* Left: TYPE filter */}
        <HistogramPanel
          title="Incident Type"
          items={typeHistogram}
          activeFilters={typeFilters}
          onToggle={toggleTypeFilter}
          onClear={() => setTypeFilters(new Set())}
        />

        {/* Center: Map */}
        <div style={{ minHeight: 520, height: "100%" }}>
          <MapErrorBoundary>
            <Suspense fallback={<div style={{ height: 520, display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner /></div>}>
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
