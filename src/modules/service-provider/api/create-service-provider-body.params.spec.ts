import { faker } from '@faker-js/faker';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

import { CreateServiceProviderBodyParams } from './create-service-provider-body.params.js';
import { ServiceProviderKategorie } from '../domain/service-provider.enum.js';

describe('CreateServiceProviderBodyParams', () => {
    const validPayload: Omit<CreateServiceProviderBodyParams, 'rollenartenWhitelist'> = {
        organisationId: faker.string.uuid(),
        name: faker.company.name(),
        url: faker.internet.url(),
        kategorie: ServiceProviderKategorie.SCHULISCH,
        requires2fa: false,
        merkmale: [],
    };

    it('should fail validation for invalid rollenartenWhitelist entries', async () => {
        const instance: CreateServiceProviderBodyParams = plainToInstance(CreateServiceProviderBodyParams, {
            ...validPayload,
            rollenartenWhitelist: ['NOT_A_ROLLENART'],
        });

        const errors: ValidationError[] = await validate(instance);

        expect(errors.some((error: ValidationError) => error.property === 'rollenartenWhitelist')).toBe(true);
    });
});
