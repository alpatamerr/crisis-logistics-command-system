# 🚨 Crisis Logistics Command Center

A real-time operational dashboard for monitoring and managing crisis logistics across West London, built with **React 19**, **Palantir's Ontology SDK (OSDK)**, and **Leaflet maps**.

> 📂 This is the **React frontend**. See the [root README](../README.md) for full system overview and the [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed technical design.

![React](https://img.shields.io/badge/React-19-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-6-blue) ![Vite](https://img.shields.io/badge/Vite-8-purple) ![Blueprint](https://img.shields.io/badge/BlueprintJS-6-green)

## 🎯 Overview

The Crisis Logistics Command Center provides real-time situational awareness for crisis management teams. It aggregates live data from Transport for London (TfL), Google Maps Platform, and custom Ontology objects to deliver:

- **Live incident tracking** with severity-based visualization on an interactive map
- **Transport network monitoring** including tube lines, roads, and bus arrivals
- **Resource inventory management** with CRUD operations and low-stock alerts
- **Route analytics** with travel times and journey planning data
- **Air quality monitoring** with current and forecasted conditions
- **⚡ PySpark-powered analytics** — incident trends, peak disruption hours, geographic hotspots

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React 19 + TypeScript 6 |
| **Build** | Vite 8 (Rolldown bundler, ~430ms builds) |
| **UI Components** | BlueprintJS 6 (Palantir's design system) |
| **Charts** | Recharts (line, bar, horizontal bar) |
| **Data Layer** | Palantir OSDK (`@osdk/react` experimental hooks) |
| **Maps** | Leaflet + react-leaflet 5 (CartoDB Voyager tiles) |
| **Routing** | React Router 8 |
| **Auth** | OAuth 2.0 via `@osdk/oauth` |
| **Hosting** | Palantir Foundry Website Hosting |

## 📁 Project Structure

```
src/
├── main.tsx                     # App entry — OsdkProvider2, CSS imports
├── client.ts                    # OSDK OAuth client setup
├── router.tsx                   # Routes: / and /auth/callback
├── AuthCallback.tsx             # OAuth callback handler
├── Home.tsx                     # Main layout — Navbar + Tabs + Live indicator + Auto-refresh
├── Home.css                     # Navbar gradient, live pulse animation
├── index.css                    # Global styles, grid layouts, hover effects, shimmer skeleton
│
├── components/
│   ├── CrisisMap.tsx            # Leaflet map with severity markers, legend, reset view
│   ├── SectionErrorBoundary.tsx # Per-section error boundary with retry button
│   ├── ErrorBoundary.tsx        # Global error boundary
│   └── Loading.tsx              # Loading spinner
│
├── utils/
│   ├── autoRefresh.ts           # 15-min auto-refresh hook with countdown timer
│   ├── csvExport.ts             # CSV file download utility
│   └── notifications.ts         # Browser notification for severe incidents
│
└── pages/
    ├── Dashboard.tsx            # Tab 1: Map + histograms + metrics + severe alert
    ├── ActiveIncidents.tsx      # Tab 2: Incident table + detail panel + CSV export
    ├── TransportStatus.tsx      # Tab 3: Disrupted lines, roads, bus arrivals
    ├── ResourcesFleet.tsx       # Tab 4: Resource CRUD + toast + fleet monitoring
    └── Analytics.tsx            # Tab 5: Charts + tables + PySpark analytics

```

## 🗄️ Ontology Data Model

### Object Types (13)

| Object Type | Primary Key | Description |
|-------------|-------------|-------------|
| `LiveIncident` | `incidentId` | TfL road/transport incidents with severity and geolocation |
| `LiveLocation` | `locationId` | Key infrastructure points (hospitals, stations, etc.) |
| `LiveTransportUnit` | `unitId` | Fleet vehicles with status and GPS positions |
| `LineStatus` | `lineId` | Tube/rail/bus line disruption status |
| `RoadStatus` | `roadId` | Major road conditions |
| `BusArrival` | `vehicleId` | Real-time bus arrival predictions |
| `CrisisResource` | `resourceId` | Inventory items (medical kits, water, blankets) |
| `TravelTime` | `pairId` | Calculated travel times between hubs and incidents |
| `JourneyPlan` | `journeyId` | Multi-modal route plans |
| `AirQuality` | `forecastType` | Current and forecasted air quality bands |
| ⚡ `IncidentTrend` | `trendId` | Daily trends with 7-day rolling averages (PySpark) |
| ⚡ `PeakHourHeatmap` | `heatmapId` | Hour × day disruption frequency matrix (PySpark) |
| ⚡ `TransportHotspot` | `gridCell` | Geographic hotspot detection with severity scoring (PySpark) |

### Action Types (3)

| Action | Description |
|--------|-------------|
| **Create Crisis Resource** | Add new inventory items to a location |
| **Update Resource Inventory** | Modify quantity of existing resources |
| **Delete Crisis Resource** | Remove a resource record |

## 🖥️ Application Tabs

### Tab 1: Situation Overview
Three-column layout with interactive histogram filters on each side and a Leaflet map in the center. Features:
- **Multi-select** incident type and location category histograms
- **Severity filter chips** (Severe / Serious / Moderate / Minimal)
- **Time range filter** (All Time / 1h / 6h / 24h / 7d)
- **4 bottom metric cards** (incidents, disrupted lines, low resources, transport units)
- **Reset view button** (⌂) to restore default map bounds

### Tab 2: Active Incidents
Master-detail split layout:
- Left: searchable, sortable incident table with severity filter chips and type dropdown
- Right: selected incident detail panel with description, metadata, and a mini-map that flies to the incident location

### Tab 3: Transport Status
- **Full-width disrupted lines** table with mode filter pills and search
- **Two-column bottom**: road status (with severity filter + search) and bus arrivals

### Tab 4: Resources & Fleet
- **Resources section**: type filter pills, "Low Stock Only" toggle, sortable quantity column, inline create form, edit/delete actions via OSDK
- **Fleet section**: vehicle type filter pills, status indicators

### Tab 5: Analytics
- **3 metric cards**: Air Quality, Avg Travel Time, Routes Calculated
- **Travel Times table**: sortable by travel time, searchable by hub name
- **Journey Plans table**: sortable by duration, filterable by transport mode
- ⚡ **Incident Trends**: daily counts by severity with 7-day rolling averages (PySpark)
- ⚡ **Peak Disruption Hours**: hour × day-of-week frequency matrix (PySpark)
- ⚡ **Transport Hotspots**: ranked geographic areas by severity-weighted score (PySpark)

## 🚀 Getting Started

### Prerequisites

- Node.js 24+ (see `.nvmrc`)
- Access to a Palantir Foundry instance with the Crisis Logistics ontology

### Local Development

```bash
# Install dependencies
npm install

# Start development server on http://localhost:8080
npm run dev
```

### Code Workspaces Development

```bash
npm run dev:remote
```

### Building

```bash
npm run build
```

### Deploying

Production deployments are handled automatically via Foundry CI when git tags are pushed:

```bash
git tag <x.y.z>
git push origin tag <x.y.z>
```

## ⚙️ Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_FOUNDRY_API_URL` | Foundry instance URL |
| `VITE_FOUNDRY_CLIENT_ID` | OAuth client ID from Developer Console |
| `VITE_FOUNDRY_REDIRECT_URL` | OAuth callback URL |
| `VITE_FOUNDRY_ONTOLOGY_RID` | Ontology RID for OSDK |

### CSP (Content Security Policy)

For map tiles to load, the following must be added to **Developer Console → Website Hosting → Advanced → imgSrc**:

```
https://*.basemaps.cartocdn.com
```

## 📊 Data Sources

| Source | Data |
|--------|------|
| **TfL Unified API** | Incidents, line status, road status, bus arrivals |
| **Google Maps Platform** | Travel times, distance calculations, journey planning |
| **Manual Entry** | Crisis resources (via OSDK Actions) |
| **Air Quality API** | London air quality forecasts |
| **⚡ PySpark Analytics** | Incident trends, peak hours, transport hotspots |

## 🛠️ Key Technical Decisions

## 🛠️ Key Technical Decisions

1. **`@osdk/react` experimental hooks** (`useOsdkObjects`, `useOsdkAction`) — provides reactive data fetching with automatic caching
2. **Leaflet over Google Maps** — Google Maps blocked by CSP `script-src 'self'`; Leaflet works with `img-src` CSP for tile loading
3. **Client-side filtering and sorting** — all data loaded via OSDK, then filtered/sorted in-memory for instant UI response
4. **BlueprintJS** — Palantir's own design system ensures visual consistency with Foundry Workshop
5. **Lazy-loaded map** — `CrisisMap` uses `React.lazy()` to avoid blocking initial page load
6. **Vite 8 + Rolldown** — Rust-based bundler for ~430ms production builds (10x faster than Vite 7)
7. **Auto-refresh (15min)** — visible countdown timer in navbar; manual refresh on click; matches pipeline schedule
8. **Browser notifications** — alerts operators when new severe incidents are detected
9. **Per-section error boundaries** — one tab crashing doesn't bring down the entire app; each section has retry
10. **Recharts** — lightweight React-native charting for incident trends, peak hours bar chart, hotspot severity ranking
11. **Toast notifications** — immediate feedback after CRUD operations (create/update/delete)
12. **CSV export** — one-click data download for incident records


## 📝 License

Proprietary, built for a private client; shared here for portfolio/demonstration purposes.
