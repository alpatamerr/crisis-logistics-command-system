import { describe, it, expect } from 'vitest';

// import { createMockClient, createMockOsdkObject } from '@osdk/unit-testing';
// import { ExampleDataAircraft } from '@ontology/sdk'; // Replace with an object type from your Ontology.
// import searchAircraft from '../searchAircraft.js';

describe('searchAircraft', () => {
  it.skip('returns aircraft arriving in NYC', async () => {
    // const mockClient = createMockClient();
    //
    // const mockAircraft = createMockOsdkObject(ExampleDataAircraft, {
    //     id: '1',
    //     arrivalCity: 'NYC',
    // });
    //
    // mockClient
    //     .when((stub) =>
    //         stub(ExampleDataAircraft)
    //             .where({ arrivalCity: { $eq: 'NYC' } })
    //             .fetchPage({ $orderBy: { id: 'asc' } }),
    //     )
    //     .thenReturnObjects([mockAircraft]);
    //
    // const result = await searchAircraft(mockClient);
    //
    // expect(result).toEqual([mockAircraft]);
  });
});
