import 'reflect-metadata';
import { faker } from '@faker-js/faker';
import { plainToInstance } from 'class-transformer';
import { SetEmailAddressForSpshPersonBodyParams } from './set-email-address-for-spsh-person.bodyparams.js';

describe('SetEmailAddressForSpshPersonBodyParams', () => {
    const referenceParams: SetEmailAddressForSpshPersonBodyParams = {
        spshUsername: faker.internet.username(),
        organisationen: [
            {
                id: faker.string.uuid(),
                name: faker.string.alphanumeric(10),
                kennung: faker.string.alphanumeric(5),
            },
            {
                id: faker.string.uuid(),
                name: faker.string.alphanumeric(10),
                kennung: faker.string.alphanumeric(7),
            },
        ],
        firstName: faker.string.uuid(),
        lastName: faker.string.uuid(),
        spshServiceProviderId: faker.string.uuid(),
        gesperrt: true,
    };

    it('should convert a plain object to a class of SetEmailAddressForSpshPersonBodyParams', () => {
        const incomingParams: object = {
            spshUsername: referenceParams.spshUsername,
            organisationen: referenceParams.organisationen,
            firstName: referenceParams.firstName,
            lastName: referenceParams.lastName,
            spshServiceProviderId: referenceParams.spshServiceProviderId,
            gesperrt: referenceParams.gesperrt,
        };
        const mappedParams: SetEmailAddressForSpshPersonBodyParams = plainToInstance(
            SetEmailAddressForSpshPersonBodyParams,
            incomingParams,
        );
        expect(mappedParams).toBeInstanceOf(SetEmailAddressForSpshPersonBodyParams);
        expect(mappedParams).toEqual(referenceParams);
    });
});
