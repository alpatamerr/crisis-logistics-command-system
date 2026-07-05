# # Frontend Architecture — React OSDK Application

> Technical architecture for the React 19 frontend built with Palantir OSDK, Leaflet, and BlueprintJS.


## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL DATA SOURCES                        │
├──────────────┬──────────────────┬──────────────┬────────────────────┤
│  TfL API     │  Google Maps     │  Air Quality │  Manual Input      │
│  (Incidents, │  (Directions,    │  API         │  (OSDK Actions)    │
│   Lines,     │   Distance       │              │                    │
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
│  │  Connection   │───▶│  Transforms   │───▶│  (10 Object   │        │
│  │  (TfL Sync)   │    │  (Clean/      │    │   Types)      │        │
│  │               │    │   Enrich)     │    │               │        │
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
│                                    │    (Navbar + Tabs)      │      │
│                                    └────────────┬────────────┘      │
│                                                 │                   │
│       ┌──────────┬──────────┬──────────┬────────┴───────┐           │
│       ▼          ▼          ▼          ▼                ▼           │
│  ┌─────────┐┌─────────┐┌─────────┐┌─────────┐  ┌──────────┐         │
│  │Dashboard││ Active  ││Transport││Resources│  │Analytics │         │
│  │         ││Incidents││ Status  ││ & Fleet │  │          │         │
│  │Map+Hist ││Table+   ││Lines+   ││CRUD+    │  │Tables+   │         │
│  │+Metrics ││Detail   ││Roads+   ││Fleet    │  │Metrics   │         │
│  └─────────┘└─────────┘│Buses    │└─────────┘  └──────────┘         │
│                        └─────────┘                                  │
│                                                                     │
│  Shared Components:                                                 │
│  ┌──────────────────┐  ┌────────────┐  ┌──────────────┐             │
│  │   CrisisMap      │  │   Error    │  │   Loading    │             │
│  │   (Leaflet)      │  │  Boundary  │  │   Spinner    │             │
│  └──────────────────┘  └────────────┘  └──────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
1. User opens app → OAuth redirect → token obtained
2. OsdkProvider2 initializes client with token
3. Each page uses useOsdkObjects() to fetch data reactively
4. Data is filtered/sorted client-side based on user interactions
5. Actions (create/update/delete) use useOsdkAction() → writes back to Ontology
6. Ontology syncs changes back to backing datasets
```

## Component Architecture

### State Management

The application uses **local component state** (useState/useMemo) rather than a global store. This is intentional:

- Each tab manages its own filter/sort state independently
- `useOsdkObjects` provides built-in caching and reactivity
- No cross-tab state dependencies exist

### Map Component (`CrisisMap.tsx`)

The map component handles three distinct use cases:

| Use Case | Behavior |
|----------|----------|
| **Main map** (Dashboard) | `FitBounds` to show all markers, reset button available |
| **Filtered map** (Dashboard with filters) | Shows only filtered incidents/locations |
| **Mini-map** (Active Incidents detail) | `MapUpdater` flies to selected incident coordinates |

Key design decisions:
- **Standard `<TileLayer>`** loads CartoDB tiles as `<img>` elements (CSP `img-src` compatible)
- **Severity color coding**: Red (Severe) → Orange (Serious) → Blue (Moderate) → Gray (Minimal)
- **Lazy loaded** via `React.lazy()` to prevent map JS from blocking initial render

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
User Input → useOsdkAction hook → Optimistic UI update → Server confirmation
```

Three actions are implemented:
1. **Create** — form collects params, submits to action type
2. **Update** — dialog pre-filled with current values, submits delta
3. **Delete** — confirmation then delete

## Security Considerations

- **OAuth 2.0** with PKCE flow (public client, no client secret)
- **CSP** enforced by Foundry hosting — only whitelisted domains for img-src
- **No secrets in source** — only public client ID and Foundry URL in .env files
- **OSDK handles auth** — tokens are managed by the OAuth provider, never stored in localStorage manually

## Performance

| Optimization | Implementation |
|-------------|----------------|
| Lazy loading | Map component loaded via `React.lazy()` |
| Memoization | `useMemo` for filtered/sorted data, histogram computations |
| Tab rendering | `renderActiveTabPanelOnly={true}` — only active tab renders |
| Pagination | "Load more" pattern for large tables (25 items at a time) |
| Severity sorting | Pre-sorted by severity order for O(1) color lookups |

## Deployment

```
Code change → git push → CI (lint + build) → Snapshot upload
                    │
                    └→ git tag → CI → Production deploy to Foundry Website Hosting
```

Version strategy: `package-json` (reads version from `package.json`)
