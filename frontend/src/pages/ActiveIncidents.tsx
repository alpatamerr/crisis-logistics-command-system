import { lazy, Suspense, useState, useMemo } from "react";
import { Card, Tag, Intent, Spinner, HTMLTable, InputGroup, Callout, Icon, Button, HTMLSelect } from "@blueprintjs/core";
import { exportToCsv } from "../utils/csvExport";
import { useOsdkObjects } from "@osdk/react/experimental";
import { LiveIncident } from "@crisis-logistics-command-app/sdk";

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

const PAGE_SIZE = 25;

export default function ActiveIncidents() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

  // Unique incident types for filter
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
      // Text search
      if (search) {
        const term = search.toLowerCase();
        const desc = String(inc.description ?? "").toLowerCase();
        const type = String(inc.incidentType ?? "").toLowerCase();
        const sev = String(inc.severityLevel ?? "").toLowerCase();
        if (!desc.includes(term) && !type.includes(term) && !sev.includes(term)) {
          return false;
        }
      }
      // Severity filter
      if (severityFilters.size > 0 && !severityFilters.has(inc.severityLevel ?? "")) {
        return false;
      }
      // Type filter
      if (typeFilter && inc.incidentType !== typeFilter) {
        return false;
      }
      return true;
    });

    // Sort
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

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const selected = useMemo(
    () => (incidents.data ?? []).find((inc) => inc.incidentId === selectedId) ?? null,
    [incidents.data, selectedId]
  );

  const activeFilterCount = severityFilters.size + (typeFilter ? 1 : 0) + (search ? 1 : 0);

  return (
    <div className="split-layout split-layout-master-detail" style={{ height: "calc(100vh - 160px)" }}>
      {/* Left: Incident Table */}
      <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Search + count */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexShrink: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "#1c2127" }}>
            Incidents ({filtered.length})
          </span>
          <Button
            small
            minimal
            icon="export"
            text="CSV"
            onClick={() => exportToCsv("incidents", filtered.map(i => ({
              severity: i.severityLevel ?? "",
              type: i.incidentType ?? "",
              description: i.description ?? "",
              latitude: i.latitude ?? "",
              longitude: i.longitude ?? "",
              updated: i.polledAt ?? "",
            })))}
          />
          <InputGroup
            leftIcon="search"
            placeholder="Search..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
            style={{ width: 220 }}
            small
          />
        </div>

        {/* Filter bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap", flexShrink: 0 }}>
          {/* Severity chips */}
          {SEVERITY_LEVELS.map(sev => (
            <Tag
              key={sev}
              interactive
              intent={severityFilters.has(sev) ? SEVERITY_INTENT[sev] : Intent.NONE}
              minimal={!severityFilters.has(sev)}
              onClick={() => { toggleSeverityFilter(sev); setVisibleCount(PAGE_SIZE); }}
              style={{ cursor: "pointer", fontSize: 11 }}
            >
              {sev}
            </Tag>
          ))}

          <div style={{ width: 1, height: 16, background: "#d8e1e8" }} />

          {/* Type filter dropdown */}
          <HTMLSelect
            value={typeFilter ?? ""}
            onChange={(e) => { setTypeFilter(e.target.value || null); setVisibleCount(PAGE_SIZE); }}
            minimal
            style={{ fontSize: 12 }}
          >
            <option value="">All Types</option>
            {incidentTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </HTMLSelect>

          {activeFilterCount > 0 && (
            <>
              <div style={{ flex: 1 }} />
              <Button
                small
                minimal
                intent={Intent.WARNING}
                icon="filter-remove"
                text="Clear"
                onClick={() => { setSeverityFilters(new Set()); setTypeFilter(null); setSearch(""); }}
              />
            </>
          )}
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
