// import { Client, Osdk } from "@osdk/client";
// import { ExampleDataAircraft } from "@ontology/sdk"; // Note that your OSDK may have a different name.

// // Note that "ExampleDataAircraft" may not exist in your Ontology.

// async function searchAircraft(client: Client): Promise<Osdk.Instance<ExampleDataAircraft>[]> {
//     const { data } = await client(ExampleDataAircraft).where({
//         arrivalCity: {
//             $eq: "NYC"
//         }
//     }).fetchPage({
//         $orderBy: {
//             id: "asc"
//         }
//     });
//
//     return data;
// }

// export default searchAircraft;
