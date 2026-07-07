import { useMemo, useState } from "react";
import { Card, Spinner, HTMLTable, Tag, Intent, Callout, Icon } from "@blueprintjs/core";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useOsdkObjects } from "@osdk/react/experimental";
import { TravelTime, JourneyPlan, AirQuality, IncidentTrend, PeakHourHeatmap, TransportHotspot, LiveLocation } from "@crisis-logistics-command-app/sdk";
import Pagination from "@/components/Pagination";
import FilterBar, { FilterSection, FilterOption } from "@/components/FilterBar";

type SortDir = "asc" | "desc";
const DEFAULT_PAGE_SIZE = 25;
const ANALYTICS_PAGE_SIZE = 10;

// ─── Loading Skeleton ───
function Skeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ padding: 16 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 12, marginBottom: 10 }}>
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              style={{
                height: 14,
                flex: 1,
                borderRadius: 4,
                background: "linear-gradient(90deg, #e1e8ed 25%, #f0f3f6 50%, #e1e8ed 75%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 1.5s infinite",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const MODE_ICONS: Record<string, string> = {
  walking: "🚶",
  bus: "🚌",
  tube: "🚇",
  overground: "🚆",
  dlr: "🚈",
  "national-rail": "🚂",
  cycle: "🚴",
  river: "⛴️",
  tram: "🚊",
  coach: "🚍",
};

function findNearestLocation(lat: number | null | undefined, lng: number | null | undefined, locs: Array<{ latitude?: number | null; longitude?: number | null; locationName?: string | null }>): string {
  if (lat == null || lng == null || locs.length === 0) {
    return `${lat?.toFixed(2) ?? "?"}, ${lng?.toFixed(2) ?? "?"}`;
  }
  let nearest = locs[0];
  let minDist = Infinity;
  for (const loc of locs) {
    if (loc.latitude == null || loc.longitude == null) {
      continue;
    }
    const d = (loc.latitude - lat) ** 2 + (loc.longitude - lng) ** 2;
    if (d < minDist) {
      minDist = d;
      nearest = loc;
    }
  }
  return nearest.locationName ?? `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}

function formatLegsSummary(raw: string | null | undefined): string {
  if (!raw) {
    return "—";
  }
  return raw
    .split(">")
    .map(leg => {
      const trimmed = leg.trim();
      const match = trimmed.match(/^(\w[\w-]*)\((\d+)min\)$/);
      if (match) {
        const mode = match[1].toLowerCase();
        const mins = match[2];
        const icon = MODE_ICONS[mode] ?? "•";
        const name = mode.charAt(0).toUpperCase() + mode.slice(1);
        return `${icon} ${name} ${mins} min`;
      }
      return trimmed;
    })
    .join(" → ");
}

function MetricCard({ title, value, subtitle, intent, icon, loading }: {
  title: string;
  value: string | number;
  subtitle?: string;
  intent: Intent;
  icon: "cloud" | "time" | "path-search";
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
      {subtitle && <div style={{ fontSize: 10, color: "#a7b6c2", marginTop: 4 }}>{subtitle}</div>}
    </Card>
  );
}

export default function Analytics() {
  const [ttSort, setTtSort] = useState<SortDir>("asc");
  const [jpSort, setJpSort] = useState<SortDir>("asc");
  const [hubSearch, setHubSearch] = useState("");
  const [modeFilter, setModeFilter] = useState<string | null>(null);
  const [ttPage, setTtPage] = useState(1);
  const [ttPageSize, setTtPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [jpPage, setJpPage] = useState(1);
  const [jpPageSize, setJpPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [trendsPage, setTrendsPage] = useState(1);
  const [peakPage, setPeakPage] = useState(1);
  const [hotspotsPage, setHotspotsPage] = useState(1);

  const travelTimes = useOsdkObjects(TravelTime, {
    orderBy: { travelTimeSeconds: "asc" },
    pageSize: 50,
  });
  const journeyPlans = useOsdkObjects(JourneyPlan, {
    orderBy: { durationMinutes: "asc" },
    pageSize: 50,
  });
  const airQuality = useOsdkObjects(AirQuality, { pageSize: 10 });

  const locations = useOsdkObjects(LiveLocation, { pageSize: 100 });

  // PySpark Analytics
  const incidentTrends = useOsdkObjects(IncidentTrend, { orderBy: { incidentDate: "desc" }, pageSize: 50 });
  const peakHours = useOsdkObjects(PeakHourHeatmap, { orderBy: { incidentCount: "desc" }, pageSize: 50 });
  const hotspots = useOsdkObjects(TransportHotspot, { orderBy: { hotspotRank: "asc" }, pageSize: 20 });

  // Unique modes from journey plans
  const journeyModes = useMemo(() => {
    const modes = new Set<string>();
    (journeyPlans.data ?? []).forEach(jp => {
      if (jp.modesUsed) {
        jp.modesUsed.split(",").forEach(m => {
          const trimmed = m.trim();
          if (trimmed) {
            modes.add(trimmed);
          }
        });
      }
    });
    return Array.from(modes).sort();
  }, [journeyPlans.data]);

  const sortedTravelTimes = useMemo(() => {
    let data = [...(travelTimes.data ?? [])];
    if (hubSearch) {
      const term = hubSearch.toLowerCase();
      data = data.filter(tt => {
        const name = (tt.hubName ?? "").toLowerCase();
        return name.includes(term);
      });
    }
    data.sort((a, b) => {
      const aVal = Number(a.travelTimeSeconds ?? 0);
      const bVal = Number(b.travelTimeSeconds ?? 0);
      return ttSort === "asc" ? aVal - bVal : bVal - aVal;
    });
    return data;
  }, [travelTimes.data, ttSort, hubSearch]);

  const sortedJourneyPlans = useMemo(() => {
    let data = [...(journeyPlans.data ?? [])];
    if (modeFilter) {
      data = data.filter(jp => {
        const modes = (jp.modesUsed ?? "").toLowerCase();
        return modes.includes(modeFilter.toLowerCase());
      });
    }
    data.sort((a, b) => {
      const aVal = Number(a.durationMinutes ?? 0);
      const bVal = Number(b.durationMinutes ?? 0);
      return jpSort === "asc" ? aVal - bVal : bVal - aVal;
    });
    return data;
  }, [journeyPlans.data, jpSort, modeFilter]);

  // Pagination calculations
  const ttTotalPages = Math.ceil(sortedTravelTimes.length / ttPageSize);
  const ttSlice = sortedTravelTimes.slice((ttPage - 1) * ttPageSize, ttPage * ttPageSize);

  const jpTotalPages = Math.ceil(sortedJourneyPlans.length / jpPageSize);
  const jpSlice = sortedJourneyPlans.slice((jpPage - 1) * jpPageSize, jpPage * jpPageSize);

  const trendsData = incidentTrends.data ?? [];
  const trendsTotalPages = Math.ceil(trendsData.length / ANALYTICS_PAGE_SIZE);
  const trendsSlice = trendsData.slice((trendsPage - 1) * ANALYTICS_PAGE_SIZE, trendsPage * ANALYTICS_PAGE_SIZE);

  const peakData = peakHours.data ?? [];
  const peakTotalPages = Math.ceil(peakData.length / ANALYTICS_PAGE_SIZE);
  const peakSlice = peakData.slice((peakPage - 1) * ANALYTICS_PAGE_SIZE, peakPage * ANALYTICS_PAGE_SIZE);

  const hotspotsData = hotspots.data ?? [];
  const hotspotsTotalPages = Math.ceil(hotspotsData.length / ANALYTICS_PAGE_SIZE);
  const hotspotsSlice = hotspotsData.slice((hotspotsPage - 1) * ANALYTICS_PAGE_SIZE, hotspotsPage * ANALYTICS_PAGE_SIZE);

  // Chart data: aggregate by date for line chart
  const trendChartData = useMemo(() => {
    const byDate = new Map<string, { date: string; total: number; severe: number; serious: number; moderate: number; minimal: number }>();
    (incidentTrends.data ?? []).forEach(t => {
      const d = String(t.incidentDate ?? "");
      if (!d) {
        return;
      }
      if (!byDate.has(d)) {
        byDate.set(d, { date: d, total: 0, severe: 0, serious: 0, moderate: 0, minimal: 0 });
      }
      const entry = byDate.get(d)!;
      const count = Number(t.incidentCount ?? 0);
      entry.total += count;
      const sev = (t.severityLevel ?? "").toLowerCase();
      if (sev === "severe") { entry.severe += count; }
      else if (sev === "serious") { entry.serious += count; }
      else if (sev === "moderate") { entry.moderate += count; }
      else { entry.minimal += count; }
    });
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [incidentTrends.data]);

  // Peak hours chart: top 15 by incident count
  const peakChartData = useMemo(() => {
    return (peakHours.data ?? [])
      .slice(0, 15)
      .map(ph => ({
        label: `${ph.dayName?.slice(0, 3) ?? "?"} ${String(ph.hourOfDay ?? 0).padStart(2, "0")}:00`,
        incidents: Number(ph.incidentCount ?? 0),
      }));
  }, [peakHours.data]);

  const hasError = travelTimes.error || journeyPlans.error || airQuality.error;
  const currentAQ = (airQuality.data ?? []).find(aq => aq.forecastType === "Current");

  const avgMinutes = useMemo(() => {
    const all = travelTimes.data ?? [];
    if (all.length === 0) {
      return "—";
    }
    const avgSec = all.reduce((sum, tt) => sum + Number(tt.travelTimeSeconds ?? 0), 0) / all.length;
    return `${Math.round(avgSec / 60)}m`;
  }, [travelTimes.data]);

  const routeCount = journeyPlans.data?.length ?? 0;

  return (
    <div>
      {hasError && (
        <Callout intent={Intent.DANGER} title="Data Fetch Error" style={{ marginBottom: 12 }} icon="error">
          Some analytics data could not be loaded.
        </Callout>
      )}

      {/* Top: 3 Metric Cards */}
      <div className="metrics-grid" style={{ marginBottom: 20 }}>
        <MetricCard
          title="Air Quality"
          value={currentAQ?.forecastBand ?? "—"}
          subtitle={currentAQ?.forecastSummary ?? undefined}
          intent={
            currentAQ?.forecastBand === "Low" ? Intent.SUCCESS :
            currentAQ?.forecastBand === "Moderate" ? Intent.WARNING :
            currentAQ?.forecastBand === "High" ? Intent.DANGER : Intent.NONE
          }
          icon="cloud"
          loading={airQuality.isLoading}
        />
        <MetricCard
          title="Avg Travel Time"
          value={avgMinutes}
          subtitle={`${(travelTimes.data ?? []).length} routes measured`}
          intent={Intent.PRIMARY}
          icon="time"
          loading={travelTimes.isLoading}
        />
        <MetricCard
          title="Routes Calculated"
          value={routeCount}
          subtitle="Journey plans available"
          intent={Intent.NONE}
          icon="path-search"
          loading={journeyPlans.isLoading}
        />
      </div>

      {/* Middle: Travel Times */}
      <div className="section-header">
        <h4>
          <Icon icon="time" size={14} style={{ marginRight: 6, opacity: 0.6 }} />
          Travel Times
          {!travelTimes.isLoading && (
            <Tag minimal style={{ marginLeft: 8, fontSize: 11 }}>{sortedTravelTimes.length}</Tag>
          )}
        </h4>
      </div>
      <FilterBar
        search={{
          value: hubSearch,
          onChange: (v) => { setHubSearch(v); setTtPage(1); },
          placeholder: "Search hubs...",
        }}
        activeFilters={[]}
      >
        <div style={{ padding: "12px 14px", fontSize: 12, color: "#738694" }}>
          Use the search bar to filter by hub name.
        </div>
      </FilterBar>
      <Card className="panel-card" style={{ marginBottom: 20 }}>
        {travelTimes.isLoading && !travelTimes.data && (
          <Skeleton />
        )}
        {(travelTimes.data ?? []).length === 0 && !travelTimes.isLoading && (
          <div className="empty-state">
            <Icon icon="time" size={24} />
            <p>No travel time data available</p>
          </div>
        )}
        {(travelTimes.data ?? []).length > 0 && (
          <HTMLTable bordered striped style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Hub</th>
                <th>Incident</th>
                <th
                  style={{ cursor: "pointer", userSelect: "none" }}
                  onClick={() => setTtSort(prev => prev === "asc" ? "desc" : "asc")}
                >
                  Travel Time <Icon icon={ttSort === "asc" ? "sort-asc" : "sort-desc"} size={12} />
                </th>
                <th>Distance</th>
              </tr>
            </thead>
            <tbody>
              {ttSlice.map((tt) => (
                <tr key={tt.pairId}>
                  <td><strong>{tt.hubName ?? "—"}</strong></td>
                  <td style={{ fontSize: 12, fontFamily: "monospace" }}>{tt.ttIncidentId ?? "—"}</td>
                  <td>
                    <Tag minimal intent={Intent.PRIMARY} style={{ fontSize: 11 }}>
                      {tt.travelTimeText ?? (tt.travelTimeSeconds != null ? `${Math.round(Number(tt.travelTimeSeconds) / 60)}m` : "—")}
                    </Tag>
                  </td>
                  <td style={{ fontSize: 12, color: "#738694" }}>{tt.distanceText ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        )}
        <Pagination
          currentPage={ttPage}
          totalPages={ttTotalPages}
          onPageChange={setTtPage}
          pageSize={ttPageSize}
          onPageSizeChange={(size) => { setTtPageSize(size); setTtPage(1); }}
          totalItems={sortedTravelTimes.length}
        />
      </Card>

      {/* Bottom: Journey Plans */}
      <div className="section-header">
        <h4>
          <Icon icon="path-search" size={14} style={{ marginRight: 6, opacity: 0.6 }} />
          Journey Plans
          {!journeyPlans.isLoading && (
            <Tag minimal style={{ marginLeft: 8, fontSize: 11 }}>{sortedJourneyPlans.length}</Tag>
          )}
        </h4>
      </div>

      <FilterBar
        activeFilters={modeFilter ? [{
          key: "mode",
          label: modeFilter,
          intent: Intent.PRIMARY,
          onRemove: () => { setModeFilter(null); setJpPage(1); },
        }] : []}
        onClearAll={() => { setModeFilter(null); setJpPage(1); }}
      >
        <FilterSection title="Transport Mode">
          {journeyModes.map(m => (
            <FilterOption
              key={m}
              label={m}
              selected={modeFilter === m}
              onClick={() => { setModeFilter(modeFilter === m ? null : m); setJpPage(1); }}
            />
          ))}
        </FilterSection>
      </FilterBar>

      <Card className="panel-card" style={{ marginBottom: 20 }}>
        {journeyPlans.isLoading && !journeyPlans.data && (
          <Skeleton />
        )}
        {(journeyPlans.data ?? []).length === 0 && !journeyPlans.isLoading && (
          <div className="empty-state">
            <Icon icon="path-search" size={24} />
            <p>No journey plans available</p>
          </div>
        )}
        {(journeyPlans.data ?? []).length > 0 && (
          <HTMLTable bordered striped style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Origin</th>
                <th>Destination</th>
                <th
                  style={{ cursor: "pointer", userSelect: "none" }}
                  onClick={() => setJpSort(prev => prev === "asc" ? "desc" : "asc")}
                >
                  Duration <Icon icon={jpSort === "asc" ? "sort-asc" : "sort-desc"} size={12} />
                </th>
                <th>Modes</th>
                <th>Route Steps</th>
              </tr>
            </thead>
            <tbody>
              {jpSlice.map((jp) => (
                <tr key={jp.journeyId}>
                  <td><strong>{jp.originName ?? "—"}</strong></td>
                  <td><strong>{jp.destinationName ?? "—"}</strong></td>
                  <td>
                    <Tag minimal intent={Intent.PRIMARY} style={{ fontSize: 11 }}>
                      {jp.durationMinutes != null ? `${jp.durationMinutes} min` : "—"}
                    </Tag>
                  </td>
                  <td style={{ fontSize: 12 }}>{jp.modesUsed ?? "—"}</td>
                  <td style={{ maxWidth: 350, fontSize: 12, color: "#738694", lineHeight: 1.4 }}>
                    {formatLegsSummary(jp.legsSummary)}
                  </td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        )}
        <Pagination
          currentPage={jpPage}
          totalPages={jpTotalPages}
          onPageChange={setJpPage}
          pageSize={jpPageSize}
          onPageSizeChange={(size) => { setJpPageSize(size); setJpPage(1); }}
          totalItems={sortedJourneyPlans.length}
        />
      </Card>

      {/* ═══ PYSPARK ANALYTICS ═══ */}
      <div style={{ marginTop: 24, marginBottom: 12 }}>
        <Tag intent={Intent.WARNING} minimal icon="flash" style={{ fontSize: 11 }}>
          Powered by Apache Spark
        </Tag>
      </div>

      {/* Incident Trends Chart */}
      {trendChartData.length > 1 && (
        <Card className="panel-card" style={{ marginBottom: 20, padding: 16 }}>
          <h4 style={{ margin: "0 0 12px 0", fontSize: 13 }}>
            <Icon icon="chart" size={14} style={{ marginRight: 6, opacity: 0.6 }} />
            Daily Incident Trend
          </h4>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e1e8ed" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="severe" stroke="#c23030" strokeWidth={2} dot={false} name="Severe" />
              <Line type="monotone" dataKey="serious" stroke="#d9822b" strokeWidth={2} dot={false} name="Serious" />
              <Line type="monotone" dataKey="moderate" stroke="#2d72d2" strokeWidth={1.5} dot={false} name="Moderate" />
              <Line type="monotone" dataKey="minimal" stroke="#738694" strokeWidth={1} dot={false} name="Minimal" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Incident Trends Table */}
      <div className="section-header">
        <h4>
          <Icon icon="trending-up" size={14} style={{ marginRight: 6, opacity: 0.6 }} />
          Incident Trends
          {!incidentTrends.isLoading && (
            <Tag minimal style={{ marginLeft: 8, fontSize: 11 }}>{trendsData.length}</Tag>
          )}
        </h4>
      </div>
      <Card className="panel-card" style={{ marginBottom: 20 }}>
        {incidentTrends.isLoading && !incidentTrends.data && (
          <Skeleton />
        )}
        {trendsData.length > 0 && (
          <HTMLTable bordered striped style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Severity</th>
                <th>Count</th>
                <th>7-Day Avg</th>
                <th>Daily Total</th>
              </tr>
            </thead>
            <tbody>
              {trendsSlice.map((t) => (
                <tr key={t.trendId}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{t.incidentDate ?? "—"}</td>
                  <td>
                    <Tag
                      minimal
                      intent={
                        t.severityLevel === "Severe" ? Intent.DANGER :
                        t.severityLevel === "Serious" ? Intent.WARNING :
                        t.severityLevel === "Moderate" ? Intent.PRIMARY : Intent.NONE
                      }
                      style={{ fontSize: 11 }}
                    >
                      {t.severityLevel ?? "—"}
                    </Tag>
                  </td>
                  <td><strong>{t.incidentCount ?? 0}</strong></td>
                  <td style={{ color: "#2d72d2" }}>{t.rolling7dAvg ?? "—"}</td>
                  <td style={{ color: "#738694" }}>{t.totalDailyCount ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        )}
        <Pagination currentPage={trendsPage} totalPages={trendsTotalPages} onPageChange={setTrendsPage} />
      </Card>

      {/* Peak Hours Bar Chart */}
      {peakChartData.length > 0 && (
        <Card className="panel-card" style={{ marginBottom: 20, padding: 16 }}>
          <h4 style={{ margin: "0 0 12px 0", fontSize: 13 }}>
            <Icon icon="heat-grid" size={14} style={{ marginRight: 6, opacity: 0.6 }} />
            Top Disruption Times
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={peakChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e1e8ed" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="incidents" fill="#d9822b" radius={[3, 3, 0, 0]} name="Incidents" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Peak Hour Heatmap Table */}
      <div className="section-header">
        <h4>
          <Icon icon="heat-grid" size={14} style={{ marginRight: 6, opacity: 0.6 }} />
          Peak Disruption Hours
          {!peakHours.isLoading && (
            <Tag minimal style={{ marginLeft: 8, fontSize: 11 }}>{peakData.length}</Tag>
          )}
        </h4>
      </div>
      <Card className="panel-card" style={{ marginBottom: 20 }}>
        {peakHours.isLoading && !peakHours.data && (
          <Skeleton />
        )}
        {peakData.length > 0 && (
          <HTMLTable bordered striped style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Day</th>
                <th>Hour</th>
                <th>Incidents</th>
                <th>Unique</th>
              </tr>
            </thead>
            <tbody>
              {peakSlice.map((ph) => (
                <tr key={ph.heatmapId}>
                  <td><strong>{ph.dayName ?? "—"}</strong></td>
                  <td style={{ fontFamily: "monospace" }}>{ph.hourOfDay != null ? `${String(ph.hourOfDay).padStart(2, "0")}:00` : "—"}</td>
                  <td>
                    <Tag
                      minimal
                      intent={Number(ph.incidentCount ?? 0) > 50 ? Intent.DANGER : Number(ph.incidentCount ?? 0) > 10 ? Intent.WARNING : Intent.NONE}
                      style={{ fontSize: 11 }}
                    >
                      {ph.incidentCount ?? 0}
                    </Tag>
                  </td>
                  <td style={{ color: "#738694" }}>{ph.uniqueIncidents ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        )}
        <Pagination currentPage={peakPage} totalPages={peakTotalPages} onPageChange={setPeakPage} />
      </Card>

      {/* Transport Hotspots Chart */}
      {hotspotsData.length > 0 && (
        <Card className="panel-card" style={{ marginBottom: 20, padding: 16 }}>
          <h4 style={{ margin: "0 0 12px 0", fontSize: 13 }}>
            <Icon icon="map-marker" size={14} style={{ marginRight: 6, opacity: 0.6 }} />
            Hotspot Severity Ranking
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={hotspotsData.slice(0, 10).map(hs => ({
                name: findNearestLocation(hs.gridLat, hs.gridLng, locations.data ?? []).slice(0, 20),
                score: Number(hs.weightedSeverityScore ?? 0),
                incidents: Number(hs.totalIncidents ?? 0),
              }))}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 100, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e1e8ed" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={95} />
              <Tooltip />
              <Bar dataKey="score" fill="#c23030" radius={[0, 3, 3, 0]} name="Severity Score" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Transport Hotspots Table */}
      <div className="section-header">
        <h4>
          <Icon icon="map-marker" size={14} style={{ marginRight: 6, opacity: 0.6 }} />
          Transport Hotspots
          {!hotspots.isLoading && (
            <Tag minimal style={{ marginLeft: 8, fontSize: 11 }}>{hotspotsData.length}</Tag>
          )}
        </h4>
      </div>
      <Card className="panel-card">
        {hotspots.isLoading && !hotspots.data && (
          <Skeleton />
        )}
        {hotspotsData.length > 0 && (
          <HTMLTable bordered striped style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Nearest Location</th>
                <th>Incidents</th>
                <th>Severity Score</th>
                <th>Active Days</th>
                <th>Type Diversity</th>
              </tr>
            </thead>
            <tbody>
              {hotspotsSlice.map((hs) => (
                <tr key={hs.gridCell}>
                  <td>
                    <Tag
                      minimal
                      intent={(hs.hotspotRank ?? 99) <= 3 ? Intent.DANGER : (hs.hotspotRank ?? 99) <= 7 ? Intent.WARNING : Intent.NONE}
                      style={{ fontSize: 11 }}
                    >
                      #{hs.hotspotRank ?? "—"}
                    </Tag>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <strong>{findNearestLocation(hs.gridLat, hs.gridLng, locations.data ?? [])}</strong>
                  </td>
                  <td><strong>{hs.totalIncidents ?? 0}</strong></td>
                  <td style={{ color: "#c23030", fontWeight: 600 }}>{hs.weightedSeverityScore ?? 0}</td>
                  <td>{hs.activeDays ?? 0}</td>
                  <td>{hs.incidentTypeDiversity ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        )}
        <Pagination currentPage={hotspotsPage} totalPages={hotspotsTotalPages} onPageChange={setHotspotsPage} />
      </Card>
    </div>
  );
}
