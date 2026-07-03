import { Card, H4, Spinner, HTMLTable, Tag, Intent, Callout } from "@blueprintjs/core";
import { useOsdkObjects } from "@osdk/react/experimental";
import { TravelTime, JourneyPlan, AirQuality } from "@crisis-logistics-command-app/sdk";

export default function Analytics() {
  const travelTimes = useOsdkObjects(TravelTime, {
    orderBy: { travelTimeSeconds: "asc" },
    pageSize: 30,
  });
  const journeyPlans = useOsdkObjects(JourneyPlan, {
    orderBy: { durationMinutes: "asc" },
    pageSize: 30,
  });
  const airQuality = useOsdkObjects(AirQuality, { pageSize: 5 });

  const hasError = travelTimes.error || journeyPlans.error || airQuality.error;
  const currentAQ = (airQuality.data ?? []).find(aq => aq.forecastType === "Current");
  const allTravelTimes = travelTimes.data ?? [];
  const avgSeconds = allTravelTimes.length > 0
    ? allTravelTimes.reduce((sum, tt) => sum + Number(tt.travelTimeSeconds ?? 0), 0) / allTravelTimes.length
    : 0;
  const avgMinutes = avgSeconds > 0 ? Math.round(avgSeconds / 60) : "—";
  const routeCount = journeyPlans.data?.length ?? 0;

  return (
    <div>
      {hasError && (
        <Callout intent={Intent.DANGER} title="Data Fetch Error" style={{ marginBottom: 16 }}>
          Some analytics data could not be loaded. Please check your connection and try again.
        </Callout>
      )}

      <div className="metrics-grid">
        <Card className="metric-card" elevation={1}>
          <div className="metric-value">
            <Tag large minimal intent={Intent.SUCCESS}>{currentAQ?.forecastBand ?? "—"}</Tag>
          </div>
          <div className="metric-title">Air Quality Band</div>
        </Card>
        <Card className="metric-card" elevation={1}>
          <div className="metric-value">
            <Tag large minimal intent={Intent.PRIMARY}>{avgMinutes}m</Tag>
          </div>
          <div className="metric-title">Avg Travel Time</div>
        </Card>
        <Card className="metric-card" elevation={1}>
          <div className="metric-value">
            <Tag large minimal intent={Intent.NONE}>{routeCount}</Tag>
          </div>
          <div className="metric-title">Routes Calculated</div>
        </Card>
      </div>

      <H4 style={{ marginTop: 24 }}>Travel Times</H4>
      <Card elevation={1} style={{ marginBottom: 24 }}>
        {travelTimes.isLoading && !travelTimes.data && <Spinner />}
        {allTravelTimes.length === 0 && !travelTimes.isLoading && (
          <p style={{ textAlign: "center", color: "#8a9ba8", padding: 16 }}>No travel time data available</p>
        )}
        <HTMLTable bordered striped style={{ width: "100%" }}>
          <thead>
            <tr><th>Hub</th><th>Incident</th><th>Travel Time</th><th>Distance</th></tr>
          </thead>
          <tbody>
            {allTravelTimes.map((tt) => (
              <tr key={tt.pairId}>
                <td>{tt.hubName ?? "—"}</td>
                <td>{tt.ttIncidentId ?? "—"}</td>
                <td>{tt.travelTimeText ?? (tt.travelTimeSeconds != null ? `${Math.round(Number(tt.travelTimeSeconds) / 60)}m` : "—")}</td>
                <td>{tt.distanceText ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </HTMLTable>
      </Card>

      <H4>Journey Plans</H4>
      <Card elevation={1}>
        {journeyPlans.isLoading && !journeyPlans.data && <Spinner />}
        {(journeyPlans.data ?? []).length === 0 && !journeyPlans.isLoading && (
          <p style={{ textAlign: "center", color: "#8a9ba8", padding: 16 }}>No journey plans available</p>
        )}
        <HTMLTable bordered striped style={{ width: "100%" }}>
          <thead>
            <tr><th>Origin</th><th>Destination</th><th>Duration</th><th>Modes</th></tr>
          </thead>
          <tbody>
            {(journeyPlans.data ?? []).map((jp) => (
              <tr key={jp.journeyId}>
                <td>{jp.originName ?? "—"}</td>
                <td>{jp.destinationName ?? "—"}</td>
                <td>{jp.durationMinutes != null ? `${jp.durationMinutes} min` : "—"}</td>
                <td>{jp.modesUsed ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </HTMLTable>
      </Card>
    </div>
  );
}
