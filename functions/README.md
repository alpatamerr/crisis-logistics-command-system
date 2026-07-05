# TypeScript v2 Functions

> 📂 This is the **business logic layer**. See the [root README](../README.md) for full system overview.

Server-side Foundry Functions (TypeScript v2) providing ontology-aware business logic for the Crisis Logistics Command System.

## Functions

| Function | Purpose | Input | Output |
|----------|---------|-------|--------|
| `isBelowThreshold` | Function-backed column: identifies resources below critical threshold | `CrisisResource` objects | `Record<ObjectSpecifier<CrisisResource>, {isBelowThreshold: boolean}>` |
| `countLowResources` | Metric: counts total resources needing resupply | All `CrisisResource` objects | `Integer` |
| `searchAircraft` | Search and filter aircraft data | Search parameters | `Aircraft[]` |

## Logic

```typescript
// Resource is critically low when:
quantityUnits < criticalThreshold
