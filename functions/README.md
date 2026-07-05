## TypeScript Functions

### Overview
Functions enable code authors to write logic that can be executed quickly in operational contexts, such as dashboards and applications designed to empower decision-making processes. This logic is executed on the server side in an isolated environment.

### Getting Started
To begin writing a TypeScript Function, navigate to the `typescript-functions/src/functions` directory within the repository and create a new file. The following example is written in a file called `helloWorld.ts` and returns a message represented as a `string`:

```typescript
// typescript-functions/src/functions/helloWorld.ts

function helloWorld(): string {
    return "Hello World!";
}

export default helloWorld;
```

This may also be written as an arrow function:

```typescript
// typescript-functions/src/functions/helloWorld.ts

const helloWorld = (): string => {
    return "Hello World!";
};

export default helloWorld;
```

Note that in both examples, the function is exported using the `export default` syntax. This is a requirement to have the function registered and made available to other Foundry applications. The Function name must also match the file name: `helloWorld.ts` should define and default-export `helloWorld`. Renaming or moving the file changes the published Function identity.

Functions within the same file that are not the default export will remain private:

```typescript
// typescript-functions/src/functions/helloWorld.ts

function getRandomValue(array: string[]): string {
    const randomIndex = Math.floor(Math.random() * array.length);
    return array[randomIndex];
}

function helloWorld(): string {
    return getRandomValue(["Hello World!", "Hola!"]);
}

export default helloWorld;
```

### Primitive Types

A TypeScript Function must explicitly declare the types of its input and output parameters. The examples below cover common types used in Functions; see the [Functions type reference](https://www.palantir.com/docs/foundry/functions/types-reference/) for the full supported set and language-specific caveats.

#### Integer
Represents integer values from `-2,147,483,648` to `2,147,483,647` inclusive. If a Function receives an input or returns an output outside of this precision, an error will be thrown.

```typescript
// typescript-functions/src/functions/sum.ts

import { Integer } from "@osdk/functions";

function sum(a: Integer, b: Integer): Integer {
    return a + b;
}

export default sum;
```

#### Long
Represents integer values from `Number.MIN_SAFE_INTEGER` (`−9,007,199,254,740,991`) to `Number.MAX_SAFE_INTEGER` (`9,007,199,254,740,991`) inclusive. If a Function receives an input or returns an output outside of this precision, an error will be thrown.

```typescript
// typescript-functions/src/functions/subtract.ts

import { Long } from "@osdk/functions";

function subtract(a: Long, b: Long): Long {
    return (BigInt(a) - BigInt(b)).toString();
}

export default subtract;
```

#### Double
Represents an IEEE 754 64-bit floating point number.

```typescript
// typescript-functions/src/functions/multiply.ts

import { Double } from "@osdk/functions";

function multiply(a: Double, b: Double): Double {
    return a * b;
}

export default multiply;
```

#### String
```typescript
// typescript-functions/src/functions/greet.ts

function greet(name: string): string {
    return `Hello, ${name}!`;
}

export default greet;
```

#### Boolean
```typescript
// typescript-functions/src/functions/isEven.ts

import { Integer } from "@osdk/functions";

function isEven(num: Integer): boolean {
    return num % 2 === 0;
}

export default isEven;
```

#### Date
Represents a date as a string in YYYY-MM-DD format. If the function receives or returns a date that is not in this format, an error will be thrown.

```typescript
// typescript-functions/src/functions/returnDate.ts

import { DateISOString } from "@osdk/functions";

function returnDate(): DateISOString {
    return "1999-10-17";
}

export default returnDate;
```

#### Timestamp
Represents an instant in time as an ISO 8601 string. If the function receives or returns a date that is not in this format, an error will be thrown.

```typescript
// typescript-functions/src/functions/getCurrentTimestamp.ts

import { TimestampISOString } from "@osdk/functions";

function getCurrentTimestamp(): TimestampISOString {
    const now = new Date();
    return now.toISOString();
}

export default getCurrentTimestamp;
```

### Composite Types

#### Array
```typescript
// typescript-functions/src/functions/filterForEvenIntegers.ts

import { Integer } from "@osdk/functions";

function filterForEvenIntegers(nums: Integer[]): Integer[] {
    return nums.filter(num => num % 2 === 0);
}

export default filterForEvenIntegers;
```

#### Map
You can use the `Record` built-in TypeScript type to represent a mapping from keys to values.

```typescript
// typescript-functions/src/functions/getRecord.ts

function getRecord(): Record<string, string> {
    const dict: Record<string, string> = {};

    dict["Name"] = "Phil";
    dict["Favorite Color"] = "Blue";
    
    return dict;
}

export default getRecord;
```

You can also key by Ontology objects by accessing the `$objectSpecifier` property of each object.

```typescript
// typescript-functions/src/functions/getObjectMap.ts

import { ObjectSpecifier, Osdk } from "@osdk/client";
import { Integer } from "@osdk/functions";
import { Airplane } from "@ontology/sdk";

function getObjectMap(aircraft: Osdk.Instance<Airplane>[]): Record<ObjectSpecifier<Airplane>, Integer | undefined> {
    const dict: Record<ObjectSpecifier<Airplane>, Integer | undefined> = {};
    
    aircraft.forEach(obj => {
        dict[obj.$objectSpecifier] = obj.capacity;
    });
    
    return dict;
}

export default getObjectMap;
```

#### Custom Type
Custom types can be declared using the `interface` keyword in TypeScript. You can use any of the other supported types as fields:

```typescript
// typescript-functions/src/functions/getPassengerInfo.ts

import { Osdk } from "@osdk/client";
import { Integer } from "@osdk/functions";
import { Passenger } from "@ontology/sdk";

interface PassengerInfo {
    name?: string;
    age?: Integer;
}

function getPassengerInfo(passenger: Osdk.Instance<Passenger>): PassengerInfo {
    return {
        name: passenger.name,
        age: passenger.age,
    };
}

export default getPassengerInfo;
```

#### Two-Dimensional Aggregation
```typescript
import { Double, TwoDimensionalAggregation } from "@osdk/functions";

function myTwoDimensionalAggregationFunction(): TwoDimensionalAggregation<string, Double> {
    return [
        { key: "bucket1", value: 5.0 },
        { key: "bucket2", value: 6.0 },
    ];
}

export default myTwoDimensionalAggregationFunction;
```

#### Three-Dimensional Aggregation
```typescript
import { Double, ThreeDimensionalAggregation } from "@osdk/functions";

function myThreeDimensionalAggregation(): ThreeDimensionalAggregation<string, string, Double> {
    return [
        {
            key: "group-by-1",
            groups: [
                { key: "partition-by-1", value: 5.0 },
                { key: "partition-by-2", value: 6.0 },
            ],
        },
        {
            key: "group-by-2",
            groups: [
                { key: "partition-by-1", value: 7.0 },
                { key: "partition-by-2", value: 8.0 },
            ],
        },
    ];
}

export default myThreeDimensionalAggregation;
```

#### Optional
You can use the `?` token to specify that an input may be undefined:

```typescript
// typescript-functions/src/functions/greet.ts

function greet(name?: string): string {
    if (name === undefined) {
        return `Hello!`;
    }
    return `Hello, ${name}!`;
}

export default greet;
```

You can also provide a default value in the event that callers of your Function do not provide a value for the parameter:
```typescript
// typescript-functions/src/functions/greet.ts

function greet(name: string = "Anonymous"): string {
    return `Hello, ${name}!`;
}

export default greet;
```

#### Promise
Functions that perform asynchronous tasks (such as loading data over the network) can specify a `Promise` return type to indicate that a value will be provided at some point in the future.
```typescript
// typescript-functions/src/functions/loadObject.ts

import { Client } from "@osdk/client";
import { Integer } from "@osdk/functions";
import { Airplane } from "@ontology/sdk";

async function getAirplaneCapacityWithId(client: Client, id: string): Promise<Integer> {
    const response = await client(Airplane).fetchOne(id);
    return response.capacity;
}

export default getAirplaneCapacityWithId;
```

### Ontology SDK
You can use the left sidebar in Authoring to import entities from an Ontology and have an Ontology SDK generated for you within the workspace automatically. You can then import these entities from the `@ontology/sdk` package.

Object and interface types can be used in a TypeScript Function's signature. Using the Ontology SDK, an object or interface instance can be typed as `Osdk.Instance<Airplane>`:

```typescript
// typescript-functions/src/functions/getCapacity.ts

import { Osdk } from "@osdk/client";
import { Integer } from "@osdk/functions";
import { Airplane } from "@ontology/sdk";

function getCapacity(airplane: Osdk.Instance<Airplane>): Integer {
    return airplane.capacity;
}

export default getCapacity;
```

An object set represents an unordered collection of objects. Like individual object and interface instances, object sets can be passed into and returned from a TypeScript Function:

```typescript
// typescript-functions/src/functions/filterAircraft.ts

import { ObjectSet } from "@osdk/client";
import { Airplane } from "@ontology/sdk";

function filterAircraft(aircraft: ObjectSet<Airplane>): ObjectSet<Airplane> {
    return aircraft
        .where({
            capacity: {
                $gt: 200 
            } 
        });
}

export default filterAircraft;
```

To access a full client through which you can perform searches and aggregations across your Ontology, import `Client` from the `@osdk/client` package and provide it as the first parameter to your Function:
```typescript
// typescript-functions/src/functions/getAircraftByIdDescending.ts

import { Client, Osdk } from "@osdk/client";
import { Airplane } from "@ontology/sdk";

// Fetches a page of Airplane objects in descending order by ID.
async function getAircraftByIdDescending(client: Client): Promise<Osdk.Instance<Airplane>[]> {
    const { data } = await client(Airplane).fetchPage({
        $orderBy: {
            id: "desc" 
        } 
    });
    
    return data;
}

export default getAircraftByIdDescending;
```

```typescript
// typescript-functions/src/functions/getNumberOfAircraft.ts

import { Client } from "@osdk/client";
import { Integer } from "@osdk/functions";
import { Airplane } from "@ontology/sdk";

// Gets the total number of aircraft in the Ontology.
async function getNumberOfAircraft(client: Client): Promise<Integer> {
    const response = await client(Airplane).aggregate({
        $select: {
            $count: "unordered" 
        } 
    });
    return response.$count;
}

export default getNumberOfAircraft;
```

You can perform a search-around operation by using the `pivotTo` method available on the client and specifying the link type API name:
```typescript
// typescript-functions/src/functions/countPassengers.ts

import { Client } from "@osdk/client";
import { Aircraft } from "@ontology/sdk";

async function countPassengers(client: Client, lastNamePrefix: string): Promise<string> {
    const response = await client(Aircraft)
        .pivotTo("aircraftToPassenger")
        .where({
            lastName: {
                $startsWith: lastNamePrefix,
            } 
        })
        .aggregate({
            $select: {
                "lastName:exactDistinct": "unordered"
            } 
        });

    return `There are ${response.lastName.exactDistinct} passengers whose last name begins with ${lastNamePrefix}`;
}

export default countPassengers;
```

### Ontology Edits
You can use the Ontology SDK to produce edits to the Ontology that can be applied by Function-backed Actions. 

First, define a new type that declares the object types, interface, or link types that can be modified by the function using the `Edits` type from the `@osdk/functions` package. If the function modifies multiple object or link types, you can join multiple `Edits` types with the `|` operator:

```typescript
import { Edits } from "@osdk/functions";
import { Employee, LaptopRequest } from "@ontology/sdk";

type EmployeeEdit = 
    | Edits.Object<Employee>
    | Edits.Object<LaptopRequest>
    | Edits.Link<Employee, "lead">;
```

Then, define a function that returns an array of the `EmployeeEdit` type, and use `createEditBatch` from `@osdk/functions` to instantiate and fill a batch with edits to apply to the Ontology. 

The following example creates a new `LaptopRequest` and assigns `leadEmployee` to be the lead of `newEmployee`. Finally, the full list of edits is returned by the function:

```typescript
// typescript-functions/src/functions/assignEmployee.ts

import { Client, Osdk } from "@osdk/client";
import { createEditBatch, Edits } from "@osdk/functions";
import { Employee, LaptopRequest } from "@ontology/sdk";

type EmployeeEdit = 
    | Edits.Object<Employee>
    | Edits.Object<LaptopRequest>
    | Edits.Link<Employee, "lead">;

function assignEmployee(
    client: Client,
    newEmployee: Osdk.Instance<Employee>,
    leadEmployee: Osdk.Instance<Employee>,
): EmployeeEdit[] {
    
    const batch = createEditBatch<EmployeeEdit>(client);

    batch.create(LaptopRequest, {
        id: Date.now().toString(),
        employeeId: newEmployee.$primaryKey
    });
    batch.link(newEmployee, "lead", leadEmployee);
    
    return batch.getEdits();
}

export default assignEmployee;
```

Modifying objects through interfaces involves the same process. Interface types that the function can modify should also
be defined using the `Edits` type from the @osdk/functions package.

```typescript
import { Edits } from "@osdk/functions";
import { Athlete } from "@ontology/sdk";

type AthleteEdit = Edits.Interface<Athlete>;
```

Now let's create a function that returns an array of the `AthleteEdit` type and use `createEditBatch` from `@osdk/functions` to instantiate and fill a batch with edits to apply to the Ontology.

The following function takes in any object that implements the `Athlete` interface and updates its `jerseyNumber` interface property.

```typescript
// typescript-functions/src/functions/updateJersey.ts

import { Client, Osdk } from "@osdk/client";
import { createEditBatch, Edits, Integer } from "@osdk/functions";
import { Athlete } from "@ontology/sdk";

type AthleteEdit = Edits.Interface<Athlete>;

function updateJersey(
    client: Client,
    athlete: Osdk.Instance<Athlete>,
    newJerseyNumber: Integer
): AthleteEdit[] {
    
    const batch = createEditBatch<AthleteEdit>(client);

    batch.update(athlete, {
        jerseyNumber: newJerseyNumber
    });
    return batch.getEdits();
}

export default updateJersey;
```

### Function Configuration
You can configure permitted egress and the API name of a Function by exporting a `config` object from the file containing the Function.

The expected shape of this `config` object is as follows:

```typescript
interface Config {
    /**
     * The API name of the Function, to allow it to be invoked in other pro-code contexts or via the public API.
     */
    apiName?: string;

    /**
     * A list of source aliases that the Function may egress to. Any sources specified in this field must also be imported into the repository.
     * 
     * For more information about interacting with sources, see the `Making API Calls` section.
     */
    sources?: string[];
}
```

For example, to configure a Function with an API name of `MyApiName` and egress to the source alias `demoSource`, export the following `config` from the file containing your Function.

```typescript
export const config = {
    apiName: "MyApiName",
    sources: ["demoSource"],
};
```

### Making API Calls to External Systems
By default, Functions cannot egress to external systems. To make API calls, first import a source using the left sidebar and configure a source alias. See [Source aliases](https://www.palantir.com/docs/foundry/functions/source-aliases/) and [Make API calls from functions](https://www.palantir.com/docs/foundry/functions/api-calls/) for the full setup.

Then, declare that your Function can egress to that source alias. The `config` object must be exported from the entry-point Function's file, not from the file of any helper functions.

```typescript
// typescript-functions/src/functions/MyExternalFunction.ts

import { getFetch, getHttpsConnection, getSource } from "@palantir/functions-sources";

export const config = {
    sources: ["demoSource"]
}

async function myExternalFunction(): Promise<string> {
    const source = await getSource("demoSource");
    const { url } = getHttpsConnection(source);
    const fetch = await getFetch(source);

    const response = await fetch(url);

    return response.text();
}
```

The `@palantir/functions-sources` library exposes a fetch client and HTTP agent pre-configured with any server or client certificates on the source, as well as proxy information to allow egress from all runtime environments. To ensure that egress works correctly from all environments, it is highly recommended to use either the provided fetch or HTTP agent.

```typescript
import { getFetch, getHttpAgent } from "@palantir/functions-sources";

const fetch = await getFetch(source);
const agent = await getHttpAgent(source);
```

### Additional Capabilities

This template includes examples for the most common Function patterns. For more advanced workflows, see:

- [Instrumentation and telemetry](https://www.palantir.com/docs/foundry/functions/instrumentation-telemetry/) for emitting logs and spans.
- [User-facing errors](https://www.palantir.com/docs/foundry/functions/user-facing-error/) for returning actionable validation failures.
- [Streaming functions](https://www.palantir.com/docs/foundry/functions/streaming-functions/) for producing streamed responses.
- [Foundry platform SDK](https://www.palantir.com/docs/foundry/functions/platform-sdk/) for calling Foundry platform APIs from Functions.
- [Language models in TypeScript v2 and Python functions](https://www.palantir.com/docs/foundry/functions/language-models-python-tsv2/) for model-backed workflows.

### Live Preview

In Authoring, Functions can be previewed before publishing using the “Functions” tab accessible at the bottom of the window. With a file open, select “Live Preview” to execute Functions defined in that file with custom inputs.

### Publishing Functions

Functions can be published on a given branch by tagging a commit. In Authoring, click the “Tag version” button at the top-right of the window and provide a version. Any Functions present in the repository as of the latest commit will be published with that version for use throughout Foundry. Functions follow the [Semantic Versioning (SemVer) specification](https://semver.org/), which enables downstream applications using the Function to declare a particular version or a range of versions with which they're compatible.

### Local Development

It is possible to carry out high-speed, iterative development of TypeScript Functions locally. To get started, click the "Work locally" button in the top right.
Once you've cloned the repository locally, run `./gradlew localDev` in the root directory of the project to set up the environment.

### Testing

For the full OSDK unit-testing API, see [Unit testing TypeScript OSDK code](https://www.palantir.com/docs/foundry/ontology-sdk/typescript-osdk-testing/).

This template ships with [Vitest](https://vitest.dev/). Starter tests live under `src/functions/__tests__`, mirroring the `src/functions` structure for the Functions they cover, and run with:

```bash
./gradlew test
```

or

```bash
npm test
```

In Authoring, run the `test` task from the task runner. Tests also run automatically in CI.

For Functions that take an OSDK `Client` or operate on `Osdk.Instance<T>` values, the `@osdk/unit-testing` package provides a mock `Client` and helpers for building object instances, links, object sets, and queries.

A minimal test for a Function that fetches a page of objects looks like:

```typescript
// src/functions/__tests__/searchAircraft.test.ts
import { createMockClient, createMockOsdkObject } from '@osdk/unit-testing';
import { describe, it, expect } from 'vitest';
import { ExampleDataAircraft } from '@ontology/sdk';
import searchAircraft from '../searchAircraft.js';

describe('searchAircraft', () => {
    it('returns aircraft arriving in NYC', async () => {
        const mockClient = createMockClient();
        const mockAircraft = createMockOsdkObject(ExampleDataAircraft, {
            id: '1',
            arrivalCity: 'NYC',
        });

        mockClient
            .when((stub) =>
                stub(ExampleDataAircraft)
                    .where({ arrivalCity: { $eq: 'NYC' } })
                    .fetchPage({ $orderBy: { id: 'asc' } }),
            )
            .thenReturnObjects([mockAircraft]);

        expect(await searchAircraft(mockClient)).toEqual([mockAircraft]);
    });
});
```

A starter version of this file is at `src/functions/__tests__/searchAircraft.test.ts`.
