import 'reflect-metadata';
import { faker } from '@faker-js/faker';
import { plainToInstance } from 'class-transformer';
import { ApplyRollenerweiterungForSPPathParams } from './apply-rollenerweiterung-for-sp-changes.path.params.js';

describe('ApplyRollenerweiterungForSPPathParams', () => {
    const referenceParams: ApplyRollenerweiterungForSPPathParams = {
        angebotId: faker.string.uuid(),
        organisationId: faker.string.uuid(),
    };

    it('should convert a plain object to a class of ApplyRollenerweiterungForSPPathParams', () => {
        const incomingParams: object = {
            angebotId: referenceParams.angebotId,
            organisationId: referenceParams.organisationId,
        };
        const mappedParams: ApplyRollenerweiterungForSPPathParams = plainToInstance(
            ApplyRollenerweiterungForSPPathParams,
            incomingParams,
        );
        expect(mappedParams).toBeInstanceOf(ApplyRollenerweiterungForSPPathParams);
        expect(mappedParams).toEqual(referenceParams);
    });
});
