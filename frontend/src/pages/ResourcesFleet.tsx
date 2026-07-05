import { useState, useMemo, useCallback } from "react";
import {
  Card, Tag, Intent, Spinner, HTMLTable, Button, Callout, Icon,
  InputGroup, NumericInput, Dialog, DialogBody, DialogFooter, FormGroup, Switch
} from "@blueprintjs/core";
import { useOsdkObjects, useOsdkAction } from "@osdk/react/experimental";
import { CrisisResource, LiveTransportUnit, $Actions } from "@crisis-logistics-command-app/sdk";

type SortDir = "asc" | "desc";
const FLEET_PAGE_SIZE = 50;

export default function ResourcesFleet() {
  // ─── Resources State ───
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newResourceType, setNewResourceType] = useState("");
  const [newQuantity, setNewQuantity] = useState(0);
  const [newThreshold, setNewThreshold] = useState(0);

  // Update dialog
  const [updateTarget, setUpdateTarget] = useState<string | null>(null);
  const [updateQty, setUpdateQty] = useState(0);

  // Resource filters
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string | null>(null);
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [quantitySort, setQuantitySort] = useState<SortDir | null>(null);

  // ─── Fleet State ───
  const [vehicleFilter, setVehicleFilter] = useState<string | null>(null);
  const [fleetVisible, setFleetVisible] = useState(FLEET_PAGE_SIZE);

  // ─── Data Fetching ───
  const resources = useOsdkObjects(CrisisResource, { pageSize: 100 });
  const units = useOsdkObjects(LiveTransportUnit, { pageSize: 200 });

  // ─── Actions ───
  const createAction = useOsdkAction($Actions.createCrisisResource);
  const deleteAction = useOsdkAction($Actions.deleteCrisisResource);
  const updateAction = useOsdkAction($Actions.updateResourceInventory);

  // ─── Resource filtering ───
  const resourceTypes = useMemo(() => {
    const types = new Set<string>();
    (resources.data ?? []).forEach(r => {
      if (r.resourceType) {
        types.add(r.resourceType);
      }
    });
    return Array.from(types).sort();
  }, [resources.data]);

  const filteredResources = useMemo(() => {
    let data = resources.data ?? [];
    if (resourceTypeFilter) {
      data = data.filter(r => r.resourceType === resourceTypeFilter);
    }
    if (showLowStockOnly) {
      data = data.filter(r => (r.quantityUnits ?? 0) < (r.criticalThreshold ?? 0));
    }
    if (quantitySort) {
      data = [...data].sort((a, b) => {
        const aQty = a.quantityUnits ?? 0;
        const bQty = b.quantityUnits ?? 0;
        return quantitySort === "asc" ? aQty - bQty : bQty - aQty;
      });
    }
    return data;
  }, [resources.data, resourceTypeFilter, showLowStockOnly, quantitySort]);

  // ─── Fleet filtering ───
  const vehicleTypes = useMemo(() => {
    const types = new Set<string>();
    (units.data ?? []).forEach(u => {
      if (u.vehicleType) {
        types.add(u.vehicleType);
      }
    });
    return Array.from(types).sort();
  }, [units.data]);

  const filteredUnits = useMemo(() => {
    const all = units.data ?? [];
    if (!vehicleFilter) {
      return all;
    }
    return all.filter(u => u.vehicleType === vehicleFilter);
  }, [units.data, vehicleFilter]);

  const visibleUnits = filteredUnits.slice(0, fleetVisible);
  const hasMoreUnits = fleetVisible < filteredUnits.length;

  // ─── Handlers ───
  const handleCreate = useCallback(async () => {
    if (!newResourceType || newQuantity <= 0) {
      return;
    }
    try {
      await createAction.applyAction({
        "resource-type": newResourceType,
        "quantity": newQuantity,
        "critical-threshold": newThreshold > 0 ? newThreshold : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "location-id": undefined as any,
      });
      setNewResourceType("");
      setNewQuantity(0);
      setNewThreshold(0);
      setShowCreateForm(false);
    } catch {
      // error handled by hook
    }
  }, [createAction, newResourceType, newQuantity, newThreshold]);

  const handleDelete = useCallback(async (res: CrisisResource.OsdkInstance) => {
    try {
      await deleteAction.applyAction({ "crisis-resource": res });
    } catch {
      // error handled by hook
    }
  }, [deleteAction]);

  const handleUpdate = useCallback(async () => {
    if (!updateTarget || updateQty < 0) {
      return;
    }
    const target = (resources.data ?? []).find(r => r.resourceId === updateTarget);
    if (!target) {
      return;
    }
    try {
      await updateAction.applyAction({ "resource": target, "new-quantity": updateQty });
      setUpdateTarget(null);
    } catch {
      // error handled by hook
    }
  }, [updateAction, updateTarget, updateQty, resources.data]);

  const hasError = resources.error || units.error;

  return (
    <div>
      {hasError && (
        <Callout intent={Intent.DANGER} title="Error" style={{ marginBottom: 12 }} icon="error">
          Some data could not be loaded.
        </Callout>
      )}

      {/* ═══ RESOURCES SECTION ═══ */}
      <div className="section-header">
        <h4>
          <Icon icon="inbox" size={14} style={{ marginRight: 6, opacity: 0.6 }} />
          Resources
          {!resources.isLoading && (
            <Tag minimal style={{ marginLeft: 8, fontSize: 11 }}>{filteredResources.length}</Tag>
          )}
        </h4>
        <Button
          icon={showCreateForm ? "cross" : "plus"}
          text={showCreateForm ? "Cancel" : "Create Resource"}
          intent={showCreateForm ? Intent.NONE : Intent.SUCCESS}
          small
          minimal
          onClick={() => setShowCreateForm(!showCreateForm)}
        />
      </div>

      {/* Resource Filters */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <Button
          text="All Types"
          small
          minimal={resourceTypeFilter !== null}
          intent={resourceTypeFilter === null ? Intent.PRIMARY : Intent.NONE}
          onClick={() => setResourceTypeFilter(null)}
        />
        {resourceTypes.map(rt => (
          <Button
            key={rt}
            text={rt}
            small
            minimal={resourceTypeFilter !== rt}
            intent={resourceTypeFilter === rt ? Intent.PRIMARY : Intent.NONE}
            onClick={() => setResourceTypeFilter(resourceTypeFilter === rt ? null : rt)}
          />
        ))}
        <div style={{ width: 1, height: 16, background: "#d8e1e8" }} />
        <Switch
          checked={showLowStockOnly}
          onChange={() => setShowLowStockOnly(!showLowStockOnly)}
          label="Low Stock Only"
          style={{ marginBottom: 0, fontSize: 12 }}
        />
      </div>

      <Card className="panel-card" style={{ marginBottom: 24 }}>
        {/* Inline Create Form */}
        {showCreateForm && (
          <div className="inline-form">
            <FormGroup label="Type" inline={false} style={{ margin: 0 }}>
              <InputGroup
                placeholder="e.g. Medical Kit"
                value={newResourceType}
                onChange={(e) => setNewResourceType(e.target.value)}
                small
                style={{ width: 160 }}
              />
            </FormGroup>
            <FormGroup label="Quantity" inline={false} style={{ margin: 0 }}>
              <NumericInput
                value={newQuantity}
                onValueChange={(v) => setNewQuantity(v)}
                min={0}
                small
                style={{ width: 90 }}
              />
            </FormGroup>
            <FormGroup label="Threshold" inline={false} style={{ margin: 0 }}>
              <NumericInput
                value={newThreshold}
                onValueChange={(v) => setNewThreshold(v)}
                min={0}
                small
                style={{ width: 90 }}
              />
            </FormGroup>
            <Button
              intent={Intent.SUCCESS}
              text="Create"
              icon="tick"
              small
              onClick={handleCreate}
              loading={createAction.isPending}
              disabled={!newResourceType || newQuantity <= 0}
            />
          </div>
        )}

        {resources.isLoading && !resources.data && (
          <div style={{ padding: 32, textAlign: "center" }}><Spinner /></div>
        )}
        {filteredResources.length === 0 && !resources.isLoading && (
          <div className="empty-state">
            <Icon icon="inbox" size={24} />
            <p>{resourceTypeFilter || showLowStockOnly ? "No resources match the current filters" : "No resources created yet. Click \"Create Resource\" to add one."}</p>
          </div>
        )}
        {filteredResources.length > 0 && (
          <HTMLTable bordered striped style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Resource ID</th>
                <th>Type</th>
                <th
                  style={{ cursor: "pointer", userSelect: "none" }}
                  onClick={() => setQuantitySort(prev => prev === "asc" ? "desc" : prev === "desc" ? null : "asc")}
                >
                  Quantity {quantitySort && <Icon icon={quantitySort === "asc" ? "sort-asc" : "sort-desc"} size={12} />}
                </th>
                <th>Threshold</th>
                <th>Status</th>
                <th style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredResources.map((res) => {
                const isLow = (res.quantityUnits ?? 0) < (res.criticalThreshold ?? 0);
                return (
                  <tr key={res.resourceId}>
                    <td style={{ fontSize: 12, fontFamily: "monospace" }}>{res.resourceId}</td>
                    <td><strong>{res.resourceType ?? "—"}</strong></td>
                    <td style={{ fontWeight: 600 }}>{res.quantityUnits ?? 0}</td>
                    <td style={{ color: "#738694" }}>{res.criticalThreshold ?? 0}</td>
                    <td>
                      <Tag intent={isLow ? Intent.DANGER : Intent.SUCCESS} minimal>
                        {isLow ? "LOW" : "OK"}
                      </Tag>
                    </td>
                    <td>
                      <Button
                        icon="edit"
                        minimal
                        small
                        intent={Intent.PRIMARY}
                        onClick={() => { setUpdateTarget(res.resourceId); setUpdateQty(res.quantityUnits ?? 0); }}
                        style={{ marginRight: 4 }}
                      />
                      <Button
                        icon="trash"
                        minimal
                        small
                        intent={Intent.DANGER}
                        onClick={() => handleDelete(res)}
                        loading={deleteAction.isPending}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </HTMLTable>
        )}
      </Card>

      {/* Update Dialog */}
      <Dialog
        isOpen={updateTarget !== null}
        onClose={() => setUpdateTarget(null)}
        title="Update Resource Quantity"
        icon="edit"
      >
        <DialogBody>
          <p style={{ fontSize: 13, color: "#5c7080" }}>Enter the new quantity for this resource:</p>
          <NumericInput
            value={updateQty}
            onValueChange={(v) => setUpdateQty(v)}
            min={0}
            fill
          />
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button text="Cancel" onClick={() => setUpdateTarget(null)} />
              <Button
                intent={Intent.PRIMARY}
                text="Update"
                onClick={handleUpdate}
                loading={updateAction.isPending}
              />
            </>
          }
        />
      </Dialog>

      {/* ═══ FLEET SECTION ═══ */}
      <div className="section-header">
        <h4>
          <Icon icon="drive-time" size={14} style={{ marginRight: 6, opacity: 0.6 }} />
          Fleet
          <Tag minimal style={{ marginLeft: 8, fontSize: 11 }}>{filteredUnits.length}</Tag>
        </h4>
      </div>

      {/* Vehicle Type Filter Pills */}
      <div className="filter-pills" style={{ marginBottom: 12 }}>
        <Button
          text="All"
          small
          minimal={vehicleFilter !== null}
          intent={vehicleFilter === null ? Intent.PRIMARY : Intent.NONE}
          onClick={() => { setVehicleFilter(null); setFleetVisible(FLEET_PAGE_SIZE); }}
        />
        {vehicleTypes.map((vt) => (
          <Button
            key={vt}
            text={vt}
            small
            minimal={vehicleFilter !== vt}
            intent={vehicleFilter === vt ? Intent.PRIMARY : Intent.NONE}
            onClick={() => { setVehicleFilter(vt); setFleetVisible(FLEET_PAGE_SIZE); }}
          />
        ))}
      </div>

      <Card className="panel-card">
        {units.isLoading && !units.data && (
          <div style={{ padding: 32, textAlign: "center" }}><Spinner /></div>
        )}
        {filteredUnits.length === 0 && !units.isLoading && (
          <div className="empty-state">No units match the selected filter</div>
        )}
        {filteredUnits.length > 0 && (
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
                  <td style={{ fontSize: 12, fontFamily: "monospace" }}>{unit.unitId}</td>
                  <td>
                    <Tag intent={
                      unit.vehicleType === "HELICOPTER" ? Intent.SUCCESS :
                      unit.vehicleType === "AIRCRAFT" ? Intent.PRIMARY :
                      unit.vehicleType === "AMBULANCE" ? Intent.DANGER : Intent.NONE
                    } minimal style={{ fontSize: 11 }}>{unit.vehicleType ?? "—"}</Tag>
                  </td>
                  <td style={{ fontSize: 12 }}>{unit.unitStatus ?? "—"}</td>
                  <td style={{ fontSize: 11, color: "#738694" }}>{unit.lastSeenAt ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        )}

        {hasMoreUnits && (
          <div style={{ textAlign: "center", padding: 12 }}>
            <Button
              text={`Load more (${fleetVisible}/${filteredUnits.length})`}
              onClick={() => setFleetVisible((prev) => prev + FLEET_PAGE_SIZE)}
              minimal
              small
              intent={Intent.PRIMARY}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
