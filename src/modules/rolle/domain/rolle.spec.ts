import { vi } from 'vitest';
import { faker } from '@faker-js/faker';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { RollenArt, RollenMerkmal } from './rolle.enums.js';
import { RollenSystemRecht } from './systemrecht.js';
import { Rolle } from './rolle.js';
import { Test, TestingModule } from '@nestjs/testing';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { RolleRepo } from '../repo/rolle.repo.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { RolleFactory } from './rolle.factory.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { PersonenkontextFactory } from '../../personenkontext/domain/personenkontext.factory.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { NameForRolleWithTrailingSpaceError } from './name-with-trailing-space.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { expectErrResult, expectOkResult } from '../../../../test/utils/test-types.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { EntityAlreadyExistsError } from '../../../shared/error/entity-already-exists.error.js';
import { ServiceProviderProvidedOutOfTreeError } from './service-provider-provided-out-of-tree.error.js';

describe('Rolle Aggregate', () => {
    let module: TestingModule;
    let rolleFactory: RolleFactory;
    let serviceProviderRepoMock: DeepMocked<ServiceProviderRepo>;
    let organisationRepo: DeepMocked<OrganisationRepository>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                RolleFactory,
                PersonenkontextFactory,
                {
                    provide: ServiceProviderRepo,
                    useValue: createMock(ServiceProviderRepo),
                },
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
            ],
        }).compile();
        rolleFactory = module.get(RolleFactory);
        serviceProviderRepoMock = module.get(ServiceProviderRepo);
        organisationRepo = module.get(OrganisationRepository);
    });

    afterAll(async () => {
        await module.close();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('canBeAssignedToOrga', () => {
        it('should resolve to true, if the rolle is administered by the given organisation', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<false> | DomainError = rolleFactory.createNew(
                'test',
                orga.id,
                RollenArt.LERN,
                [],
                [],
                [],
                [],
                false,
            );

            if (rolle instanceof DomainError) {
                return;
            }

            await expect(rolle.canBeAssignedToOrga(orga)).resolves.toEqual(Ok(undefined));
        });

        it('should resolve to true, if the given organisation id is a suborganisation', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<false> | DomainError = rolleFactory.createNew(
                'test',
                orga.id,
                RollenArt.LERN,
                [],
                [],
                [],
                [],
                false,
            );

            if (rolle instanceof DomainError) {
                return;
            }

            organisationRepo.isOrgaAParentOfOrgaB.mockResolvedValueOnce(true);

            await expect(rolle.canBeAssignedToOrga(orga)).resolves.toEqual(Ok(undefined));
        });

        it('should resolve to false, if the given organisation id is not a suborganisation', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<false> | DomainError = rolleFactory.createNew(
                'test',
                faker.string.uuid(),
                RollenArt.LERN,
                [],
                [],
                [],
                [],
                false,
            );
            organisationRepo.isOrgaAParentOfOrgaB.mockResolvedValueOnce(false);

            if (rolle instanceof DomainError) {
                return;
            }

            await expect(rolle.canBeAssignedToOrga(orga)).resolves.toEqual(
                Err(new EntityNotFoundError('Rolle', rolle.id ?? 'undefined')),
            );
        });
    });

    describe('createNew', () => {
        it('should return an error if the name starts with whitespace', () => {
            const creationParams: {
                name: string;
                administeredBySchulstrukturknoten: string;
                art: RollenArt;
                merkmale: never[];
                systemrechte: never[];
                serviceProviderIds: never[];
            } = {
                name: ' Test',
                administeredBySchulstrukturknoten: faker.string.uuid(),
                art: RollenArt.LERN,
                merkmale: [],
                systemrechte: [],
                serviceProviderIds: [],
            };
            const result: Rolle<false> | DomainError = rolleFactory.createNew(
                creationParams.name,
                creationParams.administeredBySchulstrukturknoten,
                creationParams.art,
                creationParams.merkmale,
                creationParams.systemrechte,
                creationParams.serviceProviderIds,
                [],
                false,
            );

            expect(result).toBeInstanceOf(NameForRolleWithTrailingSpaceError);
        });

        it('should return an error if the name ends with whitespace', () => {
            const creationParams: {
                name: string;
                administeredBySchulstrukturknoten: string;
                art: RollenArt;
                merkmale: never[];
                systemrechte: never[];
                serviceProviderIds: never[];
            } = {
                name: 'Test ',
                administeredBySchulstrukturknoten: faker.string.uuid(),
                art: RollenArt.LERN,
                merkmale: [],
                systemrechte: [],
                serviceProviderIds: [],
            };
            const result: Rolle<false> | DomainError = rolleFactory.createNew(
                creationParams.name,
                creationParams.administeredBySchulstrukturknoten,
                creationParams.art,
                creationParams.merkmale,
                creationParams.systemrechte,
                creationParams.serviceProviderIds,
                [],
                false,
            );

            expect(result).toBeInstanceOf(NameForRolleWithTrailingSpaceError);
        });

        it('should return an error if the name is only whitespace', () => {
            const creationParams: {
                name: string;
                administeredBySchulstrukturknoten: string;
                art: RollenArt;
                merkmale: never[];
                systemrechte: never[];
                serviceProviderIds: never[];
            } = {
                name: '   ',
                administeredBySchulstrukturknoten: faker.string.uuid(),
                art: RollenArt.LERN,
                merkmale: [],
                systemrechte: [],
                serviceProviderIds: [],
            };
            const result: Rolle<false> | DomainError = rolleFactory.createNew(
                creationParams.name,
                creationParams.administeredBySchulstrukturknoten,
                creationParams.art,
                creationParams.merkmale,
                creationParams.systemrechte,
                creationParams.serviceProviderIds,
                [],
                false,
            );

            expect(result).toBeInstanceOf(NameForRolleWithTrailingSpaceError);
        });

        it('should create a new rolle if the name is valid', () => {
            const creationParams: {
                name: string;
                administeredBySchulstrukturknoten: string;
                art: RollenArt;
                merkmale: never[];
                systemrechte: never[];
                serviceProviderIds: never[];
            } = {
                name: 'Test',
                administeredBySchulstrukturknoten: faker.string.uuid(),
                art: RollenArt.LERN,
                merkmale: [],
                systemrechte: [],
                serviceProviderIds: [],
            };
            const rolle: Rolle<false> | DomainError = rolleFactory.createNew(
                creationParams.name,
                creationParams.administeredBySchulstrukturknoten,
                creationParams.art,
                creationParams.merkmale,
                creationParams.systemrechte,
                creationParams.serviceProviderIds,
                [],
                false,
            );

            expect(rolle).toBeDefined();
            expect(rolle).toBeInstanceOf(Rolle);
        });
    });

    describe('addMerkmal', () => {
        it('should add merkmal if it does not exist', () => {
            const savedRolle: Rolle<true> = DoFactory.createRolle(true, { merkmale: [] });
            savedRolle.addMerkmal(RollenMerkmal.BEFRISTUNG_PFLICHT);

            expect(savedRolle.merkmale).toEqual([RollenMerkmal.BEFRISTUNG_PFLICHT]);
        });

        it('should add MPT_ROLLE merkmal', () => {
            expect(Object.values(RollenMerkmal)).toContain('MPT_ROLLE');

            const savedRolle: Rolle<true> = DoFactory.createRolle(true, { merkmale: [] });
            savedRolle.addMerkmal(RollenMerkmal.MPT_ROLLE);

            expect(savedRolle.merkmale).toEqual([RollenMerkmal.MPT_ROLLE]);
        });

        it('should not add merkmal if it already exists', () => {
            const savedRolle: Rolle<true> = DoFactory.createRolle(true, {
                merkmale: [RollenMerkmal.BEFRISTUNG_PFLICHT],
            });
            savedRolle.addMerkmal(RollenMerkmal.BEFRISTUNG_PFLICHT);

            expect(savedRolle.merkmale).toEqual([RollenMerkmal.BEFRISTUNG_PFLICHT]);
        });
    });

    describe('removeMerkmal', () => {
        it('should remove merkmal if it exists', () => {
            const savedRolle: Rolle<true> = DoFactory.createRolle(true, {
                merkmale: [RollenMerkmal.BEFRISTUNG_PFLICHT, RollenMerkmal.KOPERS_PFLICHT],
            });
            savedRolle.removeMerkmal(RollenMerkmal.BEFRISTUNG_PFLICHT);

            expect(savedRolle.merkmale).toEqual([RollenMerkmal.KOPERS_PFLICHT]);
        });

        it('should do nothing if merkmal does not exist', () => {
            const savedRolle: Rolle<true> = DoFactory.createRolle(true, {
                merkmale: [RollenMerkmal.BEFRISTUNG_PFLICHT],
            });
            savedRolle.removeMerkmal(RollenMerkmal.KOPERS_PFLICHT);

            expect(savedRolle.merkmale).toEqual([RollenMerkmal.BEFRISTUNG_PFLICHT]);
        });
    });

    describe('Rolle Construct with Default Values', () => {
        it('should set serviceProviderData to an empty array if not provided', () => {
            const rolle: Rolle<true> = rolleFactory.construct(
                faker.string.uuid(),
                faker.date.anytime(),
                faker.date.anytime(),
                1,
                '',
                '',
                RollenArt.LEHR,
                [],
                [],
                [],
                false,
            );

            expect(rolle.serviceProviderData).toEqual([]);
        });
    });

    describe('addSystemRecht', () => {
        it('should add systemRecht if it does not exist', () => {
            const savedRolle: Rolle<true> = DoFactory.createRolle(true, { systemrechte: [] });
            savedRolle.addSystemRecht(RollenSystemRecht.ROLLEN_VERWALTEN);

            expect(savedRolle.systemrechte).toEqual([RollenSystemRecht.ROLLEN_VERWALTEN]);
        });

        it('should not add systemRecht if it already exists', () => {
            const savedRolle: Rolle<true> = DoFactory.createRolle(true, {
                systemrechte: [RollenSystemRecht.ROLLEN_VERWALTEN],
            });
            savedRolle.addSystemRecht(RollenSystemRecht.ROLLEN_VERWALTEN);

            expect(savedRolle.systemrechte).toEqual([RollenSystemRecht.ROLLEN_VERWALTEN]);
        });
    });

    describe('hasSystemRecht', () => {
        it('should have systemRecht', () => {
            const savedRolle: Rolle<true> = DoFactory.createRolle(true, { systemrechte: [] });
            savedRolle.addSystemRecht(RollenSystemRecht.ROLLEN_VERWALTEN);

            expect(savedRolle.hasSystemRecht(RollenSystemRecht.ROLLEN_VERWALTEN)).toBeTruthy();
        });

        it('should not have systemRecht', () => {
            const savedRolle: Rolle<true> = DoFactory.createRolle(true, { systemrechte: [] });

            expect(savedRolle.hasSystemRecht(RollenSystemRecht.ROLLEN_VERWALTEN)).toBeFalsy();
        });
    });

    describe('validate', () => {
        it('should return Ok if the rolle is valid', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<false> | DomainError = rolleFactory.createNew(
                'Valid Name',
                orga.id,
                RollenArt.LERN,
                [],
                [],
                [],
                [],
                false,
            );

            if (rolle instanceof DomainError) {
                throw rolle;
            }

            serviceProviderRepoMock.findByIds.mockResolvedValue(new Map());
            organisationRepo.findParentOrgasForIdSortedByDepthAsc.mockResolvedValue([orga]);

            const validateResult: Result<void, DomainError> = await rolle.validate();

            expectOkResult(validateResult);
        });

        it('should return Error if the name is invalid', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = rolleFactory.construct(
                faker.string.uuid(),
                faker.date.recent(),
                faker.date.recent(),
                1,
                ' Invalid Name ',
                orga.id,
                RollenArt.LERN,
                [],
                [],
                [],
                false,
            );

            if (rolle instanceof DomainError) {
                throw rolle;
            }

            serviceProviderRepoMock.findByIds.mockResolvedValue(new Map());
            organisationRepo.findParentOrgasForIdSortedByDepthAsc.mockResolvedValue([orga]);

            const validateResult: Result<void, DomainError> = await rolle.validate();

            expectErrResult(validateResult);
            expect(validateResult.error).toBeInstanceOf(NameForRolleWithTrailingSpaceError);
        });

        it('should return Error if one or more serviceproviders dont exist', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<false> | DomainError = rolleFactory.createNew(
                'Valid Name',
                orga.id,
                RollenArt.LERN,
                [],
                [],
                [faker.string.uuid()],
                [],
                false,
            );

            if (rolle instanceof DomainError) {
                throw rolle;
            }

            serviceProviderRepoMock.findByIds.mockResolvedValue(new Map());
            organisationRepo.findParentOrgasForIdSortedByDepthAsc.mockResolvedValue([orga]);

            const validateResult: Result<void, DomainError> = await rolle.validate();

            expectErrResult(validateResult);
            expect(validateResult.error).toBeInstanceOf(EntityNotFoundError);
        });

        it('should return Error serviceproviders are not unique', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                providedOnSchulstrukturknoten: orga.id,
            });
            const rolle: Rolle<false> | DomainError = rolleFactory.createNew(
                'Valid Name',
                orga.id,
                RollenArt.LERN,
                [],
                [],
                [serviceProvider.id, serviceProvider.id],
                [],
                false,
            );

            if (rolle instanceof DomainError) {
                throw rolle;
            }

            serviceProviderRepoMock.findByIds.mockResolvedValue(new Map([[serviceProvider.id, serviceProvider]]));
            organisationRepo.findParentOrgasForIdSortedByDepthAsc.mockResolvedValue([orga]);

            const validateResult: Result<void, DomainError> = await rolle.validate();

            expectErrResult(validateResult);
            expect(validateResult.error).toBeInstanceOf(EntityAlreadyExistsError);
        });

        it('should return Error serviceproviders can not be assigned to the rolle', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true);
            const rolle: Rolle<false> | DomainError = rolleFactory.createNew(
                'Valid Name',
                orga.id,
                RollenArt.LERN,
                [],
                [],
                [serviceProvider.id],
                [],
                false,
            );

            if (rolle instanceof DomainError) {
                throw rolle;
            }

            serviceProviderRepoMock.findByIds.mockResolvedValue(new Map([[serviceProvider.id, serviceProvider]]));
            organisationRepo.findParentOrgasForIdSortedByDepthAsc.mockResolvedValue([orga]);

            const validateResult: Result<void, DomainError> = await rolle.validate();

            expectErrResult(validateResult);
            expect(validateResult.error).toBeInstanceOf(ServiceProviderProvidedOutOfTreeError);
        });
    });
});
