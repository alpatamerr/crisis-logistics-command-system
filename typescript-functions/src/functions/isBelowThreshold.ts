import { Client, ObjectSet, ObjectSpecifier } from "@osdk/client";
import { CrisisResource } from "@ontology/sdk";

export const config = {
    apiName: "isBelowThreshold",
    description: "Returns whether each Crisis Resource quantity is below its critical threshold.",
};

interface ThresholdStatus {
    isBelowThreshold: boolean;
}

async function isBelowThreshold(
    client: Client,
    resources: ObjectSet<CrisisResource>
): Promise<Record<ObjectSpecifier<CrisisResource>, ThresholdStatus>> {
    const result: Record<ObjectSpecifier<CrisisResource>, ThresholdStatus> = {};

    for await (const resource of resources.asyncIter()) {
        const quantity = resource.quantityUnits ?? 0;
        const threshold = resource.criticalThreshold ?? 0;
        result[resource.$objectSpecifier] = {
            isBelowThreshold: quantity < threshold,
        };
    }

    return result;
}

export default isBelowThreshold;
