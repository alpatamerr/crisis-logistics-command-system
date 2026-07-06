import { useState, useMemo } from "react";
import { Card, Tag, Intent, Spinner, HTMLTable, Callout, Icon, Button, InputGroup } from "@blueprintjs/core";
import { useOsdkObjects } from "@osdk/react/experimental";
import { LineStatus, RoadStatus, BusArrival } from "@crisis-logistics-command-app/sdk";

export default function TransportStatus() {
  // Filters
  const [modeFilter, setModeFilter] = useState<string | null>(null);
  const [lineSearch, setLineSearch] = useState("");
  const [roadSeverityFilter, setRoadSeverityFilter] = useState<string | null>(null);
  const [roadSearch, setRoadSearch] = useState("");

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

  // Unique modes for filter pills
  const modes = useMemo(() => {
    const modeSet = new Set<string>();
    (disrupted.data ?? []).forEach(line => {
      if (line.mode) {
        modeSet.add(line.mode);
      }
    });
    return Array.from(modeSet).sort();
  }, [disrupted.data]);

  // Unique road severities
  const roadSeverities = useMemo(() => {
    const sevSet = new Set<string>();
    (roads.data ?? []).forEach(road => {
      if (road.statusSeverity) {
        sevSet.add(road.statusSeverity);
      }
    });
    return Array.from(sevSet).sort();
  }, [roads.data]);

  // Filtered disrupted lines
  const filteredLines = useMemo(() => {
    let data = disrupted.data ?? [];
    if (modeFilter) {
      data = data.filter(line => line.mode === modeFilter);
    }
    if (lineSearch) {
      const term = lineSearch.toLowerCase();
      data = data.filter(line => {
        const name = (line.lineName ?? "").toLowerCase();
        const reason = (line.disruptionReason ?? "").toLowerCase();
        return name.includes(term) || reason.includes(term);
      });
    }
    return data;
  }, [disrupted.data, modeFilter, lineSearch]);

  // Filtered roads
  const filteredRoads = useMemo(() => {
    let data = roads.data ?? [];
    if (roadSeverityFilter) {
      data = data.filter(road => road.statusSeverity === roadSeverityFilter);
    }
    if (roadSearch) {
      const term = roadSearch.toLowerCase();
      data = data.filter(road => {
        const name = (road.roadName ?? "").toLowerCase();
        return name.includes(term);
      });
    }
    return data;
  }, [roads.data, roadSeverityFilter, roadSearch]);

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
            <Tag minimal style={{ marginLeft: 8, fontSize: 11 }}>{filteredLines.length}</Tag>
          )}
        </h4>
      </div>

      {/* Mode filter pills + search */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <Button
          text="All Modes"
          small
          minimal={modeFilter !== null}
          intent={modeFilter === null ? Intent.PRIMARY : Intent.NONE}
          onClick={() => setModeFilter(null)}
        />
        {modes.map(m => (
          <Button
            key={m}
            text={m}
            small
            minimal={modeFilter !== m}
            intent={modeFilter === m ? Intent.PRIMARY : Intent.NONE}
            onClick={() => setModeFilter(modeFilter === m ? null : m)}
          />
        ))}
        <div style={{ flex: 1 }} />
        <InputGroup
          leftIcon="search"
          placeholder="Search lines..."
          value={lineSearch}
          onChange={(e) => setLineSearch(e.target.value)}
          small
          style={{ width: 180 }}
        />
      </div>

      <Card className="panel-card" style={{ marginBottom: 20 }}>
        {disrupted.isLoading && !disrupted.data && (
          <div style={{ padding: 32, textAlign: "center" }}><Spinner /></div>
        )}
        {filteredLines.length === 0 && !disrupted.isLoading && (
          <div className="empty-state">
            <Icon icon="tick-circle" size={24} />
            <p>{modeFilter || lineSearch ? "No lines match the current filters" : "No disruptions currently reported"}</p>
          </div>
        )}
        {filteredLines.length > 0 && (
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
              {filteredLines.map((line) => (
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
                  <td style={{ maxWidth: 400, fontSize: 12, color: "#394b59", lineHeight: 1.4 }}>
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
                <Tag minimal style={{ marginLeft: 8, fontSize: 11 }}>{filteredRoads.length}</Tag>
              )}
            </h4>
          </div>

          {/* Road filters */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <Button
              text="All"
              small
              minimal={roadSeverityFilter !== null}
              intent={roadSeverityFilter === null ? Intent.PRIMARY : Intent.NONE}
              onClick={() => setRoadSeverityFilter(null)}
            />
            {roadSeverities.map(sev => (
              <Button
                key={sev}
                text={sev}
                small
                minimal={roadSeverityFilter !== sev}
                intent={roadSeverityFilter === sev ? (
                  sev === "Serious" ? Intent.DANGER : sev === "Good" ? Intent.SUCCESS : Intent.PRIMARY
                ) : Intent.NONE}
                onClick={() => setRoadSeverityFilter(roadSeverityFilter === sev ? null : sev)}
              />
            ))}
            <InputGroup
              leftIcon="search"
              placeholder="Search roads..."
              value={roadSearch}
              onChange={(e) => setRoadSearch(e.target.value)}
              small
              style={{ width: 140 }}
            />
          </div>

          <Card className="panel-card">
            {roads.isLoading && !roads.data && (
              <div style={{ padding: 24, textAlign: "center" }}><Spinner /></div>
            )}
            {filteredRoads.length === 0 && !roads.isLoading && (
              <div className="empty-state">{roadSeverityFilter || roadSearch ? "No roads match filters" : "No road data available"}</div>
            )}
            {filteredRoads.length > 0 && (
              <HTMLTable bordered striped style={{ width: "100%" }}>
                <thead>
                  <tr><th>Road</th><th>Severity</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {filteredRoads.map((road) => (
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
