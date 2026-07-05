import { useMemo, useState } from "react";
import { Card, Spinner, HTMLTable, Tag, Intent, Callout, Icon, InputGroup, Button } from "@blueprintjs/core";
import { useOsdkObjects } from "@osdk/react/experimental";
import { TravelTime, JourneyPlan, AirQuality, IncidentTrend, PeakHourHeatmap, TransportHotspot } from "@crisis-logistics-command-app/sdk";

type SortDir = "asc" | "desc";

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

  const travelTimes = useOsdkObjects(TravelTime, {
    orderBy: { travelTimeSeconds: "asc" },
    pageSize: 50,
  });
  const journeyPlans = useOsdkObjects(JourneyPlan, {
    orderBy: { durationMinutes: "asc" },
    pageSize: 50,
  });
  const airQuality = useOsdkObjects(AirQuality, { pageSize: 10 });

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
    // Hub search filter
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
    // Mode filter
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
        <InputGroup
          leftIcon="search"
          placeholder="Search hubs..."
          value={hubSearch}
          onChange={(e) => setHubSearch(e.target.value)}
          small
          style={{ width: 180 }}
        />
      </div>
      <Card className="panel-card" style={{ marginBottom: 20 }}>
        {travelTimes.isLoading && !travelTimes.data && (
          <div style={{ padding: 24, textAlign: "center" }}><Spinner /></div>
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
              {sortedTravelTimes.map((tt) => (
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
      {/* Mode filter pills */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <Button
          text="All Modes"
          small
          minimal={modeFilter !== null}
          intent={modeFilter === null ? Intent.PRIMARY : Intent.NONE}
          onClick={() => setModeFilter(null)}
        />
        {journeyModes.map(m => (
          <Button
            key={m}
            text={m}
            small
            minimal={modeFilter !== m}
            intent={modeFilter === m ? Intent.PRIMARY : Intent.NONE}
            onClick={() => setModeFilter(modeFilter === m ? null : m)}
          />
        ))}
      </div>
      <Card className="panel-card">
        {journeyPlans.isLoading && !journeyPlans.data && (
          <div style={{ padding: 24, textAlign: "center" }}><Spinner /></div>
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
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {sortedJourneyPlans.map((jp) => (
                <tr key={jp.journeyId}>
                  <td><strong>{jp.originName ?? "—"}</strong></td>
                  <td><strong>{jp.destinationName ?? "—"}</strong></td>
                  <td>
                    <Tag minimal intent={Intent.PRIMARY} style={{ fontSize: 11 }}>
                      {jp.durationMinutes != null ? `${jp.durationMinutes} min` : "—"}
                    </Tag>
                  </td>
                  <td style={{ fontSize: 12 }}>{jp.modesUsed ?? "—"}</td>
                  <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "#738694" }}>
                    {jp.legsSummary ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        )}
      </Card>

      {/* ═══ PYSPARK ANALYTICS ═══ */}
      <div style={{ marginTop: 24, marginBottom: 12 }}>
        <Tag intent={Intent.WARNING} minimal icon="flash" style={{ fontSize: 11 }}>
          Powered by Apache Spark
        </Tag>
      </div>

      {/* Incident Trends */}
      <div className="section-header">
        <h4>
          <Icon icon="trending-up" size={14} style={{ marginRight: 6, opacity: 0.6 }} />
          Incident Trends
          {!incidentTrends.isLoading && (
            <Tag minimal style={{ marginLeft: 8, fontSize: 11 }}>{(incidentTrends.data ?? []).length}</Tag>
          )}
        </h4>
      </div>
      <Card className="panel-card" style={{ marginBottom: 20 }}>
        {incidentTrends.isLoading && !incidentTrends.data && (
          <div style={{ padding: 24, textAlign: "center" }}><Spinner /></div>
        )}
        {(incidentTrends.data ?? []).length > 0 && (
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
              {(incidentTrends.data ?? []).map((t) => (
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
      </Card>

      {/* Peak Hour Heatmap */}
      <div className="section-header">
        <h4>
          <Icon icon="heat-grid" size={14} style={{ marginRight: 6, opacity: 0.6 }} />
          Peak Disruption Hours
          {!peakHours.isLoading && (
            <Tag minimal style={{ marginLeft: 8, fontSize: 11 }}>{(peakHours.data ?? []).length}</Tag>
          )}
        </h4>
      </div>
      <Card className="panel-card" style={{ marginBottom: 20 }}>
        {peakHours.isLoading && !peakHours.data && (
          <div style={{ padding: 24, textAlign: "center" }}><Spinner /></div>
        )}
        {(peakHours.data ?? []).length > 0 && (
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
              {(peakHours.data ?? []).map((ph) => (
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
      </Card>

      {/* Transport Hotspots */}
      <div className="section-header">
        <h4>
          <Icon icon="map-marker" size={14} style={{ marginRight: 6, opacity: 0.6 }} />
          Transport Hotspots
          {!hotspots.isLoading && (
            <Tag minimal style={{ marginLeft: 8, fontSize: 11 }}>{(hotspots.data ?? []).length}</Tag>
          )}
        </h4>
      </div>
      <Card className="panel-card">
        {hotspots.isLoading && !hotspots.data && (
          <div style={{ padding: 24, textAlign: "center" }}><Spinner /></div>
        )}
        {(hotspots.data ?? []).length > 0 && (
          <HTMLTable bordered striped style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Grid Cell</th>
                <th>Incidents</th>
                <th>Severity Score</th>
                <th>Active Days</th>
                <th>Type Diversity</th>
              </tr>
            </thead>
            <tbody>
              {(hotspots.data ?? []).map((hs) => (
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
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {hs.gridLat?.toFixed(2)}, {hs.gridLng?.toFixed(2)}
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
      </Card>
    </div>
  );
}
