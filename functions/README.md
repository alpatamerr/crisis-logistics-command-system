# TypeScript v2 Functions

> 📂 This is the **business logic layer**. See the [root README](../README.md) for full system overview.

Server-side Foundry Functions (TypeScript v2) providing ontology-aware business logic for the Crisis Logistics Command System.

## Functions

| Function | Purpose | Input | Output |
|----------|---------|-------|--------|
| `isBelowThreshold` | Function-backed column: identifies resources below their critical threshold | `CrisisResource` objects | `Record<ObjectSpecifier<CrisisResource>, {isBelowThreshold: boolean}>` |
| `countLowResources` | Metric: counts total resources needing resupply | All `CrisisResource` objects | `Integer` |

## Logic

```typescript
// Resource is critically low when:
quantityUnits < criticalThreshold
```

These functions power function-backed columns and metrics in the Resources & Fleet tab, giving operators an at-a-glance view of which supplies need restocking — surfaced as the dashboard's low-stock alert banner.

## License

Portfolio/demonstration project. Source shared for review purposes.
