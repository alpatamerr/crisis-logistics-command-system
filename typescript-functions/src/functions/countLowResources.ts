import { Client, ObjectSet } from "@osdk/client";
import { Integer } from "@osdk/functions";
import { CrisisResource } from "@ontology/sdk";

async function countLowResources(
    client: Client,
    resources: ObjectSet<CrisisResource>
): Promise<Integer> {
    let count = 0;

    for await (const resource of resources.asyncIter()) {
        const quantity = resource.quantityUnits ?? 0;
        const threshold = resource.criticalThreshold ?? 0;
        if (quantity < threshold) {
            count++;
        }
    }

    return count;
}

export default countLowResources;
