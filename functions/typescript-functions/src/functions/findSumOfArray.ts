import { trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { Integer } from "@osdk/functions";

// Emit logs and spans from your functions to help you debug them in production.
// See https://www.palantir.com/docs/foundry/functions/instrumentation-telemetry.
const tracer = trace.getTracer("find-sum-of-array");
const logger = logs.getLogger("find-sum-of-array");

function findSumOfArray(numbers: Integer[]): Integer {
    logger.emit({
        attributes: { LOG_MESSAGE: `Calculating the sum of ${numbers.length} numbers.` },
    });

    // Wrap parts of your code in a span to surface how long it took to run
    const sumComputationSpan = tracer.startSpan("Computing the sum");
    const sum = numbers.reduce((acc, num) => acc + num, 0);
    sumComputationSpan.end();

    return sum;
}

// // To test this function in Live Preview and later publish to the platform, make it the default export of the file.
// export default findSumOfArray;
