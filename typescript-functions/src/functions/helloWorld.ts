import { logs } from "@opentelemetry/api-logs";

// Emit logs and spans from your functions to help you debug them in production.
// See https://www.palantir.com/docs/foundry/functions/instrumentation-telemetry.
const logger = logs.getLogger("hello-world");

function helloWorld(): string {
    logger.emit({
        attributes: { LOG_MESSAGE: "helloWorld was called." },
    });

    return "Hello World!";
}

// // To test this function in Live Preview and later publish to the platform, make it the default export of the file.
// export default helloWorld;
