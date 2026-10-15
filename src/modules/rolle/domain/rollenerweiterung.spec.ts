import { vi } from 'vitest';
import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { RolleRepo } from '../repo/rolle.repo.js';
import { RollenerweiterungFactory } from './rollenerweiterung.factory.js';
import { type Rollenerweiterung } from './rollenerweiterung.js';
import { Rolle } from './rolle.js';
import { RollenArt } from './rolle.enums.js';

describe('Rollenerweiterung Aggregate', () => {
    let module: TestingModule;
    let rollenerweiterungFactory: RollenerweiterungFactory;
    let organisationRepo: DeepMocked<OrganisationRepository>;
    let rolleRepo: DeepMocked<RolleRepo>;
    let serviceProviderRepoMock: DeepMocked<ServiceProviderRepo>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                RollenerweiterungFactory,
                OrganisationRepository,
                {
                    provide: ServiceProviderRepo,
                    useValue: createMock<ServiceProviderRepo>(ServiceProviderRepo),
                },
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
            ],
        })
            .overrideProvider(OrganisationRepository)
            .useValue(createMock<OrganisationRepository>(OrganisationRepository))
            .compile();

        rollenerweiterungFactory = module.get(RollenerweiterungFactory);
        organisationRepo = module.get(OrganisationRepository);
        rolleRepo = module.get(RolleRepo);
        serviceProviderRepoMock = module.get(ServiceProviderRepo);
    });

    afterAll(async () => {
        await module.close();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('checkReferences', () => {
        it('should return undefined, if references are valid', async () => {
            const rollenerweiterung: Rollenerweiterung<true> = rollenerweiterungFactory.construct(
                faker.string.uuid(),
                faker.date.anytime(),
                faker.date.anytime(),
                faker.string.uuid(),
                faker.string.uuid(),
                faker.string.uuid(),
            );
            organisationRepo.isOrgaAParentOfOrgaB.mockResolvedValueOnce(true);
            organisationRepo.findById.mockResolvedValueOnce(DoFactory.createOrganisation(true));

            const rolle: Rolle<true> = Rolle.construct(
                organisationRepo,
                serviceProviderRepoMock,
                faker.string.uuid(),
                faker.date.anytime(),
                faker.date.anytime(),
                1,
                faker.string.alpha(10),
                faker.string.uuid(),
                RollenArt.LEHR,
                [],
                [],
                [],
                false,
                undefined,
            );
            rolleRepo.findById.mockResolvedValueOnce(rolle);
            serviceProviderRepoMock.findById.mockResolvedValueOnce(DoFactory.createServiceProvider(true));

            await expect(rollenerweiterung.checkReferences()).resolves.toBe(undefined);
        });

        it('should return Error, if references are valid but rolle is not on or above orga in tree ', async () => {
            const rollenerweiterung: Rollenerweiterung<true> = rollenerweiterungFactory.construct(
                faker.string.uuid(),
                faker.date.anytime(),
                faker.date.anytime(),
                faker.string.uuid(),
                faker.string.uuid(),
                faker.string.uuid(),
            );
            organisationRepo.isOrgaAParentOfOrgaB.mockResolvedValueOnce(false);
            organisationRepo.findById.mockResolvedValueOnce(DoFactory.createOrganisation(true));

            const rolle: Rolle<true> = Rolle.construct(
                organisationRepo,
                serviceProviderRepoMock,
                faker.string.uuid(),
                faker.date.anytime(),
                faker.date.anytime(),
                1,
                faker.string.alpha(10),
                faker.string.uuid(),
                RollenArt.LEHR,
                [],
                [],
                [],
                false,
                undefined,
            );
            rolleRepo.findById.mockResolvedValueOnce(rolle);
            serviceProviderRepoMock.findById.mockResolvedValueOnce(DoFactory.createServiceProvider(true));

            await expect(rollenerweiterung.checkReferences()).resolves.toBeInstanceOf(EntityNotFoundError);
        });

        type RollenerweiterungReference = 'organisation' | 'rolle' | 'serviceProvider';
        it.each<RollenerweiterungReference[]>([['organisation'], ['rolle'], ['serviceProvider']])(
            'should return error, if %s reference is invalid',
            async (reference: RollenerweiterungReference) => {
                organisationRepo.isOrgaAParentOfOrgaB.mockResolvedValueOnce(true);
                const rollenerweiterung: Rollenerweiterung<true> = rollenerweiterungFactory.construct(
                    faker.string.uuid(),
                    faker.date.anytime(),
                    faker.date.anytime(),
                    faker.string.uuid(),
                    faker.string.uuid(),
                    faker.string.uuid(),
                );
                organisationRepo.findById.mockResolvedValueOnce(
                    reference === 'organisation' ? undefined : DoFactory.createOrganisation(true),
                );
                rolleRepo.findById.mockResolvedValueOnce(
                    reference === 'rolle'
                        ? undefined
                        : Rolle.construct(
                              organisationRepo,
                              serviceProviderRepoMock,
                              faker.string.uuid(),
                              faker.date.anytime(),
                              faker.date.anytime(),
                              1,
                              faker.string.alpha(10),
                              faker.string.uuid(),
                              RollenArt.LEHR,
                              [],
                              [],
                              [],
                              false,
                              undefined,
                          ),
                );
                serviceProviderRepoMock.findById.mockResolvedValueOnce(
                    reference === 'serviceProvider' ? undefined : DoFactory.createServiceProvider(true),
                );

                await expect(rollenerweiterung.checkReferences()).resolves.toBeInstanceOf(EntityNotFoundError);
            },
        );
    });

    describe('getOrganisation', () => {
        it('should return organisation, if exists', async () => {
            organisationRepo.isOrgaAParentOfOrgaB.mockResolvedValueOnce(true);
            const rollenerweiterung: Rollenerweiterung<true> = rollenerweiterungFactory.construct(
                faker.string.uuid(),
                faker.date.anytime(),
                faker.date.anytime(),
                faker.string.uuid(),
                faker.string.uuid(),
                faker.string.uuid(),
            );
            organisationRepo.findById.mockResolvedValueOnce(
                DoFactory.createOrganisation(true, { id: rollenerweiterung.organisationId }),
            );
            await expect(rollenerweiterung.getOrganisation()).resolves.toEqual(
                expect.objectContaining({ id: rollenerweiterung.organisationId }),
            );
        });
    });
});
