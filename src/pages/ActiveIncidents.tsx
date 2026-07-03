import { lazy, Suspense, useState, useMemo } from "react";
import { Card, Tag, Intent, Spinner, HTMLTable, InputGroup, Callout, Icon, Button } from "@blueprintjs/core";
import { useOsdkObjects } from "@osdk/react/experimental";
import { LiveIncident } from "@crisis-logistics-command-app/sdk";

const CrisisMap = lazy(() => import("@/components/CrisisMap"));

const SEVERITY_INTENT: Record<string, Intent> = {
  Severe: Intent.DANGER,
  Serious: Intent.WARNING,
  Moderate: Intent.PRIMARY,
  Minimal: Intent.NONE,
};

const PAGE_SIZE = 25;

const SEVERITY_ORDER: Record<string, number> = {
  Severe: 1,
  Serious: 2,
  Moderate: 3,
  Minimal: 4,
};

type SortDir = "asc" | "desc";

export default function ActiveIncidents() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [severitySort, setSeveritySort] = useState<SortDir>("asc");

  const incidents = useOsdkObjects(LiveIncident, {
    orderBy: { severityLevel: "asc" },
    pageSize: 200,
  });

  const filtered = useMemo(() => {
    let data = (incidents.data ?? []).filter((inc) => {
      if (!search) {
        return true;
      }
      const term = search.toLowerCase();
      const desc = String(inc.description ?? "").toLowerCase();
      const type = String(inc.incidentType ?? "").toLowerCase();
      const sev = String(inc.severityLevel ?? "").toLowerCase();
      return desc.includes(term) || type.includes(term) || sev.includes(term);
    });
    // Sort by severity
    data = [...data].sort((a, b) => {
      const aOrder = SEVERITY_ORDER[a.severityLevel ?? ""] ?? 5;
      const bOrder = SEVERITY_ORDER[b.severityLevel ?? ""] ?? 5;
      return severitySort === "asc" ? aOrder - bOrder : bOrder - aOrder;
    });
    return data;
  }, [incidents.data, search, severitySort]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const selected = useMemo(
    () => (incidents.data ?? []).find((inc) => inc.incidentId === selectedId) ?? null,
    [incidents.data, selectedId]
  );

  return (
    <div className="split-layout split-layout-master-detail" style={{ height: "calc(100vh - 160px)" }}>
      {/* Left: Incident Table */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexShrink: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "#1c2127" }}>
            Incidents ({filtered.length})
          </span>
          <InputGroup
            leftIcon="search"
            placeholder="Search..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
            style={{ width: 220 }}
            small
          />
        </div>

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
                  onClick={() => setSeveritySort(prev => prev === "asc" ? "desc" : "asc")}
                >
                  Severity <Icon icon={severitySort === "asc" ? "sort-asc" : "sort-desc"} size={12} />
                </th>
                <th>Type</th>
                <th>Description</th>
                <th>Updated</th>
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
                  <td style={{ fontSize: 12 }}>{inc.incidentType ?? "—"}</td>
                  <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
                    {inc.description ?? "—"}
                  </td>
                  <td style={{ fontSize: 11, color: "#738694", whiteSpace: "nowrap" }}>
                    {inc.polledAt != null ? new Date(inc.polledAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </HTMLTable>

          {hasMore && (
            <div style={{ textAlign: "center", padding: 12 }}>
              <Button
                text={`Load more (${visibleCount}/${filtered.length})`}
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                minimal
                small
                intent={Intent.PRIMARY}
              />
            </div>
          )}
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

            {/* Mini Map */}
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
    </div>
  );
}
