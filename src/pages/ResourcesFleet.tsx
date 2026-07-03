import { useState } from "react";
import { Card, H4, Tag, Intent, Spinner, HTMLTable, Button, Callout } from "@blueprintjs/core";
import { useOsdkObjects } from "@osdk/react/experimental";
import { CrisisResource, LiveTransportUnit } from "@crisis-logistics-command-app/sdk";

const FLEET_PAGE_SIZE = 50;

export default function ResourcesFleet() {
  const [fleetVisible, setFleetVisible] = useState(FLEET_PAGE_SIZE);
  const resources = useOsdkObjects(CrisisResource, { pageSize: 50 });
  const units = useOsdkObjects(LiveTransportUnit, { pageSize: 200 });

  const allUnits = units.data ?? [];
  const visibleUnits = allUnits.slice(0, fleetVisible);
  const hasMoreUnits = fleetVisible < allUnits.length;
  const hasError = resources.error || units.error;

  return (
    <div>
      {hasError && (
        <Callout intent={Intent.DANGER} title="Error" style={{ marginBottom: 16 }}>
          Some data could not be loaded. Please try again.
        </Callout>
      )}

      <H4>Resources</H4>
      <Card elevation={1} style={{ marginBottom: 24 }}>
        {resources.isLoading && !resources.data && <Spinner />}
        <HTMLTable bordered striped style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Resource</th>
              <th>Type</th>
              <th>Quantity</th>
              <th>Threshold</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(resources.data ?? []).length === 0 && !resources.isLoading && (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "#8a9ba8" }}>No resources created yet</td></tr>
            )}
            {(resources.data ?? []).map((res) => {
              const isLow = (res.quantityUnits ?? 0) < (res.criticalThreshold ?? 0);
              return (
                <tr key={res.resourceId}>
                  <td><strong>{res.resourceId}</strong></td>
                  <td>{res.resourceType ?? "—"}</td>
                  <td>{res.quantityUnits ?? 0}</td>
                  <td>{res.criticalThreshold ?? 0}</td>
                  <td>
                    <Tag intent={isLow ? Intent.DANGER : Intent.SUCCESS} minimal>
                      {isLow ? "LOW" : "OK"}
                    </Tag>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </HTMLTable>
      </Card>

      <H4>Fleet ({allUnits.length} units)</H4>
      <Card elevation={1}>
        {units.isLoading && !units.data && <Spinner />}
        <HTMLTable bordered striped style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Unit ID</th>
              <th>Vehicle Type</th>
              <th>Status</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {visibleUnits.map((unit) => (
              <tr key={unit.unitId}>
                <td>{unit.unitId}</td>
                <td>
                  <Tag intent={
                    unit.vehicleType === "HELICOPTER" ? Intent.SUCCESS :
                    unit.vehicleType === "AIRCRAFT" ? Intent.PRIMARY : Intent.NONE
                  } minimal>{unit.vehicleType ?? "—"}</Tag>
                </td>
                <td>{unit.unitStatus ?? "—"}</td>
                <td>{unit.lastSeenAt ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </HTMLTable>

        {hasMoreUnits && (
          <div style={{ textAlign: "center", padding: 16 }}>
            <Button
              text={`Load more (showing ${fleetVisible} of ${allUnits.length})`}
              onClick={() => setFleetVisible((prev) => prev + FLEET_PAGE_SIZE)}
              minimal
              intent={Intent.PRIMARY}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
