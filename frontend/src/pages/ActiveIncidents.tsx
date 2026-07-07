import { lazy, Suspense, useState, useMemo } from "react";
import { Card, Tag, Intent, Spinner, HTMLTable, Callout, Icon } from "@blueprintjs/core";
import { exportToCsv } from "../utils/csvExport";
import { useOsdkObjects } from "@osdk/react/experimental";
import { LiveIncident } from "@crisis-logistics-command-app/sdk";
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

  const incidents = useOsdkObjects(LiveIncident, {
    orderBy: { severityLevel: "asc" },
    pageSize: 200,
  });

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
                  <td style={{ fontSize: 12 }}>{inc.incidentType ?? "—"}</td>
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
