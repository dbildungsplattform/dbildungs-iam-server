import { faker } from '@faker-js/faker';
import { describe, expect, it } from 'vitest';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import {
    OrganisationID,
    RolleID,
    RollenerweiterungID,
    ServiceProviderID,
} from '../../../shared/types/aggregate-ids.types.js';
import { ServiceProviderMerkmal } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { NoRedundantRollenerweiterungError } from '../specification/error/no-redundant-rollenerweiterung.error.js';
import { ServiceProviderNichtVerfuegbarFuerRollenerweiterungError } from '../specification/error/service-provider-nicht-verfuegbar-fuer-rollenerweiterung.error.js';
import { RollenArt } from './rolle.enums.js';
import { Rolle } from './rolle.js';
import { RollenartNotAllowedForSPError } from './rollenart-not-allowed-for-sp.error.js';
import { CreateRollenerweiterungError, Rollenerweiterung } from './rollenerweiterung.js';

describe('Rollenerweiterung Aggregate', () => {
    describe('construct', () => {
        it('should construct a persisted Rollenerweiterung', () => {
            const id: RollenerweiterungID = faker.string.uuid();
            const createdAt: Date = faker.date.past();
            const updatedAt: Date = faker.date.recent();
            const organisationId: OrganisationID = faker.string.uuid();
            const rolleId: RolleID = faker.string.uuid();
            const serviceProviderId: ServiceProviderID = faker.string.uuid();

            const rollenerweiterung: Rollenerweiterung<true> = Rollenerweiterung.construct(
                id,
                createdAt,
                updatedAt,
                organisationId,
                rolleId,
                serviceProviderId,
            );

            expect(rollenerweiterung).toEqual(
                expect.objectContaining({
                    id,
                    createdAt,
                    updatedAt,
                    organisationId,
                    rolleId,
                    serviceProviderId,
                }),
            );
        });
    });

    describe('createNew', () => {
        it('should create a new Rollenerweiterung if all consistency checks are satisfied', () => {
            const organisationId: OrganisationID = faker.string.uuid();

            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.LEHR,
                serviceProviderIds: [],
            });

            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [RollenArt.LEHR],
            });

            const result: Result<Rollenerweiterung<false>, CreateRollenerweiterungError> = Rollenerweiterung.createNew(
                organisationId,
                rolle,
                serviceProvider,
            );

            expect(result.ok).toBe(true);
            if (!result.ok) {
                throw result.error;
            }
            expect(result.value).toEqual(
                expect.objectContaining({
                    id: undefined,
                    createdAt: undefined,
                    updatedAt: undefined,
                    organisationId,
                    rolleId: rolle.id,
                    serviceProviderId: serviceProvider.id,
                }),
            );
        });

        it('should return NoRedundantRollenerweiterungError if the ServiceProvider is already assigned to the Rolle', () => {
            const organisationId: OrganisationID = faker.string.uuid();

            const serviceProviderId: ServiceProviderID = faker.string.uuid();

            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.LEHR,
                serviceProviderIds: [serviceProviderId],
            });

            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                id: serviceProviderId,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [RollenArt.LEHR],
            });

            const result: Result<Rollenerweiterung<false>, CreateRollenerweiterungError> = Rollenerweiterung.createNew(
                organisationId,
                rolle,
                serviceProvider,
            );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected Rollenerweiterung.createNew to fail');
            }
            expect(result.error).toBeInstanceOf(NoRedundantRollenerweiterungError);
        });

        it('should return ServiceProviderNichtVerfuegbarFuerRollenerweiterungError if the ServiceProvider is not available for Rollenerweiterung', () => {
            const organisationId: OrganisationID = faker.string.uuid();

            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.LEHR,
                serviceProviderIds: [],
            });

            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                merkmale: [],
                rollenartenWhitelist: [RollenArt.LEHR],
            });

            const result: Result<Rollenerweiterung<false>, CreateRollenerweiterungError> = Rollenerweiterung.createNew(
                organisationId,
                rolle,
                serviceProvider,
            );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected Rollenerweiterung.createNew to fail');
            }
            expect(result.error).toBeInstanceOf(ServiceProviderNichtVerfuegbarFuerRollenerweiterungError);
        });

        it('should return RollenartNotAllowedForSPError if the Rollenart is not included in the whitelist', () => {
            const organisationId: OrganisationID = faker.string.uuid();

            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.LEHR,
                serviceProviderIds: [],
            });

            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [RollenArt.LERN],
            });

            const result: Result<Rollenerweiterung<false>, CreateRollenerweiterungError> = Rollenerweiterung.createNew(
                organisationId,
                rolle,
                serviceProvider,
            );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected Rollenerweiterung.createNew to fail');
            }
            expect(result.error).toBeInstanceOf(RollenartNotAllowedForSPError);
        });

        it('should allow every Rollenart if the whitelist is empty', () => {
            const organisationId: OrganisationID = faker.string.uuid();

            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.LEHR,
                serviceProviderIds: [],
            });

            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });

            const result: Result<Rollenerweiterung<false>, CreateRollenerweiterungError> = Rollenerweiterung.createNew(
                organisationId,
                rolle,
                serviceProvider,
            );

            expect(result.ok).toBe(true);
        });

        it('should allow the Rollenart if it is included in the whitelist', () => {
            const organisationId: OrganisationID = faker.string.uuid();

            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.LEHR,
                serviceProviderIds: [],
            });

            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [RollenArt.LEHR],
            });

            const result: Result<Rollenerweiterung<false>, CreateRollenerweiterungError> = Rollenerweiterung.createNew(
                organisationId,
                rolle,
                serviceProvider,
            );

            expect(result.ok).toBe(true);
        });

        it('should return the redundancy error before checking further consistency rules', () => {
            const organisationId: OrganisationID = faker.string.uuid();

            const serviceProviderId: ServiceProviderID = faker.string.uuid();

            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.LEHR,
                serviceProviderIds: [serviceProviderId],
            });

            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                id: serviceProviderId,
                merkmale: [],
                rollenartenWhitelist: [RollenArt.LERN],
            });

            const result: Result<Rollenerweiterung<false>, CreateRollenerweiterungError> = Rollenerweiterung.createNew(
                organisationId,
                rolle,
                serviceProvider,
            );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected Rollenerweiterung.createNew to fail');
            }
            expect(result.error).toBeInstanceOf(NoRedundantRollenerweiterungError);
        });

        it('should return the availability error before checking the Rollenart whitelist', () => {
            const organisationId: OrganisationID = faker.string.uuid();

            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.LEHR,
                serviceProviderIds: [],
            });

            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                merkmale: [],
                rollenartenWhitelist: [RollenArt.LERN],
            });

            const result: Result<Rollenerweiterung<false>, CreateRollenerweiterungError> = Rollenerweiterung.createNew(
                organisationId,
                rolle,
                serviceProvider,
            );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected Rollenerweiterung.createNew to fail');
            }
            expect(result.error).toBeInstanceOf(ServiceProviderNichtVerfuegbarFuerRollenerweiterungError);
        });
    });
});
