import 'reflect-metadata';
import { faker } from '@faker-js/faker';
import { plainToInstance } from 'class-transformer';
import { ApplyRollenerweiterungForRollePathParams } from './apply-rollenerweiterung-for-rolle-changes.path.params.js';

describe('ApplyRollenerweiterungForRollePathParams', () => {
    const referenceParams: ApplyRollenerweiterungForRollePathParams = {
        rolleId: faker.string.uuid(),
        organisationId: faker.string.uuid(),
    };

    it('should convert a plain object to a class of ApplyRollenerweiterungPathParams', () => {
        const incomingParams: object = {
            rolleId: referenceParams.rolleId,
            organisationId: referenceParams.organisationId,
        };
        const mappedParams: ApplyRollenerweiterungForRollePathParams = plainToInstance(
            ApplyRollenerweiterungForRollePathParams,
            incomingParams,
        );
        expect(mappedParams).toBeInstanceOf(ApplyRollenerweiterungForRollePathParams);
        expect(mappedParams).toEqual(referenceParams);
    });
});
