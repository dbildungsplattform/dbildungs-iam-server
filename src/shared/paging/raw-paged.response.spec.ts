import { RawPagedResponse } from './raw-paged.response.js';

describe('RawPagedResponse', () => {
    describe('fromItemsAndQuery', () => {
        it('should create a RawPagedResponse with provided values', () => {
            const response: RawPagedResponse<number> = RawPagedResponse.fromItemsAndQuery(
                { items: [1, 2, 3], total: 10 },
                { limit: 5, offset: 2 },
            );
            expect(response.items).toEqual([1, 2, 3]);
            expect(response.total).toBe(10);
            expect(response.limit).toBe(5);
            expect(response.offset).toBe(2);
        });

        it('should create a RawPagedResponse with default values', () => {
            const response: RawPagedResponse<number> = RawPagedResponse.fromItemsAndQuery({ items: [1, 2, 3] }, {});
            expect(response.items).toEqual([1, 2, 3]);
            expect(response.total).toBe(3);
            expect(response.limit).toBe(3);
            expect(response.offset).toBe(0);
        });

        it('should create a RawPagedResponse with some default values', () => {
            const response: RawPagedResponse<number> = RawPagedResponse.fromItemsAndQuery(
                { items: [] },
                { limit: 5, offset: 6 },
            );
            expect(response.items).toEqual([]);
            expect(response.total).toBe(0);
            expect(response.limit).toBe(5);
            expect(response.offset).toBe(6);
        });

        it('should create a RawPagedResponse with falsy arguments', () => {
            const response: RawPagedResponse<number> = RawPagedResponse.fromItemsAndQuery(
                { items: [0], total: 0 },
                { limit: 0, offset: 0 },
            );
            expect(response.items).toEqual([0]);
            expect(response.total).toBe(0);
            expect(response.limit).toBe(0);
            expect(response.offset).toBe(0);
        });
    });
});
