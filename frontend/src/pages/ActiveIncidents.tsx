import { lazy, Suspense, useState, useMemo } from "react";
import { Card, Tag, Intent, Spinner, HTMLTable, Callout, Icon, Button, Dialog, DialogBody, DialogFooter, FormGroup, HTMLSelect, TextArea, OverlayToaster, Position } from "@blueprintjs/core";
import { exportToCsv } from "../utils/csvExport";
import { useOsdkObjects, useOsdkAction } from "@osdk/react/experimental";
import { LiveIncident, IncidentResponse, $Actions } from "@crisis-logistics-command-app/sdk";

const toaster = OverlayToaster.createAsync({ position: Position.TOP });
import Pagination from "@/components/Pagination";
import FilterBar, { FilterSection, FilterOption } from "@/components/FilterBar";

const CrisisMap = lazy(() => import("@/components/CrisisMap"));

const SEVERITY_INTENT: Record<string, Intent> = {
  Severe: Intent.DANGER,
  Serious: Intent.WARNING,
  Moderate: Intent.PRIMARY,
  Minimal: Intent.NONE,
};

const SEVERITY_ORDER: Record<string, number> = {
  Severe: 1,
  Serious: 2,
  Moderate: 3,
  Minimal: 4,
};

const SEVERITY_LEVELS = ["Severe", "Serious", "Moderate", "Minimal"];

type SortField = "severity" | "updated";
type SortDir = "asc" | "desc";

export default function ActiveIncidents() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Filters
  const [severityFilters, setSeverityFilters] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  // Sort
  const [sortField, setSortField] = useState<SortField>("severity");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Respond to Incident
  const [respondTarget, setRespondTarget] = useState<typeof selected>(null);
  const [respondAction, setRespondAction] = useState("acknowledged");
  const [respondNotes, setRespondNotes] = useState("");
  const [responding, setResponding] = useState(false);
  const respondToIncident = useOsdkAction($Actions.respondToIncident);

  const handleRespond = async () => {
    if (!respondTarget) { return; }
    setResponding(true);
    try {
      await respondToIncident.applyAction({
        incident: respondTarget,
        responseAction: respondAction,
        responseNotes: respondNotes || undefined,
      });
      (await toaster).show({ message: `✓ ${respondAction} — ${respondTarget.incidentId}`, intent: Intent.SUCCESS, timeout: 3000 });
      setRespondTarget(null);
      setRespondAction("acknowledged");
      setRespondNotes("");
    } catch {
      (await toaster).show({ message: "Failed to record response", intent: Intent.DANGER, timeout: 3000 });
    } finally {
      setResponding(false);
    }
  };

  const incidents = useOsdkObjects(LiveIncident, {
    orderBy: { severityLevel: "asc" },
    pageSize: 200,
  });

  // All incident responses (user's own actions).
  // Filter incidentId not null to exclude ghost rows from a shared backing dataset.
  const responses = useOsdkObjects(IncidentResponse, {
    where: { incidentId: { $isNull: false } },
    pageSize: 500,
  });

  // Count of responses per incident ID
  const responseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (responses.data ?? []).forEach(r => {
      if (r.incidentId) {
        counts.set(r.incidentId, (counts.get(r.incidentId) ?? 0) + 1);
      }
    });
    return counts;
  }, [responses.data]);

  // Responses for the selected incident, most recent first
  const selectedResponses = useMemo(() => {
    if (!selectedId) { return []; }
    return (responses.data ?? [])
      .filter(r => r.incidentId === selectedId)
      .sort((a, b) => {
        const ta = a.respondedAt ? new Date(a.respondedAt).getTime() : 0;
        const tb = b.respondedAt ? new Date(b.respondedAt).getTime() : 0;
        return tb - ta;
      });
  }, [responses.data, selectedId]);

  const incidentTypes = useMemo(() => {
    const types = new Set<string>();
    (incidents.data ?? []).forEach(inc => {
      if (inc.incidentType) {
        types.add(inc.incidentType);
      }
    });
    return Array.from(types).sort();
  }, [incidents.data]);

  const toggleSeverityFilter = (sev: string) => {
    setSeverityFilters(prev => {
      const next = new Set(prev);
      if (next.has(sev)) { next.delete(sev); } else { next.add(sev); }
      return next;
    });
    setCurrentPage(1);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    let data = (incidents.data ?? []).filter((inc) => {
      if (search) {
        const term = search.toLowerCase();
        const desc = String(inc.description ?? "").toLowerCase();
        const type = String(inc.incidentType ?? "").toLowerCase();
        const sev = String(inc.severityLevel ?? "").toLowerCase();
        if (!desc.includes(term) && !type.includes(term) && !sev.includes(term)) {
          return false;
        }
      }
      if (severityFilters.size > 0 && !severityFilters.has(inc.severityLevel ?? "")) {
        return false;
      }
      if (typeFilter && inc.incidentType !== typeFilter) {
        return false;
      }
      return true;
    });

    data = [...data].sort((a, b) => {
      if (sortField === "severity") {
        const aOrder = SEVERITY_ORDER[a.severityLevel ?? ""] ?? 5;
        const bOrder = SEVERITY_ORDER[b.severityLevel ?? ""] ?? 5;
        return sortDir === "asc" ? aOrder - bOrder : bOrder - aOrder;
      } else {
        const aTime = a.polledAt != null ? new Date(a.polledAt).getTime() : 0;
        const bTime = b.polledAt != null ? new Date(b.polledAt).getTime() : 0;
        return sortDir === "asc" ? aTime - bTime : bTime - aTime;
      }
    });
    return data;
  }, [incidents.data, search, severityFilters, typeFilter, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selected = useMemo(
    () => (incidents.data ?? []).find((inc) => inc.incidentId === selectedId) ?? null,
    [incidents.data, selectedId]
  );

  const activeFilters = [
    ...Array.from(severityFilters).map(sev => ({
      key: `sev-${sev}`,
      label: sev,
      intent: SEVERITY_INTENT[sev],
      onRemove: () => toggleSeverityFilter(sev),
    })),
    ...(typeFilter ? [{
      key: "type",
      label: typeFilter,
      intent: Intent.NONE as Intent,
      onRemove: () => { setTypeFilter(null); setCurrentPage(1); },
    }] : []),
  ];

  const clearAll = () => {
    setSeverityFilters(new Set());
    setTypeFilter(null);
    setSearch("");
    setCurrentPage(1);
  };

  return (
    <div className="split-layout split-layout-master-detail" style={{ height: "calc(100vh - 160px)" }}>
      {/* Left: Incident Table */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <FilterBar
          search={{
            value: search,
            onChange: (v) => { setSearch(v); setCurrentPage(1); },
            placeholder: "Search incidents...",
          }}
          activeFilters={activeFilters}
          onClearAll={clearAll}
          extra={
            <button
              className="export-btn"
              onClick={() => exportToCsv("incidents", filtered.map(i => ({
                severity: i.severityLevel ?? "",
                type: i.incidentType ?? "",
                description: i.description ?? "",
                latitude: i.latitude ?? "",
                longitude: i.longitude ?? "",
                updated: i.polledAt ?? "",
              })))}
            >
              <Icon icon="export" size={12} />
              <span>Export</span>
            </button>
          }
        >
          <FilterSection title="Severity">
            {SEVERITY_LEVELS.map(sev => (
              <FilterOption
                key={sev}
                label={sev}
                selected={severityFilters.has(sev)}
                onClick={() => toggleSeverityFilter(sev)}
                intent={SEVERITY_INTENT[sev]}
              />
            ))}
          </FilterSection>
          <FilterSection title="Incident Type">
            {incidentTypes.map(t => (
              <FilterOption
                key={t}
                label={t}
                selected={typeFilter === t}
                onClick={() => { setTypeFilter(typeFilter === t ? null : t); setCurrentPage(1); }}
              />
            ))}
          </FilterSection>
        </FilterBar>

        {incidents.error && (
          <Callout intent={Intent.DANGER} title="Error" style={{ marginBottom: 8 }} icon="error">
            Failed to load incidents.
          </Callout>
        )}

        <Card className="panel-card" style={{ flex: 1, overflow: "auto" }}>
          {incidents.isLoading && !incidents.data && (
            <div style={{ padding: 32, textAlign: "center" }}><Spinner /></div>
          )}
          <HTMLTable bordered striped interactive style={{ width: "100%" }}>
            <thead>
              <tr>
                <th
                  style={{ cursor: "pointer", userSelect: "none" }}
                  onClick={() => toggleSort("severity")}
                >
                  Severity {sortField === "severity" && <Icon icon={sortDir === "asc" ? "sort-asc" : "sort-desc"} size={12} />}
                </th>
                <th>Type</th>
                <th
                  style={{ cursor: "pointer", userSelect: "none" }}
                  onClick={() => toggleSort("updated")}
                >
                  Updated {sortField === "updated" && <Icon icon={sortDir === "asc" ? "sort-asc" : "sort-desc"} size={12} />}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((inc) => (
                <tr
                  key={inc.incidentId}
                  className={`clickable-row ${selectedId === inc.incidentId ? "selected-row" : ""}`}
                  onClick={() => setSelectedId(inc.incidentId)}
                >
                  <td>
                    <Tag intent={SEVERITY_INTENT[inc.severityLevel ?? ""] ?? Intent.NONE} minimal>
                      {inc.severityLevel ?? "Unknown"}
                    </Tag>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {inc.incidentType ?? "—"}
                    {(responseCounts.get(inc.incidentId) ?? 0) > 0 && (
                      <Tag minimal intent={Intent.SUCCESS} style={{ marginLeft: 6, fontSize: 10 }} icon="confirm">
                        {responseCounts.get(inc.incidentId)}
                      </Tag>
                    )}
                  </td>
                  <td style={{ fontSize: 11, color: "#738694", whiteSpace: "nowrap" }}>
                    {inc.polledAt != null ? new Date(inc.polledAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            pageSize={pageSize}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
            totalItems={filtered.length}
          />
        </Card>
      </div>

      {/* Right: Detail Panel */}
      <div className="detail-panel" style={{ overflow: "auto" }}>
        {!selected ? (
          <div className="empty-state" style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <Icon icon="selection" size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <span>Select an incident to view details</span>
          </div>
        ) : (
          <>
            <div className="detail-header">
              <Tag intent={SEVERITY_INTENT[selected.severityLevel ?? ""] ?? Intent.NONE} large>
                {selected.severityLevel ?? "Unknown"}
              </Tag>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{selected.incidentType ?? "Incident"}</span>
            </div>

            <div className="detail-row">
              <span className="detail-label">ID</span>
              <span className="detail-value">{selected.incidentId}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Type</span>
              <span className="detail-value">{selected.incidentType ?? "—"}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Severity</span>
              <span className="detail-value">{selected.severityLevel ?? "—"}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Latitude</span>
              <span className="detail-value">{selected.latitude ?? "—"}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Longitude</span>
              <span className="detail-value">{selected.longitude ?? "—"}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Last Updated</span>
              <span className="detail-value">
                {selected.polledAt != null ? new Date(selected.polledAt).toLocaleString() : "—"}
              </span>
            </div>

            {selected.description && (
              <div className="detail-description">{selected.description}</div>
            )}

            {/* Respond Actions */}
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              <Button
                small
                intent={Intent.SUCCESS}
                icon="confirm"
                text="Acknowledge"
                onClick={() => { setRespondTarget(selected); setRespondAction("acknowledged"); }}
              />
              <Button
                small
                intent={Intent.WARNING}
                icon="refresh"
                text="Rerouted"
                onClick={() => { setRespondTarget(selected); setRespondAction("rerouted"); }}
              />
              <Button
                small
                intent={Intent.DANGER}
                icon="arrow-up"
                text="Escalate"
                onClick={() => { setRespondTarget(selected); setRespondAction("escalated"); }}
              />
            </div>

            {/* Response History */}
            {selectedResponses.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#5c7080", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                  <Icon icon="history" size={12} style={{ marginRight: 6, opacity: 0.6 }} />
                  Response History ({selectedResponses.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedResponses.map((r) => (
                    <div
                      key={r.responseId}
                      style={{
                        padding: "8px 12px",
                        background: "#f5f8fa",
                        borderRadius: 6,
                        borderLeft: `3px solid ${
                          r.responseAction === "escalated" ? "#c23030" :
                          r.responseAction === "rerouted" ? "#d9822b" : "#0f9960"
                        }`,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <Tag
                          minimal
                          intent={
                            r.responseAction === "escalated" ? Intent.DANGER :
                            r.responseAction === "rerouted" ? Intent.WARNING : Intent.SUCCESS
                          }
                          style={{ fontSize: 11, fontWeight: 600 }}
                        >
                          {r.responseAction === "escalated" ? "⬆" : r.responseAction === "rerouted" ? "↻" : "✓"} {r.responseAction}
                        </Tag>
                        <span style={{ fontSize: 10, color: "#a7b6c2" }}>
                          {r.respondedAt != null ? new Date(r.respondedAt).toLocaleString() : "—"}
                        </span>
                      </div>
                      {r.notes && (
                        <div style={{ fontSize: 12, color: "#394b59", marginTop: 6 }}>{r.notes}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selected.latitude != null && selected.longitude != null && (
              <div style={{ marginTop: 16 }}>
                <Suspense fallback={<Spinner size={20} />}>
                  <CrisisMap
                    incidents={[selected]}
                    locations={[]}
                    height={180}
                    center={{ lat: selected.latitude, lng: selected.longitude }}
                    zoom={14}
                  />
                </Suspense>
              </div>
            )}
          </>
        )}
      </div>
      {/* Respond to Incident Dialog */}
      <Dialog
        isOpen={respondTarget != null}
        onClose={() => setRespondTarget(null)}
        title={`${respondAction.charAt(0).toUpperCase() + respondAction.slice(1)} — ${respondTarget?.incidentId ?? ""}`}
        icon="confirm"
      >
        <DialogBody>
          <FormGroup label="Response Action">
            <HTMLSelect
              value={respondAction}
              onChange={(e) => setRespondAction(e.target.value)}
              fill
            >
              <option value="acknowledged">✓ Acknowledged</option>
              <option value="rerouted">↻ Rerouted</option>
              <option value="escalated">⬆ Escalated</option>
            </HTMLSelect>
          </FormGroup>
          <FormGroup label="Notes (optional)">
            <TextArea
              value={respondNotes}
              onChange={(e) => setRespondNotes(e.target.value)}
              placeholder="e.g. 3 drivers rerouted away from zone"
              fill
              rows={3}
            />
          </FormGroup>
        </DialogBody>
        <DialogFooter
          actions={
            <>
              <Button text="Cancel" onClick={() => setRespondTarget(null)} />
              <Button
                text="Submit Response"
                intent={Intent.SUCCESS}
                icon="confirm"
                loading={responding}
                onClick={handleRespond}
              />
            </>
          }
        />
      </Dialog>
    </div>
  );
}
