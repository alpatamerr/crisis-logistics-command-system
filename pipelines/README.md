# Crisis Logistics Command System — Data Pipelines

A real-time crisis logistics management platform built on Palantir Foundry, providing unified situational awareness across transport networks, incident tracking, resource management, and fleet operations for West London.

> 📂 This is the **data pipeline layer**. See the [root README](../README.md) for full system overview and the [frontend/](../frontend) directory for the React application.

![Platform](https://img.shields.io/badge/Platform-Palantir%20Foundry-black)
![Language](https://img.shields.io/badge/Transforms-Python%20%7C%20PySpark%20%7C%20Polars-blue)
![Functions](https://img.shields.io/badge/Functions-TypeScript%20V2-purple)
![APIs](https://img.shields.io/badge/APIs-TfL%20%7C%20Google%20Maps%20%7C%20Airlabs-green)

---

## Overview

The Crisis Logistics Command System is an operational dashboard designed for crisis coordinators managing transport disruptions, resource allocation, and fleet positioning across seven West London boroughs: **Brent, Harrow, Ealing, Hammersmith & Fulham, Hillingdon, Hounslow, and Richmond upon Thames**.

### Key Capabilities

- **Real-time incident tracking** from TfL disruption feeds
- **Anomaly detection** — Z-score classification of daily incident spikes/drops
- **Predictive forecasting** — high-risk windows by day, hour, and geographic zone
- **Multi-modal transport monitoring** (bus, tube, rail, road, cycling, aviation)
- **Helicopter detection** via ICAO aircraft type cross-referencing
- **Resource inventory management** with threshold alerting
- **Incident response tracking** — acknowledge / reroute / escalate audit trail
- **Air quality monitoring** with live TfL forecasts
- **Travel time analytics** via Google Distance Matrix API
- **⚡ PySpark analytics** — incident trends, peak hour heatmaps, hotspot detection, anomaly detection, disruption forecasting

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES (APIs)                          │
├──────────────────┬───────────────────────┬──────────────────────────┤
│  TfL Open Data   │  Google Maps Platform │  Airlabs Aviation        │
│  - Disruptions   │  - Distance Matrix    │  - Flight Positions      │
│  - Line Status   │  - Route Directions   │  - ICAO Type Codes       │
│  - Road Status   │  - Places (Nearby)    │  - Helicopter Detection  │
│  - Bus Arrivals  │                       │                          │
│  - Vehicle Pos.  │                       │                          │
│  - Journey Plans │                       │                          │
│  - Air Quality   │                       │                          │
│  - Bikepoints    │                       │                          │
│  - Stations      │                       │                          │
└──────────────────┴───────────────────────┴──────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     TRANSFORM LAYER (Python/PySpark/Polars)         │
├─────────────────────────────────────────────────────────────────────┤
│  01_raw_ingestion    → External API calls, response parsing         │
│  02_clean_derived    → Deduplication, caching, enrichment           │
│  03_ontology_backings → Unified schemas for object types            │
│  04_pyspark_analytics → Distributed analytics (Window, pivot, agg)  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      ONTOLOGY LAYER (15 Object Types)               │
├─────────────────────────────────────────────────────────────────────┤
│  Live Incident │ Location │ Transport Unit │ Line Status │ Road     │
│  Bus Arrival   │ Crisis Resource │ Travel Time │ Journey Plan │ Air │
│  Incident Response │ ⚡ IncidentTrend │ ⚡ PeakHourHeatmap           │
│  ⚡ TransportHotspot │ ⚡ DisruptionForecast                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   APPLICATION LAYER (React OSDK App)               │
├─────────────────────────────────────────────────────────────────────┤
│  Tab 1: Situation Map    │  Tab 2: Active Incidents                 │
│  Tab 3: Transport Status │  Tab 4: Resources & Fleet                │
│  Tab 5: Analytics + ⚡ Forecast/Trends/Heatmap/Hotspots             │
│  Role-based access · Anomaly & low-stock alerts                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Sources

| Source | API | Refresh Rate | Purpose |
|--------|-----|-------------|---------|
| **TfL Open Data** | `api.tfl.gov.uk` | 15 min | Transport disruptions, line/road status, bus arrivals, journey planning, air quality, bikepoints, stations |
| **Google Maps Platform** | Distance Matrix API, Places API | Hourly | Travel times from logistics hubs to incident sites |
| **Airlabs** | `airlabs.co/api/v9/flights` | 15 min | Aircraft positions with ICAO type identification for helicopter detection |

### Bounding Box

```
Latitude:  51.38 — 51.63
Longitude: -0.51 — -0.17
```

---

## Object Types

| Object Type | API Name | Description | Backing Dataset |
|-------------|----------|-------------|-----------------|
| **Live Incident** | `LiveIncident` | TfL traffic disruptions and incidents | `current_incidents` |
| **Location** | `LiveLocation` | Infrastructure points (hospitals, stations, fire stations) | `unified_locations` |
| **Transport Unit** | `LiveTransportUnit` | Unified fleet (aircraft, buses, bikes, trains, tubes) | `unified_fleet` |
| **Line Status** | `LineStatus` | Tube/bus/rail line disruption status | `tfl_line_status` |
| **Road Status** | `RoadStatus` | Major road conditions | `tfl_road_status` |
| **Bus Arrival** | `BusArrival` | Real-time bus arrival predictions | `tfl_bus_arrivals` |
| **Crisis Resource** | `CrisisResource` | Editable resource inventory (water, blankets, etc.) | Edits-based |
| **Travel Time** | `TravelTime` | Distance Matrix results (hub → incident) | `travel_time_matrix` |
| **Journey Plan** | `JourneyPlan` | Public transport routes (hub → hotspot) | `tfl_journey_plans` |
| **Air Quality** | `AirQuality` | London air quality forecast bands | `tfl_air_quality` |
| **Incident Response** | `IncidentResponse` | Acknowledge/reroute/escalate audit trail | Edits-based |
| ⚡ **Incident Trend** | `IncidentTrend` | Daily trends + 7-day rolling averages (PySpark) | `incident_trend_analysis` |
| ⚡ **Peak Hour Heatmap** | `PeakHourHeatmap` | Hour × day disruption frequency matrix (PySpark) | `peak_hour_heatmap` |
| ⚡ **Transport Hotspot** | `TransportHotspot` | Geographic hotspot detection with severity scoring (PySpark) | `transport_reliability` |
| ⚡ **Disruption Forecast** | `DisruptionForecast` | Predicted high-risk windows by day/hour/zone (PySpark) | `disruption_forecast` |

---

## ⚡ PySpark Analytics

Five distributed analytics transforms using Apache Spark (Window functions, pivots, aggregations):

| Transform | PySpark Features | Output |
|-----------|-----------------|--------|
| `incident_trend_analysis` | `Window.rangeBetween`, `F.avg().over()`, `groupBy().agg()` | Daily incident counts + 7-day rolling avg by severity |
| `peak_hour_heatmap` | `.pivot()`, `F.hour()`, `F.dayofweek()`, cross-tab aggregation | Hour × day-of-week disruption frequency matrix |
| `transport_reliability` | `F.row_number()`, `F.coalesce()`, severity weighting, spatial grid | Geographic hotspot ranking by severity-weighted score |
| `anomaly_detection` | `Window.rowsBetween`, `F.stddev()`, Z-score, threshold classification | Daily anomaly flags (SPIKE/DROP/NORMAL) |
| `disruption_forecast` | day × hour × zone aggregation, historical averaging, risk scoring | Predicted HIGH/MEDIUM/LOW risk windows |

**Why PySpark?**

Historical incident data accumulates over time (incremental ingestion). As weeks/months of data build up, these analytics require distributed compute for:
- Window functions over large time ranges (rolling averages)
- Cross-tab pivots on high-cardinality dimensions (hour × day × severity)
- Spatial aggregation across thousands of grid cells
- Statistical anomaly detection (Z-score over 14-day windows)
- Pattern-based forecasting across day/hour/zone combinations

---

## 🧪 Unit Tests

```bash
pytest transforms-python/src/test/test_transforms.py
```

| Test Class | Coverage |
|------------|----------|
| TestGeohash | Geohash computation, precision, null handling |
| TestBoundingBox | West London boundary validation |
| TestHelicopterDetection | ICAO code classification |
| TestAnomalyDetection | Z-score SPIKE/DROP/NORMAL classification |
| TestSeverityScoring | Severity weight ordering |

## ✅ Data Expectations
Production data quality checks on key transforms:

| Transform	| Check	| On Error
|------------|------|------------|
|current_incidents |	Primary key uniqueness (incident_id) |	FAIL |
|current_incidents |	latitude not null |	WARN |
|current_incidents |	longitude not null | WARN |
|current_incidents |	severity_level not null |	WARN |

---

## React OSDK Application (5 Tabs)

> See [`frontend/`](../frontend) for the full React source code. The app includes **role-based tab visibility** and **anomaly / low-stock alert banners**.

### Tab 1: Situation Map
- Interactive map with dual layers: Incidents (severity-colored) + Locations
- Anomaly and low-stock alert banners
- TYPE and CATEGORY filter histograms, severity chips, time range filter
- KPI metrics: Disrupted Lines, Active Incidents, Low Resources, Transport Units

### Tab 2: Active Incidents
- Sortable incident log with an "Add filters" popover and search
- Detail panel with properties, description, mini-map flyTo
- Incident response workflow (acknowledge / reroute / escalate) with response history

### Tab 3: Transport Status
- Disrupted Lines table with mode filters and search
- Road Conditions table
- Bus Arrivals table (sorted by ETA)

### Tab 4: Resources & Fleet
- Crisis Resource CRUD (Create with type dropdown + location selector, Update, Delete)
- "Add filters" popover (resource type + Low Stock toggle), sortable quantity
- Transport Unit fleet overview with vehicle type filter

### Tab 5: Analytics
- Travel Time Matrix with hub search and sort
- Metrics: Avg Travel Time, High-Risk Windows, Hotspot Zones
- ⚡ **Weekly Disruption Forecast**: predicted high-risk windows by day/hour/zone
- ⚡ **Incident Trends**: daily counts with 7-day rolling averages
- ⚡ **Peak Disruption Hours**: hour × day-of-week heatmap
- ⚡ **Transport Hotspots**: severity-ranked geographic zones

---

## Functions (TypeScript V2)

| Function | Purpose | Output |
|----------|---------|--------|
| `isBelowThreshold` | Function-backed column: identifies resources below critical threshold | `Record<ObjectSpecifier<CrisisResource>, {isBelowThreshold: boolean}>` |
| `countLowResources` | Metric: counts total resources needing resupply | `Integer` |

### Logic
```typescript
// Resource is "low" when:
quantityUnits < criticalThreshold
```

---

## Helicopter Detection

Aircraft are classified using ICAO type designator cross-referencing:

```python
HELICOPTER_ICAO_CODES = {
    # Airbus Helicopters
    "EC35", "H135", "H145", "H160", "H175", "H225",
    # Leonardo/AgustaWestland
    "A109", "A139", "A169", "A189",
    # Bell
    "B206", "B407", "B412", "B429",
    # Robinson
    "R22", "R44", "R66",
    # Sikorsky
    "S76", "S92",
    # ... 60+ total codes
}
```

When Airlabs returns a flight with `aircraft_icao` matching a helicopter code, it's classified as `vehicle_type = "HELICOPTER"` instead of `"AIRCRAFT"` in the unified fleet.

---

## Schedules

| Schedule | Frequency | Datasets |
|----------|-----------|----------|
| **Real-Time West London Feeds** | Every 15 min | incidents, line status, road status, bikepoints, raw incidents |
| **Transport Tracking** | Every 15 min | bus arrivals, vehicle positions |
| **Analytics Feeds** | Hourly | journey plans, air quality, travel time matrix |
| **⚡ PySpark Analytics** | Daily | incident trends, peak hour heatmap, transport hotspots, anomaly detection, disruption forecast |

---

## Project Structure

```
transforms-python/
├── src/myproject/datasets/
│   ├── airlabs_processor.py          # Airlabs flights + helicopter detection
│   ├── tfl_incident_processor.py     # TfL disruptions (incremental)
│   ├── tfl_line_status_processor.py  # Line status
│   ├── tfl_road_status_processor.py  # Road conditions
│   ├── tfl_bus_arrivals_processor.py # Bus ETAs
│   ├── tfl_vehicle_positions.py      # Bus positions
│   ├── tfl_train_positions.py        # Train positions
│   ├── tfl_journey_planner_processor.py # Journey planning
│   ├── tfl_air_quality_processor.py  # Air quality
│   ├── tfl_bikepoints_processor.py   # Bike docks
│   ├── tfl_stations_processor.py     # Stations
│   ├── travel_time_matrix.py         # Google Distance Matrix
│   ├── route_directions.py           # Google Directions
│   ├── infrastructure_discovery.py   # Nearby infrastructure
│   ├── unified_fleet.py              # Fleet aggregation
│   ├── unified_locations.py          # Location aggregation
│   ├── current_incidents.py          # Incident deduplication + data expectations
│   ├── ⚡ incident_trend_analysis.py  # PySpark: daily trends + rolling avg
│   ├── ⚡ peak_hour_heatmap.py        # PySpark: hour × day cross-tab
│   ├── ⚡ transport_reliability.py    # PySpark: hotspot detection
│   ├── ⚡ anomaly_detection.py        # PySpark: Z-score anomaly detection
│   └── ⚡ disruption_forecast.py      # PySpark: day × hour × zone forecast
├── src/test/
│   └── test_transforms.py            # Unit tests (pytest)
├── conda_recipe/meta.yaml            # Dependencies
└── README.md
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Platform** | Palantir Foundry / React OSDK |
| **Transforms** | Python 3.12+ / PySpark / Polars |
| **Functions** | TypeScript V2 (`@osdk/functions`) |
| **Application** | React OSDK |
| **Compute** | Lightweight (single-node) + PySpark (distributed, 2 executors) |
| **External APIs** | TfL, Google Maps, Airlabs |
| **Scheduling** | Foundry Scheduler (cron-based) |
| **Testing** | pytest |

---

## Action Types

| Action | Description |
|--------|-------------|
| **Create Crisis Resource** | Add new resource to inventory |
| **Update Resource Inventory** | Modify quantity/threshold |
| **Delete Crisis Resource** | Remove resource from tracking |
| **Respond to Incident** | Record an acknowledge / reroute / escalate response with notes |

---

## Setup Requirements

1. **API Keys Required:**
   - TfL Open Data (free, register at `api.tfl.gov.uk`)
   - Google Maps Platform (Distance Matrix API enabled)
   - Airlabs (free tier supports flights endpoint)

2. **Foundry Data Connection Sources:**
   - TfL source with API key configured
   - Google Maps source with API key configured
   - Airlabs source with API key configured

3. **Ontology Configuration:**
   - 15 object types (see Object Types section)
   - 4 action types (Crisis Resource CRUD + Respond to Incident)
   - 2 TypeScript V2 functions for threshold detection

---

## Attribution

Data sources: **TfL Open Data** (Contains OS data © Crown copyright and database rights) · **Google Maps Platform** · **Airlabs Aviation Data**

---

## Security

All API keys are retrieved at runtime via `source.get_secret()` from Foundry's secure vault. No credentials are stored in code.

---

## License

Portfolio/demonstration project. Source shared for review purposes.
