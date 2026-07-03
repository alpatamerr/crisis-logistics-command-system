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

function HistogramPanel({ title, items, activeFilter, onFilter }: {
  title: string;
  items: { label: string; count: number; color?: string }[];
  activeFilter: string | null;
  onFilter: (label: string | null) => void;
}) {
  const maxCount = Math.max(...items.map(i => i.count), 1);
  return (
    <div className="filter-panel">
      <h5>{title}</h5>
      {items.map((item) => (
        <div
          key={item.label}
          role="button"
          tabIndex={0}
          className={`histogram-item ${activeFilter === item.label ? "active" : ""}`}
          onClick={() => onFilter(activeFilter === item.label ? null : item.label)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { onFilter(activeFilter === item.label ? null : item.label); } }}
        >
          <span className="histogram-label">{item.label}</span>
          <div className="histogram-bar-container">
            <div
              className="histogram-bar"
              style={{
                width: `${(item.count / maxCount) * 100}%`,
                background: item.color ?? "#2d72d2",
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
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

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

  // Filter incidents by type for the map
  const filteredIncidents = useMemo(() => {
    let data = incidents.data ?? [];
    if (typeFilter) {
      data = data.filter(inc => inc.incidentType === typeFilter);
    }
    return data;
  }, [incidents.data, typeFilter]);

  // Filter locations by category for the map
  const filteredLocations = useMemo(() => {
    let data = locations.data ?? [];
    if (categoryFilter) {
      data = data.filter(loc => loc.category === categoryFilter);
    }
    return data;
  }, [locations.data, categoryFilter]);

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
          activeFilter={typeFilter}
          onFilter={setTypeFilter}
        />

        {/* Center: Map */}
        <div style={{ minHeight: 480 }}>
          <MapErrorBoundary>
            <Suspense fallback={<div style={{ height: 480, display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner /></div>}>
              <CrisisMap incidents={filteredIncidents} locations={filteredLocations} />
            </Suspense>
          </MapErrorBoundary>
        </div>

        {/* Right: CATEGORY filter */}
        <HistogramPanel
          title="Location Category"
          items={categoryHistogram}
          activeFilter={categoryFilter}
          onFilter={setCategoryFilter}
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
