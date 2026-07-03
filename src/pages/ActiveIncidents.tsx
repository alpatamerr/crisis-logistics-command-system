import { useState } from "react";
import { Card, H4, Tag, Intent, Spinner, HTMLTable, InputGroup, Callout, Button } from "@blueprintjs/core";
import { useOsdkObjects } from "@osdk/react/experimental";
import { LiveIncident } from "@crisis-logistics-command-app/sdk";

const PAGE_SIZE = 25;

export default function ActiveIncidents() {
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const incidents = useOsdkObjects(LiveIncident, {
    orderBy: { severityLevel: "asc" },
    pageSize: 200,
  });

  const filtered = (incidents.data ?? []).filter((inc) => {
    if (!search) {
      return true;
    }
    const term = search.toLowerCase();
    const desc = String(inc.description ?? "").toLowerCase();
    const type = String(inc.incidentType ?? "").toLowerCase();
    const sev = String(inc.severityLevel ?? "").toLowerCase();
    return desc.includes(term) || type.includes(term) || sev.includes(term);
  });

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <H4 style={{ margin: 0 }}>Incident Log ({filtered.length} total)</H4>
        <InputGroup
          leftIcon="search"
          placeholder="Search incidents..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
          style={{ width: 300 }}
        />
      </div>

      {incidents.error && (
        <Callout intent={Intent.DANGER} title="Error" style={{ marginBottom: 16 }}>
          Failed to load incidents. Please try again.
        </Callout>
      )}

      <Card elevation={1}>
        {incidents.isLoading && !incidents.data && <Spinner />}
        <HTMLTable bordered striped style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Severity</th>
              <th>Type</th>
              <th>Description</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((inc) => (
              <tr key={inc.incidentId}>
                <td>
                  <Tag intent={
                    inc.severityLevel === "Severe" ? Intent.DANGER :
                    inc.severityLevel === "Serious" ? Intent.WARNING :
                    inc.severityLevel === "Moderate" ? Intent.PRIMARY : Intent.NONE
                  } minimal>{inc.severityLevel ?? "Unknown"}</Tag>
                </td>
                <td>{inc.incidentType ?? "—"}</td>
                <td style={{ maxWidth: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {inc.description ?? "—"}
                </td>
                <td>{inc.polledAt != null ? new Date(inc.polledAt).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </HTMLTable>

        {hasMore && (
          <div style={{ textAlign: "center", padding: 16 }}>
            <Button
              text={`Load more (showing ${visibleCount} of ${filtered.length})`}
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
              minimal
              intent={Intent.PRIMARY}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
