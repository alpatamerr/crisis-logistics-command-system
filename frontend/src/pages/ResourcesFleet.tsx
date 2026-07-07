import { useState, useMemo, useCallback } from "react";
import {
  Card, Tag, Intent, Spinner, HTMLTable, Button, Callout, Icon,
  NumericInput, Dialog, DialogBody, DialogFooter, FormGroup, HTMLSelect,
  OverlayToaster, Position
} from "@blueprintjs/core";

const toaster = OverlayToaster.createAsync({ position: Position.TOP });
import { useOsdkObjects, useOsdkAction } from "@osdk/react/experimental";
import { CrisisResource, LiveTransportUnit, LiveLocation, $Actions } from "@crisis-logistics-command-app/sdk";
import Pagination from "@/components/Pagination";
import FilterBar, { FilterSection, FilterOption, FilterToggle } from "@/components/FilterBar";

export default function ResourcesFleet() {
  // ─── Resources State ───
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newResourceType, setNewResourceType] = useState("");
  const [newQuantity, setNewQuantity] = useState(1);
  const [newThreshold, setNewThreshold] = useState(10);
  const [newLocationId, setNewLocationId] = useState("");

  // Update dialog
  const [updateTarget, setUpdateTarget] = useState<string | null>(null);
  const [updateQty, setUpdateQty] = useState(0);

  // Resource filters
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string | null>(null);
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [quantitySort, setQuantitySort] = useState<"asc" | "desc" | null>(null);

  // ─── Fleet State ───
  const [vehicleFilter, setVehicleFilter] = useState<string | null>(null);
  const [fleetPage, setFleetPage] = useState(1);
  const [fleetPageSize, setFleetPageSize] = useState(25);

  // ─── Data Fetching ───
  const resources = useOsdkObjects(CrisisResource, { pageSize: 100 });
  const units = useOsdkObjects(LiveTransportUnit, { pageSize: 200 });
  const locations = useOsdkObjects(LiveLocation, { pageSize: 100 });

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

  const fleetTotalPages = Math.ceil(filteredUnits.length / fleetPageSize);
  const visibleUnits = filteredUnits.slice((fleetPage - 1) * fleetPageSize, fleetPage * fleetPageSize);

  // ─── Handlers ───
  const handleCreate = useCallback(async () => {
    if (!newResourceType || !newLocationId || newQuantity < 1) {
      return;
    }
    const selectedLocation = newLocationId
      ? (locations.data ?? []).find(l => l.locationId === newLocationId)
      : undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params: any = {
        "resource-type": newResourceType,
        "quantity": newQuantity,
        "critical-threshold": newThreshold > 0 ? newThreshold : null,
      };
      if (selectedLocation) {
        params["location-id"] = selectedLocation;
      }
      await createAction.applyAction(params);
      setNewResourceType("");
      setNewQuantity(1);
      setNewThreshold(10);
      setNewLocationId("");
      setShowCreateForm(false);
      (await toaster).show({ message: "Resource created successfully", intent: Intent.SUCCESS, icon: "tick" });
    } catch {
      (await toaster).show({ message: "Failed to create resource", intent: Intent.DANGER, icon: "error" });
    }
  }, [createAction, newResourceType, newQuantity, newThreshold, newLocationId, locations.data]);

  const handleDelete = useCallback(async (res: CrisisResource.OsdkInstance) => {
    try {
      await deleteAction.applyAction({ "crisis-resource": res });
      (await toaster).show({ message: "Resource deleted", intent: Intent.WARNING, icon: "trash" });
    } catch {
      (await toaster).show({ message: "Failed to delete resource", intent: Intent.DANGER, icon: "error" });
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
      (await toaster).show({ message: "Quantity updated", intent: Intent.SUCCESS, icon: "tick" });
    } catch {
      (await toaster).show({ message: "Failed to update resource", intent: Intent.DANGER, icon: "error" });
    }
  }, [updateAction, updateTarget, updateQty, resources.data]);

  const hasError = resources.error || units.error;

  // Active filter chips
  const resourceActiveFilters = [
    ...(resourceTypeFilter ? [{
      key: "type",
      label: resourceTypeFilter.replace(/_/g, " "),
      intent: Intent.PRIMARY as Intent,
      onRemove: () => setResourceTypeFilter(null),
    }] : []),
    ...(showLowStockOnly ? [{
      key: "lowstock",
      label: "Low Stock",
      intent: Intent.WARNING as Intent,
      onRemove: () => setShowLowStockOnly(false),
    }] : []),
  ];

  const fleetActiveFilters = vehicleFilter ? [{
    key: "vehicle",
    label: vehicleFilter,
    intent: Intent.PRIMARY as Intent,
    onRemove: () => { setVehicleFilter(null); setFleetPage(1); },
  }] : [];

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

      <FilterBar
        activeFilters={resourceActiveFilters}
        onClearAll={() => { setResourceTypeFilter(null); setShowLowStockOnly(false); }}
      >
        <FilterSection title="Resource Type">
          {resourceTypes.map(t => (
            <FilterOption
              key={t}
              label={t.replace(/_/g, " ")}
              selected={resourceTypeFilter === t}
              onClick={() => setResourceTypeFilter(resourceTypeFilter === t ? null : t)}
            />
          ))}
        </FilterSection>
        <FilterSection title="Status">
          <FilterToggle
            label="Low Stock Only"
            checked={showLowStockOnly}
            onChange={setShowLowStockOnly}
          />
        </FilterSection>
      </FilterBar>

      <Card className="panel-card" style={{ marginBottom: 24 }}>
        {/* Inline Create Form */}
        {showCreateForm && (
          <div className="inline-form">
            <FormGroup label="Type" inline={false} style={{ margin: 0 }}>
              <HTMLSelect
                value={newResourceType}
                onChange={(e) => setNewResourceType(e.target.value)}
                style={{ width: 180 }}
              >
                <option value="">Select type...</option>
                <option value="FOOD_RATIONS">Food Rations</option>
                <option value="POTABLE_WATER">Potable Water</option>
                <option value="MEDICAL_KITS">Medical Kits</option>
                <option value="FUEL">Fuel</option>
                <option value="BLANKETS">Blankets</option>
                <option value="SHELTER_EQUIPMENT">Shelter Equipment</option>
              </HTMLSelect>
            </FormGroup>
            <FormGroup label="Location" inline={false} style={{ margin: 0 }}>
              <HTMLSelect
                value={newLocationId}
                onChange={(e) => setNewLocationId(e.target.value)}
                style={{ width: 180 }}
              >
                <option value="">Select location...</option>
                {(locations.data ?? []).map(loc => (
                  <option key={loc.locationId} value={loc.locationId}>
                    {loc.locationName ?? loc.locationId}
                  </option>
                ))}
              </HTMLSelect>
            </FormGroup>
            <FormGroup label="Quantity" inline={false} style={{ margin: 0 }}>
              <NumericInput
                value={newQuantity}
                onValueChange={(v) => setNewQuantity(v)}
                min={1}
                placeholder="Min: 1"
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
              disabled={!newResourceType || !newLocationId || newQuantity < 1}
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

      <FilterBar
        activeFilters={fleetActiveFilters}
        onClearAll={() => { setVehicleFilter(null); setFleetPage(1); }}
      >
        <FilterSection title="Vehicle Type">
          {vehicleTypes.map(vt => (
            <FilterOption
              key={vt}
              label={vt}
              selected={vehicleFilter === vt}
              onClick={() => { setVehicleFilter(vehicleFilter === vt ? null : vt); setFleetPage(1); }}
            />
          ))}
        </FilterSection>
      </FilterBar>

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
                  <td style={{ fontSize: 11, color: "#738694" }}>
                    {unit.lastSeenAt
                      ? (() => {
                          const diff = Date.now() - new Date(unit.lastSeenAt).getTime();
                          const mins = Math.floor(diff / 60000);
                          if (mins < 60) { return `${mins}m ago`; }
                          const hrs = Math.floor(mins / 60);
                          if (hrs < 24) { return `${hrs}h ago`; }
                          return `${Math.floor(hrs / 24)}d ago`;
                        })()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>
        )}

        <Pagination
          currentPage={fleetPage}
          totalPages={fleetTotalPages}
          onPageChange={setFleetPage}
          pageSize={fleetPageSize}
          onPageSizeChange={(size) => { setFleetPageSize(size); setFleetPage(1); }}
          totalItems={filteredUnits.length}
        />
      </Card>
    </div>
  );
}
