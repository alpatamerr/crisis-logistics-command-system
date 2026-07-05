import { useMemo, useState } from "react";
import { Card, Spinner, HTMLTable, Tag, Intent, Callout, Icon, InputGroup, Button } from "@blueprintjs/core";
import { useOsdkObjects } from "@osdk/react/experimental";
import { TravelTime, JourneyPlan, AirQuality } from "@crisis-logistics-command-app/sdk";

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
    </div>
  );
}
