import 'reflect-metadata';
import { faker } from '@faker-js/faker';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { ApplyRollenerweiterungBodyParams } from './apply-rollenerweiterung.body.params.js';

describe('ApplyRollenerweiterungBodyParams', () => {
    const referenceParams: ApplyRollenerweiterungBodyParams = {
        addErweiterungenForRolleIds: [faker.string.uuid(), faker.string.uuid()],
        removeErweiterungenForRolleIds: [faker.string.uuid(), faker.string.uuid()],
    };

    it('should convert a plain object to a class of ApplyRollenerweiterungBodyParams', () => {
        const incomingParams: object = {
            addErweiterungenForRolleIds: referenceParams.addErweiterungenForRolleIds,
            removeErweiterungenForRolleIds: referenceParams.removeErweiterungenForRolleIds,
        };
        const mappedParams: ApplyRollenerweiterungBodyParams = plainToInstance(
            ApplyRollenerweiterungBodyParams,
            incomingParams,
        );
        expect(mappedParams).toBeInstanceOf(ApplyRollenerweiterungBodyParams);
        expect(mappedParams).toEqual(referenceParams);
    });

    it.each(['addErweiterungenForRolleIds', 'removeErweiterungenForRolleIds'] as const)(
        'should fail validation when %s contains non-UUIDs',
        async (property: 'addErweiterungenForRolleIds' | 'removeErweiterungenForRolleIds') => {
            const incomingParams: object = {
                ...referenceParams,
                [property]: [faker.string.uuid(), 'not-a-uuid'],
            };
            const params: ApplyRollenerweiterungBodyParams = plainToInstance(
                ApplyRollenerweiterungBodyParams,
                incomingParams,
            );

            const errors: ValidationError[] = await validate(params);

            expect(errors).toHaveLength(1);
            expect(errors[0]?.property).toBe(property);
            expect(errors[0]?.constraints).toHaveProperty('isUuid');
        },
    );
});
