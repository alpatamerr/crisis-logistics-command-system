import { useMemo, useState } from "react";
import { Card, Spinner, HTMLTable, Tag, Intent, Callout, Icon } from "@blueprintjs/core";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useOsdkObjects } from "@osdk/react/experimental";
import { TravelTime, IncidentTrend, PeakHourHeatmap, TransportHotspot, LiveLocation, DisruptionForecast } from "@crisis-logistics-command-app/sdk";
import Pagination from "@/components/Pagination";
import FilterBar from "@/components/FilterBar";

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



function MetricCard({ title, value, subtitle, intent, icon, loading }: {
  title: string;
  value: string | number;
  subtitle?: string;
  intent: Intent;
  icon: "cloud" | "time" | "path-search" | "predictive-analysis" | "map-marker";
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
  const [hubSearch, setHubSearch] = useState("");
  const [ttPage, setTtPage] = useState(1);
  const [ttPageSize, setTtPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [trendsPage, setTrendsPage] = useState(1);
  const [peakPage, setPeakPage] = useState(1);
  const [hotspotsPage, setHotspotsPage] = useState(1);

  const travelTimes = useOsdkObjects(TravelTime, {
    orderBy: { travelTimeSeconds: "asc" },
    pageSize: 50,
  });


  const locations = useOsdkObjects(LiveLocation, { pageSize: 100 });

  // PySpark Analytics
  const incidentTrends = useOsdkObjects(IncidentTrend, { orderBy: { incidentDate: "desc" }, pageSize: 50 });
  const peakHours = useOsdkObjects(PeakHourHeatmap, { orderBy: { incidentCount: "desc" }, pageSize: 50 });
  const hotspots = useOsdkObjects(TransportHotspot, { orderBy: { hotspotRank: "asc" }, pageSize: 20 });
  const forecasts = useOsdkObjects(DisruptionForecast, { pageSize: 200 });

  // Forecast: only HIGH and MEDIUM risk, sorted by risk then avg count
  const [forecastPage, setForecastPage] = useState(1);
  const forecastData = useMemo(() => {
    return (forecasts.data ?? [])
      .filter(f => f.riskLevel === "HIGH" || f.riskLevel === "MEDIUM")
      .sort((a, b) => {
        if (a.riskLevel === "HIGH" && b.riskLevel !== "HIGH") { return -1; }
        if (a.riskLevel !== "HIGH" && b.riskLevel === "HIGH") { return 1; }
        return (b.avgIncidentCount ?? 0) - (a.avgIncidentCount ?? 0);
      });
  }, [forecasts.data]);
  const forecastTotalPages = Math.ceil(forecastData.length / ANALYTICS_PAGE_SIZE);
  const forecastSlice = forecastData.slice((forecastPage - 1) * ANALYTICS_PAGE_SIZE, forecastPage * ANALYTICS_PAGE_SIZE);



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



  // Pagination calculations
  const ttTotalPages = Math.ceil(sortedTravelTimes.length / ttPageSize);
  const ttSlice = sortedTravelTimes.slice((ttPage - 1) * ttPageSize, ttPage * ttPageSize);



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

  const hasError = travelTimes.error;

  const avgMinutes = useMemo(() => {
    const all = travelTimes.data ?? [];
    if (all.length === 0) {
      return "—";
    }
    const avgSec = all.reduce((sum, tt) => sum + Number(tt.travelTimeSeconds ?? 0), 0) / all.length;
    return `${Math.round(avgSec / 60)}m`;
  }, [travelTimes.data]);



  return (
    <div>
      {hasError && (
        <Callout intent={Intent.DANGER} title="Data Fetch Error" style={{ marginBottom: 12 }} icon="error">
          Some analytics data could not be loaded.
        </Callout>
      )}

      {/* Top: Metric Cards */}
      <div className="metrics-grid" style={{ marginBottom: 20 }}>
        <MetricCard
          title="Avg Travel Time"
          value={avgMinutes}
          subtitle={`${(travelTimes.data ?? []).length} routes measured`}
          intent={Intent.PRIMARY}
          icon="time"
          loading={travelTimes.isLoading}
        />
        <MetricCard
          title="High-Risk Windows"
          value={forecastData.filter(f => f.riskLevel === "HIGH").length}
          subtitle="Predicted disruption windows"
          intent={Intent.DANGER}
          icon="predictive-analysis"
          loading={forecasts.isLoading}
        />
        <MetricCard
          title="Hotspot Zones"
          value={hotspotsData.length}
          subtitle="Active disruption zones"
          intent={Intent.WARNING}
          icon="map-marker"
          loading={hotspots.isLoading}
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

      {/* ═══ PYSPARK ANALYTICS ═══ */}
      <div style={{ marginTop: 24, marginBottom: 12 }}>
        <Tag intent={Intent.WARNING} minimal icon="flash" style={{ fontSize: 11 }}>
          Powered by Apache Spark
        </Tag>
      </div>

      {/* Disruption Forecast — Predictive */}
      <div className="section-header">
        <h4>
          <Icon icon="predictive-analysis" size={14} style={{ marginRight: 6, opacity: 0.6 }} />
          Weekly Disruption Forecast
          {!forecasts.isLoading && (
            <Tag minimal intent={Intent.DANGER} style={{ marginLeft: 8, fontSize: 11 }}>
              {forecastData.filter(f => f.riskLevel === "HIGH").length} HIGH RISK
            </Tag>
          )}
        </h4>
      </div>
      <Card className="panel-card" style={{ marginBottom: 20 }}>
        {forecasts.isLoading && !forecasts.data && <Skeleton />}
        {forecastData.length === 0 && !forecasts.isLoading && (
          <div className="empty-state">
            <Icon icon="predictive-analysis" size={24} />
            <p>No high-risk windows detected</p>
          </div>
        )}
        {forecastData.length > 0 && (
          <HTMLTable bordered striped style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Risk</th>
                <th>Day</th>
                <th>Hour</th>
                <th>Zone</th>
                <th>Avg Incidents</th>
                <th>Max Observed</th>
                <th>Sample Days</th>
              </tr>
            </thead>
            <tbody>
              {forecastSlice.map((f) => (
                <tr key={f.forecastId}>
                  <td>
                    <Tag
                      minimal
                      intent={f.riskLevel === "HIGH" ? Intent.DANGER : Intent.WARNING}
                      style={{ fontSize: 11, fontWeight: 600 }}
                    >
                      {f.riskLevel === "HIGH" ? "🔴" : "🟡"} {f.riskLevel}
                    </Tag>
                  </td>
                  <td><strong>{f.dayName ?? "—"}</strong></td>
                  <td style={{ fontFamily: "monospace" }}>
                    {f.hourBlock != null ? `${String(f.hourBlock).padStart(2, "0")}:00` : "—"}
                  </td>
                  <td style={{ fontSize: 12 }}>{f.gridZone ?? "—"}</td>
                  <td><strong>{f.avgIncidentCount ?? 0}</strong></td>
                  <td style={{ color: "#c23030" }}>{f.maxIncidentCount ?? 0}</td>
                  <td style={{ color: "#738694" }}>{f.sampleDays ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        )}
        <Pagination currentPage={forecastPage} totalPages={forecastTotalPages} onPageChange={setForecastPage} />
      </Card>

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
