# Frontend Architecture — React OSDK Application

> Technical architecture for the React 19 frontend built with Palantir OSDK, Leaflet, and BlueprintJS.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL DATA SOURCES                        │
├──────────────┬──────────────────┬──────────────┬────────────────────┤
│  TfL API     │  Google Maps     │  Air Quality │  Airlabs Aviation  │
│  (Incidents, │  (Directions,    │  API         │  (Aircraft         │
│   Lines,     │   Distance       │              │   positions)       │
│   Roads,     │   Matrix)        │              │                    │
│   Buses)     │                  │              │                    │
└──────┬───────┴────────┬─────────┴──────┬───────┴────────┬───────────┘
       │                │                │                │
       ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     PALANTIR FOUNDRY PLATFORM                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐        │
│  │  Data         │    │  Python       │    │  Ontology     │        │
│  │  Connection   │───▶│  Transforms   │───▶│  (15 Object   │        │
│  │  (API Syncs)  │    │  + PySpark    │    │   Types)      │        │
│  │               │    │  Analytics    │    │               │        │
│  └───────────────┘    └───────────────┘    └───────┬───────┘        │
│                                                     │               │
│  ┌───────────────┐                                  │               │
│  │  TypeScript   │◀─────────────────────────────────┘               │
│  │  Functions    │  (Ontology SDK)                                  │
│  │  (v2)         │                                                  │
│  └───────────────┘                                                  │
└─────────────────────────────────────────────────────────────────────┘
       │
       │  OSDK (OAuth 2.0 + REST)
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     REACT APPLICATION (This Repo)                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────────┐         │
│  │  OAuth   │   │  OsdkProvider│   │  React Router        │         │
│  │  Client  │──▶│  (Context)   │──▶│  (/ + /auth/callback)│         │
│  └──────────┘   └──────────────┘   └──────────┬───────────┘         │
│                                                 │                   │
│                                    ┌────────────▼────────────┐      │
│                                    │       Home.tsx          │      │
│                                    │  Navbar + Role Selector │      │
│                                    │        + Tabs           │      │
│                                    └────────────┬────────────┘      │
│                                                 │                   │
│       ┌──────────┬──────────┬──────────┬────────┴───────┐           │
│       ▼          ▼          ▼          ▼                ▼           │
│  ┌─────────┐┌─────────┐┌─────────┐┌─────────┐  ┌──────────┐         │
│  │Dashboard││ Active  ││Transport││Resources│  │Analytics │         │
│  │Map+Hist ││Incidents││ Status  ││ & Fleet │  │Forecast+ │         │
│  │+Metrics ││Table+   ││Lines+   ││CRUD+    │  │Trends+   │         │
│  │+Anomaly ││Detail+  ││Roads+   ││Fleet    │  │Peaks+    │         │
│  │+LowStock││Response ││Buses    │└─────────┘  │Hotspots  │         │
│  └─────────┘└─────────┘└─────────┘             └──────────┘         │
│                                                                     │
│  Shared Components:                                                 │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────┐      │
│  │ CrisisMap  │ │ Pagination │ │ FilterBar  │ │    Error     │      │
│  │ (Leaflet)  │ │(page-size) │ │ (popover)  │ │  Boundary    │      │
│  └────────────┘ └────────────┘ └────────────┘ └──────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
1. User opens app → OAuth redirect → token obtained
2. OsdkProvider2 initializes client with token
3. Role selector (localStorage) determines which tabs are visible
4. Each page uses useOsdkObjects() to fetch data reactively
5. Data is filtered/sorted client-side based on user interactions
6. Anomaly detection is computed client-side from IncidentTrend rolling averages
7. Actions (create/update/delete/respond) use useOsdkAction() → write back to Ontology
8. Ontology syncs changes back to backing datasets
9. PySpark analytics (trends, heatmap, hotspots, forecast, anomaly) computed server-side, fetched via OSDK
```

## Component Architecture

### State Management

The application uses **local component state** (useState/useMemo) rather than a global store. This is intentional:

- Each tab manages its own filter/sort/pagination state independently
- `useOsdkObjects` provides built-in caching and reactivity
- The only cross-cutting state is the **role selector**, persisted in `localStorage`

### Role-Based Access

The navbar role selector (All Access, Ops Manager, Dispatcher, Resource Officer, Shift Supervisor) filters which tabs are rendered. The selection persists across sessions via `localStorage`. This demonstrates the RBAC UX pattern; a production deployment would enforce access server-side via Foundry groups and object/action permissions.

### Map Component (`CrisisMap.tsx`)

| Use Case | Behavior |
|----------|----------|
| **Main map** (Dashboard) | `FitBounds` to show all markers, reset button available |
| **Filtered map** (Dashboard with filters) | Shows only filtered incidents/locations |
| **Mini-map** (Active Incidents detail) | `MapUpdater` flies to selected incident coordinates |

Key design decisions:
- **Standard `<TileLayer>`** loads CartoDB tiles as `<img>` elements (CSP `img-src` compatible)
- **Severity color coding**: Red (Severe) → Orange (Serious) → Blue (Moderate) → Gray (Minimal)
- **Lazy loaded** via `React.lazy()` to prevent map JS from blocking initial render

### Reusable UI Components

- **`Pagination.tsx`** — numbered pagination (Back / 1 / 2 / … / Next) with a "show on page" size selector (10 / 25 / 50) and a range indicator, used across all data tables
- **`FilterBar.tsx`** — a consistent "Add filters" popover with dismissable active-filter chips and a "Clear all" control, used across Active Incidents, Transport Status, Resources & Fleet, and Analytics

### Filtering Architecture

All filtering is **client-side** after initial data fetch:

```
OSDK (server) → Full dataset → Client-side filter/sort → Rendered UI
```

Rationale:
- Dataset sizes are small (100-200 objects) — no performance concern
- Instant filter response (no round-trip to server)
- Complex multi-filter combinations would require many OSDK query variations

### Action Architecture

OSDK Actions follow this pattern:

```
User Input → useOsdkAction hook → Server confirmation → Toast feedback
```

Four user-facing actions are implemented:
1. **Create Crisis Resource** — form collects params, submits to action type
2. **Update Resource Inventory** — dialog pre-filled with current values, submits delta
3. **Delete Crisis Resource** — confirmation then delete
4. **Respond to Incident** — records an acknowledge / reroute / escalate response with notes, auto-stamping the current user and timestamp

Incident responses form an **immutable audit trail** — they are recorded and displayed as a response-history timeline, never edited or deleted by end users. (A separate admin-only delete action exists for data cleanup and is not exposed in the UI.)

### PySpark Analytics

Five server-side computed analytics consumed via OSDK:

| Section | Object Type | PySpark Features |
|---------|-------------|-----------------|
| Incident Trends | `IncidentTrend` | `Window.rangeBetween`, rolling avg, `groupBy` |
| Peak Hours | `PeakHourHeatmap` | `.pivot()`, `dayofweek()`, cross-tab |
| Hotspots | `TransportHotspot` | `row_number()`, severity weighting, spatial grid |
| Disruption Forecast | `DisruptionForecast` | day × hour × zone aggregation, risk scoring |
| Anomaly Detection | (dataset) | Z-score over 14-day rolling window (SPIKE/DROP/NORMAL) |

The anomaly signal is also derived client-side from `IncidentTrend` rolling averages to drive the Dashboard alert banner.

## Security Considerations

- **OAuth 2.0** with PKCE flow (public client, no client secret)
- **CSP** enforced by Foundry hosting — only whitelisted domains for img-src
- **No secrets in source** — only public client ID and Foundry URL in .env files
- **OSDK handles auth** — tokens are managed by the OAuth provider
- **Immutable audit trail** — incident responses capture who responded and when, and are not user-editable

## Performance

| Optimization | Implementation |
|-------------|----------------|
| Vite 8 + Rolldown | Rust-based bundler, ~430ms production builds |
| Lazy loading | Map component loaded via `React.lazy()` |
| Memoization | `useMemo` for filtered/sorted data, histogram computations |
| Tab rendering | `renderActiveTabPanelOnly={true}` — only active tab renders |
| Pagination | Numbered pagination with page-size control (10 / 25 / 50 per page) |
| Query scoping | Response queries filtered server-side to exclude irrelevant rows |
| Severity sorting | Pre-sorted by severity order for O(1) color lookups |

## Deployment

```
Code change → git push → CI (lint + build) → Snapshot upload
                    │
                    └→ git tag → CI → Production deploy to Foundry Website Hosting
```

Version strategy: `package-json` (reads version from `package.json`)
