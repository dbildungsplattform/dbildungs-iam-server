import { faker } from '@faker-js/faker';

import { assignSameKey, mapDefinedObjectProperties, objectKeys } from './object-utils.js';

describe('mapDefinedObjectProperties', () => {
    it('should map objects with properties', () => {
        const testObj: Record<'a' | 'b', string> = {
            a: faker.word.noun(),
            b: faker.word.noun(),
        };

        const result: string[] = mapDefinedObjectProperties(testObj, (key: string, val: string) => key + val);

        expect(result).toEqual([`a${testObj.a}`, `b${testObj.b}`]);
    });

    it('should ignore undefined and null', () => {
        const testObj: Record<string, string | undefined | null> = {
            a: undefined,
            b: null,
        };

        const result: string[] = mapDefinedObjectProperties(testObj, (key: string, val: string) => key + val);

        expect(result).toHaveLength(0);
    });

    it('should ignore symbol properties', () => {
        const testObj: Record<string | symbol | number, string> = {
            [Symbol()]: 'symbol',
        };

        const result: string[] = mapDefinedObjectProperties(testObj, (key: string, val: string) => key + val);

        expect(result).toHaveLength(0);
    });
});

describe('objectKeys', () => {
    it('should return keys of object', () => {
        const testObject: Record<string, string> = {
            test: '1',
        };
        const keys: string[] = objectKeys(testObject);
        expect(keys).toEqual(['test']);
    });
});

describe('assignSameKey', () => {
    it('should assign key to object', () => {
        const testObject: Record<string, string> = {
            test: '1',
        };
        assignSameKey(testObject, { test: '123' }, 'test');
        expect(testObject['test']).toBe('123');
    });
});
