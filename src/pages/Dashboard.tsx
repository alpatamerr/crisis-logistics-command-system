import { Card, H4, Tag, Intent, Spinner, Callout } from "@blueprintjs/core";
import { useOsdkObjects } from "@osdk/react/experimental";
import { LiveIncident, LineStatus, CrisisResource, LiveTransportUnit } from "@crisis-logistics-command-app/sdk";
import CrisisMap from "@/components/CrisisMap";

function MetricCard({ title, value, intent, loading }: {
  title: string;
  value: string | number;
  intent: Intent;
  loading: boolean;
}) {
  return (
    <Card className="metric-card" elevation={1}>
      <div className="metric-value">
        {loading ? <Spinner size={24} /> : <Tag large minimal intent={intent}>{value}</Tag>}
      </div>
      <div className="metric-title">{title}</div>
    </Card>
  );
}

export default function Dashboard() {
  const incidents = useOsdkObjects(LiveIncident, { pageSize: 100 });
  const disrupted = useOsdkObjects(LineStatus, { where: { isDisrupted: { $eq: true } }, pageSize: 100 });
  const resources = useOsdkObjects(CrisisResource, { pageSize: 100 });
  const units = useOsdkObjects(LiveTransportUnit, { pageSize: 100 });

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
        <Callout intent={Intent.DANGER} title="Data Fetch Error" style={{ marginBottom: 16 }}>
          Some data could not be loaded. Please check your connection and try again.
        </Callout>
      )}
      <div className="metrics-grid">
        <MetricCard title="Active Incidents" value={incidentCount} intent={Intent.DANGER} loading={incidents.isLoading} />
        <MetricCard title="Disrupted Lines" value={disruptedCount} intent={Intent.WARNING} loading={disrupted.isLoading} />
        <MetricCard title="Low Resources" value={lowResources} intent={lowResources > 0 ? Intent.DANGER : Intent.SUCCESS} loading={resources.isLoading} />
        <MetricCard title="Transport Units" value={unitCount} intent={Intent.PRIMARY} loading={units.isLoading} />
      </div>

      <H4 style={{ marginTop: 24 }}>Situation Map</H4>
      <CrisisMap />

      <H4 style={{ marginTop: 24 }}>Recent Incidents</H4>
      <div className="table-container">
        <table className="bp5-html-table bp5-html-table-bordered bp5-html-table-striped" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Severity</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {incidents.isLoading && !incidents.data && (
              <tr><td colSpan={3}><Spinner size={20} /></td></tr>
            )}
            {(incidents.data ?? []).slice(0, 10).map((inc) => (
              <tr key={inc.incidentId}>
                <td>
                  <Tag intent={
                    inc.severityLevel === "Severe" ? Intent.DANGER :
                    inc.severityLevel === "Serious" ? Intent.WARNING :
                    inc.severityLevel === "Moderate" ? Intent.PRIMARY : Intent.NONE
                  } minimal>{inc.severityLevel ?? "Unknown"}</Tag>
                </td>
                <td>{inc.incidentType ?? "—"}</td>
                <td style={{ maxWidth: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {inc.description ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
