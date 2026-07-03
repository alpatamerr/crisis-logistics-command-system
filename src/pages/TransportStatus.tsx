import { Card, Tag, Intent, Spinner, HTMLTable, Callout, Icon } from "@blueprintjs/core";
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
    pageSize: 30,
  });

  const hasError = disrupted.error || roads.error || buses.error;

  return (
    <div>
      {hasError && (
        <Callout intent={Intent.DANGER} title="Data Fetch Error" style={{ marginBottom: 12 }} icon="error">
          Some transport data could not be loaded.
        </Callout>
      )}

      {/* Full-width: Disrupted Lines */}
      <div className="section-header">
        <h4>
          <Icon icon="train" size={14} style={{ marginRight: 6, opacity: 0.6 }} />
          Disrupted Lines
          {!disrupted.isLoading && (
            <Tag minimal style={{ marginLeft: 8, fontSize: 11 }}>{(disrupted.data ?? []).length}</Tag>
          )}
        </h4>
      </div>
      <Card className="panel-card" style={{ marginBottom: 20 }}>
        {disrupted.isLoading && !disrupted.data && (
          <div style={{ padding: 32, textAlign: "center" }}><Spinner /></div>
        )}
        {(disrupted.data ?? []).length === 0 && !disrupted.isLoading && (
          <div className="empty-state">
            <Icon icon="tick-circle" size={24} />
            <p>No disruptions currently reported</p>
          </div>
        )}
        {(disrupted.data ?? []).length > 0 && (
          <HTMLTable bordered striped style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Line</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Severity</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {(disrupted.data ?? []).map((line) => (
                <tr key={line.lineId}>
                  <td><strong>{line.lineName ?? line.lineId}</strong></td>
                  <td>
                    <Tag minimal intent={Intent.NONE} style={{ fontSize: 11 }}>
                      {line.mode ?? "—"}
                    </Tag>
                  </td>
                  <td>
                    <Tag intent={Intent.WARNING} minimal>{line.statusDescription ?? "—"}</Tag>
                  </td>
                  <td style={{ fontSize: 12, color: "#738694" }}>{line.statusSeverity ?? "—"}</td>
                  <td style={{ maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
                    {line.disruptionReason ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        )}
      </Card>

      {/* 2-column: Roads + Buses */}
      <div className="split-layout split-layout-2">
        {/* Road Conditions */}
        <div>
          <div className="section-header">
            <h4>
              <Icon icon="drive-time" size={14} style={{ marginRight: 6, opacity: 0.6 }} />
              Road Conditions
              {!roads.isLoading && (
                <Tag minimal style={{ marginLeft: 8, fontSize: 11 }}>{(roads.data ?? []).length}</Tag>
              )}
            </h4>
          </div>
          <Card className="panel-card">
            {roads.isLoading && !roads.data && (
              <div style={{ padding: 24, textAlign: "center" }}><Spinner /></div>
            )}
            {(roads.data ?? []).length === 0 && !roads.isLoading && (
              <div className="empty-state">No road data available</div>
            )}
            {(roads.data ?? []).length > 0 && (
              <HTMLTable bordered striped style={{ width: "100%" }}>
                <thead>
                  <tr><th>Road</th><th>Severity</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {(roads.data ?? []).map((road) => (
                    <tr key={road.roadId}>
                      <td><strong>{road.roadName ?? road.roadId}</strong></td>
                      <td>
                        <Tag minimal intent={
                          road.statusSeverity === "Serious" ? Intent.DANGER :
                          road.statusSeverity === "Good" ? Intent.SUCCESS : Intent.NONE
                        } style={{ fontSize: 11 }}>
                          {road.statusSeverity ?? "—"}
                        </Tag>
                      </td>
                      <td style={{ fontSize: 12 }}>{road.statusDescription ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </HTMLTable>
            )}
          </Card>
        </div>

        {/* Bus Arrivals */}
        <div>
          <div className="section-header">
            <h4>
              <Icon icon="taxi" size={14} style={{ marginRight: 6, opacity: 0.6 }} />
              Bus Arrivals
              {!buses.isLoading && (
                <Tag minimal style={{ marginLeft: 8, fontSize: 11 }}>{(buses.data ?? []).length}</Tag>
              )}
            </h4>
          </div>
          <Card className="panel-card">
            {buses.isLoading && !buses.data && (
              <div style={{ padding: 24, textAlign: "center" }}><Spinner /></div>
            )}
            {(buses.data ?? []).length === 0 && !buses.isLoading && (
              <div className="empty-state">
                <Icon icon="time" size={24} />
                <p>No bus arrivals available</p>
              </div>
            )}
            {(buses.data ?? []).length > 0 && (
              <HTMLTable bordered striped style={{ width: "100%" }}>
                <thead>
                  <tr><th>Line</th><th>Destination</th><th>Stop</th><th>ETA</th></tr>
                </thead>
                <tbody>
                  {(buses.data ?? []).map((bus) => (
                    <tr key={bus.vehicleId}>
                      <td>
                        <Tag minimal intent={Intent.PRIMARY} style={{ fontSize: 11 }}>{bus.lineName ?? "—"}</Tag>
                      </td>
                      <td style={{ fontSize: 12 }}>{bus.destination ?? "—"}</td>
                      <td style={{ fontSize: 12, color: "#738694" }}>{bus.stopName ?? "—"}</td>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>
                        {bus.timeToStationSeconds != null ? `${Math.round(Number(bus.timeToStationSeconds) / 60)}m` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </HTMLTable>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
