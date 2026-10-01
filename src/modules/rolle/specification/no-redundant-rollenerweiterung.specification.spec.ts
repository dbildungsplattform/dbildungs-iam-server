import { faker } from '@faker-js/faker';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { ServiceProviderID } from '../../../shared/types/aggregate-ids.types.js';
import { Rolle } from '../domain/rolle.js';
import { Rollenerweiterung } from '../domain/rollenerweiterung.js';
import { NoRedundantRollenerweiterung } from './no-redundant-rollenerweiterung.specification.js';

describe('NoRedundantRollenerweiterung', () => {
    describe('isSatisfiedBy', () => {
        const specification: NoRedundantRollenerweiterung = new NoRedundantRollenerweiterung();

        it('should return true if the Rolle does not have the ServiceProvider assigned', () => {
            const serviceProviderId: ServiceProviderID = faker.string.uuid();

            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                serviceProviderIds: [],
            });

            const rollenerweiterung: Rollenerweiterung<true> = DoFactory.createRollenerweiterung<true>(true, {
                rolleId: rolle.id,
                serviceProviderId,
            });

            const result: boolean = specification.isSatisfiedBy(rollenerweiterung, rolle);

            expect(result).toBe(true);
        });

        it('should return false if the Rolle already has the ServiceProvider assigned', () => {
            const serviceProviderId: ServiceProviderID = faker.string.uuid();

            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                serviceProviderIds: [serviceProviderId],
            });

            const rollenerweiterung: Rollenerweiterung<true> = DoFactory.createRollenerweiterung<true>(true, {
                rolleId: rolle.id,
                serviceProviderId,
            });

            const result: boolean = specification.isSatisfiedBy(rollenerweiterung, rolle);

            expect(result).toBe(false);
        });

        it('should only consider the ServiceProvider referenced by the Rollenerweiterung', () => {
            const assignedServiceProviderId: ServiceProviderID = faker.string.uuid();

            const requestedServiceProviderId: ServiceProviderID = faker.string.uuid();

            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                serviceProviderIds: [assignedServiceProviderId],
            });

            const rollenerweiterung: Rollenerweiterung<true> = DoFactory.createRollenerweiterung<true>(true, {
                rolleId: rolle.id,
                serviceProviderId: requestedServiceProviderId,
            });

            const result: boolean = specification.isSatisfiedBy(rollenerweiterung, rolle);

            expect(result).toBe(true);
        });
    });
});
