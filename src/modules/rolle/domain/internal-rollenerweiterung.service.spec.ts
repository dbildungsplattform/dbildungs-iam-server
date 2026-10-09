import { faker } from '@faker-js/faker';
import { beforeEach, describe, expect, it } from 'vitest';

import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { ServiceProviderMerkmal } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { InternalRollenerweiterungRepo } from '../repo/internal-rollenerweiterung.repo.js';
import { InternalRollenerweiterungService } from './internal-rollenerweiterung.service.js';
import { RollenArt } from './rolle.enums.js';
import { Rolle } from './rolle.js';
import { CreateRollenerweiterungError, Rollenerweiterung } from './rollenerweiterung.js';

describe('InternalRollenerweiterungService', () => {
    let sut: InternalRollenerweiterungService;
    let internalRollenerweiterungRepoMock: DeepMocked<InternalRollenerweiterungRepo>;

    beforeEach(() => {
        internalRollenerweiterungRepoMock = createMock<InternalRollenerweiterungRepo>(InternalRollenerweiterungRepo);

        sut = new InternalRollenerweiterungService(internalRollenerweiterungRepoMock);
    });

    it('should create and persist a valid Rollenerweiterung', async () => {
        const organisation: Organisation<true> = DoFactory.createOrganisation(true);

        const rolle: Rolle<true> = DoFactory.createRolle(true, {
            rollenart: RollenArt.LEHR,
            merkmale: [],
            serviceProviderIds: [],
        });

        const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
            merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            rollenartenWhitelist: [],
        });

        const persistedRollenerweiterung: Rollenerweiterung<true> = DoFactory.createRollenerweiterung<true>(true, {
            organisationId: organisation.id,
            rolleId: rolle.id,
            serviceProviderId: serviceProvider.id,
        });

        internalRollenerweiterungRepoMock.create.mockResolvedValueOnce(persistedRollenerweiterung);

        const result: Result<Rollenerweiterung<true>, CreateRollenerweiterungError> = await sut.create(
            organisation,
            rolle,
            serviceProvider,
        );

        expect(result.ok).toBe(true);
        if (!result.ok) {
            throw result.error;
        }
        expect(result.value).toBe(persistedRollenerweiterung);
        expect(internalRollenerweiterungRepoMock.create).toHaveBeenCalledOnce();
        expect(internalRollenerweiterungRepoMock.create).toHaveBeenCalledWith(
            expect.objectContaining({
                organisationId: organisation.id,
                rolleId: rolle.id,
                serviceProviderId: serviceProvider.id,
            }),
        );
    });

    it('should return the creation error and not persist if the ServiceProvider is unavailable for Rollenerweiterungen', async () => {
        const organisation: Organisation<true> = DoFactory.createOrganisation(true);

        const rolle: Rolle<true> = DoFactory.createRolle(true, {
            rollenart: RollenArt.LEHR,
            merkmale: [],
            serviceProviderIds: [],
        });

        const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
            merkmale: [],
            rollenartenWhitelist: [],
        });

        const result: Result<Rollenerweiterung<true>, CreateRollenerweiterungError> = await sut.create(
            organisation,
            rolle,
            serviceProvider,
        );

        expect(result.ok).toBe(false);
        expect(internalRollenerweiterungRepoMock.create).not.toHaveBeenCalled();
    });

    it('should return the creation error and not persist if the Rollenerweiterung is redundant', async () => {
        const organisation: Organisation<true> = DoFactory.createOrganisation(true);

        const serviceProviderId: string = faker.string.uuid();

        const rolle: Rolle<true> = DoFactory.createRolle(true, {
            rollenart: RollenArt.LEHR,
            merkmale: [],
            serviceProviderIds: [serviceProviderId],
        });

        const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
            id: serviceProviderId,
            merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            rollenartenWhitelist: [],
        });

        const result: Result<Rollenerweiterung<true>, CreateRollenerweiterungError> = await sut.create(
            organisation,
            rolle,
            serviceProvider,
        );

        expect(result.ok).toBe(false);
        expect(internalRollenerweiterungRepoMock.create).not.toHaveBeenCalled();
    });

    it('should return the creation error and not persist if the Rollenart is not allowed', async () => {
        const organisation: Organisation<true> = DoFactory.createOrganisation(true);

        const rolle: Rolle<true> = DoFactory.createRolle(true, {
            rollenart: RollenArt.LEHR,
            merkmale: [],
            serviceProviderIds: [],
        });

        const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
            merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            rollenartenWhitelist: [RollenArt.LERN],
        });

        const result: Result<Rollenerweiterung<true>, CreateRollenerweiterungError> = await sut.create(
            organisation,
            rolle,
            serviceProvider,
        );

        expect(result.ok).toBe(false);
        expect(internalRollenerweiterungRepoMock.create).not.toHaveBeenCalled();
    });
});
