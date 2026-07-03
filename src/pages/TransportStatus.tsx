import { Card, H4, Tag, Intent, Spinner, HTMLTable, Callout } from "@blueprintjs/core";
import { useOsdkObjects } from "@osdk/react/experimental";
import { LineStatus, RoadStatus, BusArrival } from "@crisis-logistics-command-app/sdk";

export default function TransportStatus() {
  const disrupted = useOsdkObjects(LineStatus, {
    where: { isDisrupted: { $eq: true } },
    orderBy: { statusSeverity: "asc" },
    pageSize: 50,
  });

  const roads = useOsdkObjects(RoadStatus, { pageSize: 50 });
  const buses = useOsdkObjects(BusArrival, {
    orderBy: { timeToStationSeconds: "asc" },
    pageSize: 20,
  });

  const hasError = disrupted.error || roads.error || buses.error;

  return (
    <div>
      {hasError && (
        <Callout intent={Intent.DANGER} title="Data Fetch Error" style={{ marginBottom: 16 }}>
          Some transport data could not be loaded. Please check your connection and try again.
        </Callout>
      )}

      <H4>Disrupted Lines</H4>
      <Card elevation={1} style={{ marginBottom: 24 }}>
        {disrupted.isLoading && !disrupted.data && <Spinner />}
        {(disrupted.data ?? []).length === 0 && !disrupted.isLoading && (
          <p style={{ textAlign: "center", color: "#8a9ba8", padding: 16 }}>No disruptions currently reported</p>
        )}
        <HTMLTable bordered striped style={{ width: "100%" }}>
          <thead>
            <tr><th>Line</th><th>Mode</th><th>Status</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {(disrupted.data ?? []).map((line) => (
              <tr key={line.lineId}>
                <td><strong>{line.lineName ?? line.lineId}</strong></td>
                <td>{line.mode ?? "—"}</td>
                <td><Tag intent={Intent.WARNING} minimal>{line.statusDescription ?? "—"}</Tag></td>
                <td style={{ maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {line.disruptionReason ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </HTMLTable>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <H4>Road Conditions</H4>
          <Card elevation={1}>
            {roads.isLoading && !roads.data && <Spinner />}
            <HTMLTable bordered striped style={{ width: "100%" }}>
              <thead>
                <tr><th>Road</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(roads.data ?? []).map((road) => (
                  <tr key={road.roadId}>
                    <td><strong>{road.roadName ?? road.roadId}</strong></td>
                    <td>{road.statusDescription ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
          </Card>
        </div>

        <div>
          <H4>Bus Arrivals</H4>
          <Card elevation={1}>
            {buses.isLoading && !buses.data && <Spinner />}
            {(buses.data ?? []).length === 0 && !buses.isLoading && (
              <p style={{ textAlign: "center", color: "#8a9ba8", padding: 16 }}>No bus arrivals available</p>
            )}
            <HTMLTable bordered striped style={{ width: "100%" }}>
              <thead>
                <tr><th>Vehicle ID</th><th>Line</th><th>ETA</th><th>Destination</th></tr>
              </thead>
              <tbody>
                {(buses.data ?? []).map((bus) => (
                  <tr key={bus.vehicleId}>
                    <td>{bus.vehicleId}</td>
                    <td>{bus.lineName ?? "—"}</td>
                    <td>{bus.timeToStationSeconds != null ? `${Math.round(Number(bus.timeToStationSeconds) / 60)}m` : "—"}</td>
                    <td>{bus.destination ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </HTMLTable>
          </Card>
        </div>
      </div>
    </div>
  );
}
