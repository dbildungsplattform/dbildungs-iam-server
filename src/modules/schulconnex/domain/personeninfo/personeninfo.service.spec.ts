import { createMock, type DeepMocked } from '../../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { PersonenInfoService } from './personeninfo.service.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { PersonRepository } from '../../../person/persistence/person.repository.js';
import {
    DBiamPersonenkontextRepo,
    type KontextWithOrgaAndRolle,
} from '../../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { EmailRepo } from '../../../email/persistence/email.repo.js';
import { UserLockRepository } from '../../../keycloak-administration/repository/user-lock.repository.js';
import { type PersonPermissions } from '../../../authentication/domain/person-permissions.js';
import { PersonInfoResponseV1 } from '../../api/personinfo/v1/person-info.response.v1.js';
import { type Personenkontext } from '../../../personenkontext/domain/personenkontext.js';
import { DoFactory } from '../../../../../test/utils/do-factory.js';
import { type Rolle } from '../../../rolle/domain/rolle.js';
import { RollenArt } from '../../../rolle/domain/rolle.enums.js';
import { RollenSystemRecht } from '../../../rolle/domain/systemrecht.js';
import { OrganisationsTyp } from '../../../organisation/domain/organisation.enums.js';
import { type Organisation } from '../../../organisation/domain/organisation.js';
import { faker } from '@faker-js/faker';
import { PersonEmailResponse } from '../../../person/api/person-email-response.js';
import { SchulconnexRepo } from '../../persistence/schulconnex.repo.js';
import { createPersonPermissionsMock } from '../../../../../test/utils/auth.mock.js';
import { EmailResolverService } from '../../../email-microservice/domain/email-resolver.service.js';
import { type DomainError } from '../../../../shared/error/index.js';
import { expectOkResult } from '../../../../../test/utils/test-types.js';
import { PersonInfoDtoV2 } from '../../api/personinfo/v2/person-info.response.v2.js';

describe('PersonInfoService', () => {
    let module: TestingModule;
    let sut: PersonenInfoService;

    let loggerMock: DeepMocked<ClassLogger>;
    let personRepositoryMock: DeepMocked<PersonRepository>;
    let dBiamPersonenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let schulconnexRepo: DeepMocked<SchulconnexRepo>;
    let emailRepoMock: DeepMocked<EmailRepo>;
    let userLockRepoMock: DeepMocked<UserLockRepository>;
    let emailResolverServiceMock: DeepMocked<EmailResolverService>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                PersonenInfoService,
                {
                    provide: ClassLogger,
                    useValue: createMock(ClassLogger),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
                {
                    provide: SchulconnexRepo,
                    useValue: createMock(SchulconnexRepo),
                },
                {
                    provide: EmailRepo,
                    useValue: createMock(EmailRepo),
                },
                {
                    provide: UserLockRepository,
                    useValue: createMock(UserLockRepository),
                },
                {
                    provide: EmailResolverService,
                    useValue: createMock(EmailResolverService),
                },
            ],
        }).compile();

        sut = module.get(PersonenInfoService);
        loggerMock = module.get(ClassLogger);
        personRepositoryMock = module.get(PersonRepository);
        dBiamPersonenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        emailRepoMock = module.get(EmailRepo);
        userLockRepoMock = module.get(UserLockRepository);
        schulconnexRepo = module.get(SchulconnexRepo);
        emailResolverServiceMock = module.get(EmailResolverService);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
        expect(loggerMock).toBeDefined();
        expect(personRepositoryMock).toBeDefined();
        expect(dBiamPersonenkontextRepoMock).toBeDefined();
        expect(emailRepoMock).toBeDefined();
        expect(userLockRepoMock).toBeDefined();
    });

    describe('when caller has 0 organisations with systemrecht PERSONEN_LESEN', () => {
        it('should return empty array', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [],
            });
            dBiamPersonenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([]);
            const res: Result<PersonInfoResponseV1[], DomainError> = await sut.findPersonsForPersonenInfoV1(
                permissions,
                0,
                10,
            );
            expectOkResult(res);
            expect(res.value.length).toEqual(0);
            expect(
                schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations,
            ).not.toHaveBeenCalled();
        });

        it('should ignore kontext roles without PERSONEN_LESEN systemrecht', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: ['orga1'],
            });

            const rolleWithoutPermission: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.SYSADMIN,
                systemrechte: [], // ← this is the key
                serviceProviderIds: ['serviceProvider1'],
            });

            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolleWithoutPermission),
                getOrganisation: () =>
                    Promise.resolve(
                        DoFactory.createOrganisation(true, {
                            typ: OrganisationsTyp.SCHULE,
                        }),
                    ),
            });

            dBiamPersonenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([
                {
                    personenkontext: kontext,
                    organisation: DoFactory.createOrganisation(true, {
                        typ: OrganisationsTyp.SCHULE,
                    }),
                    rolle: rolleWithoutPermission,
                } satisfies KontextWithOrgaAndRolle,
            ]);

            const res: Result<PersonInfoResponseV1[], DomainError> = await sut.findPersonsForPersonenInfoV1(
                permissions,
                0,
                10,
            );

            expectOkResult(res);
            expect(res.value).toEqual([]);

            expect(
                schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations,
            ).not.toHaveBeenCalled();
        });
    });

    describe('when caller has organisations with systemrecht PERSONEN_LESEN', () => {
        it('should return persons with specific permissions', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const orga1: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const orga2: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.SYSADMIN,
                systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
                serviceProviderIds: ['serviceProvider1', 'serviceProvider2'],
            });
            const kontext1: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga1);
                },
            });
            const kontext2: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga2);
                },
            });

            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [orga1.id, orga1.id],
            });
            dBiamPersonenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([
                {
                    personenkontext: kontext1,
                    organisation: orga1,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
                {
                    personenkontext: kontext2,
                    organisation: orga2,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ]);

            const personId1: string = faker.string.uuid();
            const personId2: string = faker.string.uuid();
            schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations.mockResolvedValueOnce([
                personId1,
            ]);
            schulconnexRepo.findPersonIdsWithRollenerweiterungForServiceProviderAndOptionallyOrganisations.mockResolvedValueOnce(
                [personId2],
            );

            personRepositoryMock.findByPersonIds.mockResolvedValue([
                DoFactory.createPerson(true, { id: personId1 }),
                DoFactory.createPerson(true, { id: personId2 }),
            ]);
            emailRepoMock.getEmailAddressAndStatusForPersonIds.mockResolvedValue({
                ok: true,
                value: new Map([
                    [personId1, createMock(PersonEmailResponse)],
                    [personId2, createMock(PersonEmailResponse)],
                ]),
            });
            dBiamPersonenkontextRepoMock.findByPersonIdsAndServiceprovidersWithOrgaAndRolle.mockResolvedValue(
                new Map([
                    [personId1, []],
                    [personId2, []],
                ]),
            );
            userLockRepoMock.findByPersonIds.mockResolvedValue(
                new Map([
                    [personId1, []],
                    [personId2, []],
                ]),
            );

            const res: Result<PersonInfoResponseV1[], DomainError> = await sut.findPersonsForPersonenInfoV1(
                permissions,
                0,
                10,
            );
            expect(res).toBeDefined();
            expect(
                schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations,
            ).toHaveBeenCalled();
            expect(personRepositoryMock.findByPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expect(emailRepoMock.getEmailAddressAndStatusForPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expect(
                dBiamPersonenkontextRepoMock.findByPersonIdsAndServiceprovidersWithOrgaAndRolle,
            ).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
                expect.arrayContaining(rolle.serviceProviderIds),
                { all: false, orgaIds: [orga1.id, orga1.id] },
            );
            expect(userLockRepoMock.findByPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expectOkResult(res);
            expect(res.value.length).toEqual(2);
            expect(res.value[0]).toBeInstanceOf(PersonInfoResponseV1);
            expect(res.value[1]).toBeInstanceOf(PersonInfoResponseV1);
        });

        it('should return persons with all permissions using new microservice', async () => {
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const orga1: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const orga2: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.SYSADMIN,
                systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
                serviceProviderIds: ['serviceProvider1', 'serviceProvider2'],
            });
            const kontext1: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga1);
                },
            });
            const kontext2: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga2);
                },
            });

            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });
            dBiamPersonenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([
                {
                    personenkontext: kontext1,
                    organisation: orga1,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
                {
                    personenkontext: kontext2,
                    organisation: orga2,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ]);

            const personId1: string = faker.string.uuid();
            const personId2: string = faker.string.uuid();
            schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations.mockResolvedValueOnce([
                personId1,
                personId2,
            ]);
            schulconnexRepo.findPersonIdsWithRollenerweiterungForServiceProviderAndOptionallyOrganisations.mockResolvedValueOnce(
                [],
            );

            personRepositoryMock.findByPersonIds.mockResolvedValue([
                DoFactory.createPerson(true, { id: personId1 }),
                DoFactory.createPerson(true, { id: personId1 }),
            ]);
            emailResolverServiceMock.findEmailsBySpshPersons.mockResolvedValue({
                ok: true,
                value: new Map([
                    [personId1, createMock(PersonEmailResponse)],
                    [personId2, createMock(PersonEmailResponse)],
                ]),
            });
            dBiamPersonenkontextRepoMock.findByPersonIdsAndServiceprovidersWithOrgaAndRolle.mockResolvedValue(
                new Map([
                    [personId1, []],
                    [personId2, []],
                ]),
            );
            userLockRepoMock.findByPersonIds.mockResolvedValue(
                new Map([
                    [personId1, []],
                    [personId2, []],
                ]),
            );

            const res: Result<PersonInfoResponseV1[], DomainError> = await sut.findPersonsForPersonenInfoV1(
                permissions,
                0,
                10,
            );
            expect(res).toBeDefined();
            expect(
                schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations,
            ).toHaveBeenCalled();
            expect(personRepositoryMock.findByPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expect(emailResolverServiceMock.findEmailsBySpshPersons).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expect(
                dBiamPersonenkontextRepoMock.findByPersonIdsAndServiceprovidersWithOrgaAndRolle,
            ).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
                expect.arrayContaining(rolle.serviceProviderIds),
                { all: true },
            );
            expect(userLockRepoMock.findByPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expectOkResult(res);
            expect(res.value.length).toEqual(2);
            expect(res.value[0]).toBeInstanceOf(PersonInfoResponseV1);
            expect(res.value[1]).toBeInstanceOf(PersonInfoResponseV1);
        });

        it('should return persons with all permissions using old repo', async () => {
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const orga1: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const orga2: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.SYSADMIN,
                systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
                serviceProviderIds: ['serviceProvider1', 'serviceProvider2'],
            });
            const kontext1: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga1);
                },
            });
            const kontext2: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga2);
                },
            });

            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });
            dBiamPersonenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([
                {
                    personenkontext: kontext1,
                    organisation: orga1,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
                {
                    personenkontext: kontext2,
                    organisation: orga2,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ]);

            const personId1: string = faker.string.uuid();
            const personId2: string = faker.string.uuid();
            schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations.mockResolvedValueOnce([
                personId1,
                personId2,
            ]);
            schulconnexRepo.findPersonIdsWithRollenerweiterungForServiceProviderAndOptionallyOrganisations.mockResolvedValueOnce(
                [],
            );

            personRepositoryMock.findByPersonIds.mockResolvedValue([
                DoFactory.createPerson(true, { id: personId1 }),
                DoFactory.createPerson(true, { id: personId1 }),
            ]);
            emailRepoMock.getEmailAddressAndStatusForPersonIds.mockResolvedValue({
                ok: true,
                value: new Map([
                    [personId1, createMock(PersonEmailResponse)],
                    [personId2, createMock(PersonEmailResponse)],
                ]),
            });
            dBiamPersonenkontextRepoMock.findByPersonIdsAndServiceprovidersWithOrgaAndRolle.mockResolvedValue(
                new Map([
                    [personId1, []],
                    [personId2, []],
                ]),
            );
            userLockRepoMock.findByPersonIds.mockResolvedValue(
                new Map([
                    [personId1, []],
                    [personId2, []],
                ]),
            );

            const res: Result<PersonInfoResponseV1[], DomainError> = await sut.findPersonsForPersonenInfoV1(
                permissions,
                0,
                10,
            );
            expect(res).toBeDefined();
            expect(
                schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations,
            ).toHaveBeenCalled();
            expect(personRepositoryMock.findByPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expect(emailRepoMock.getEmailAddressAndStatusForPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expect(
                dBiamPersonenkontextRepoMock.findByPersonIdsAndServiceprovidersWithOrgaAndRolle,
            ).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
                expect.arrayContaining(rolle.serviceProviderIds),
                { all: true },
            );
            expect(userLockRepoMock.findByPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expectOkResult(res);
            expect(res.value.length).toEqual(2);
            expect(res.value[0]).toBeInstanceOf(PersonInfoResponseV1);
            expect(res.value[1]).toBeInstanceOf(PersonInfoResponseV1);
        });

        it('should return persons and default to empty kontext and userlock array', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const orga1: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const orga2: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.SYSADMIN,
                systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
                serviceProviderIds: ['serviceProvider1', 'serviceProvider2'],
            });
            const kontext1: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga1);
                },
            });
            const kontext2: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga2);
                },
            });

            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });
            dBiamPersonenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([
                {
                    personenkontext: kontext1,
                    organisation: orga1,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
                {
                    personenkontext: kontext2,
                    organisation: orga2,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ]);

            const personId1: string = faker.string.uuid();
            const personId2: string = faker.string.uuid();
            schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations.mockResolvedValueOnce([
                personId1,
                personId2,
            ]);
            schulconnexRepo.findPersonIdsWithRollenerweiterungForServiceProviderAndOptionallyOrganisations.mockResolvedValueOnce(
                [],
            );

            personRepositoryMock.findByPersonIds.mockResolvedValue([
                DoFactory.createPerson(true, { id: personId1 }),
                DoFactory.createPerson(true, { id: personId1 }),
            ]);
            emailRepoMock.getEmailAddressAndStatusForPersonIds.mockResolvedValue({
                ok: true,
                value: new Map([
                    [personId1, createMock(PersonEmailResponse)],
                    [personId2, createMock(PersonEmailResponse)],
                ]),
            });
            dBiamPersonenkontextRepoMock.findByPersonIdsAndServiceprovidersWithOrgaAndRolle.mockResolvedValue(
                new Map([
                    ['', []],
                    ['', []],
                ]),
            );
            userLockRepoMock.findByPersonIds.mockResolvedValue(
                new Map([
                    ['', []],
                    ['', []],
                ]),
            );

            const res: Result<PersonInfoResponseV1[], DomainError> = await sut.findPersonsForPersonenInfoV1(
                permissions,
                0,
                10,
            );
            expect(res).toBeDefined();
            expect(
                schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations,
            ).toHaveBeenCalled();
            expect(personRepositoryMock.findByPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expect(emailRepoMock.getEmailAddressAndStatusForPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expect(
                dBiamPersonenkontextRepoMock.findByPersonIdsAndServiceprovidersWithOrgaAndRolle,
            ).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
                expect.arrayContaining(rolle.serviceProviderIds),
                { all: true },
            );
            expect(userLockRepoMock.findByPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expectOkResult(res);
            expect(res.value.length).toEqual(2);
            expect(res.value[0]).toBeInstanceOf(PersonInfoResponseV1);
            expect(res.value[1]).toBeInstanceOf(PersonInfoResponseV1);
        });

        it('should return error when email repo returns error', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            dBiamPersonenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([
                {
                    personenkontext: DoFactory.createPersonenkontext(true, {
                        loeschungZeitpunkt: new Date(),
                        getRolle: () =>
                            Promise.resolve(
                                DoFactory.createRolle(true, {
                                    rollenart: RollenArt.SYSADMIN,
                                    systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
                                    serviceProviderIds: ['serviceProvider1', 'serviceProvider2'],
                                }),
                            ),
                        getOrganisation() {
                            return Promise.resolve(
                                DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }),
                            );
                        },
                    }),
                    organisation: DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }),
                    rolle: DoFactory.createRolle(true, {
                        rollenart: RollenArt.SYSADMIN,
                        systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
                        serviceProviderIds: ['serviceProvider1', 'serviceProvider2'],
                    }),
                } satisfies KontextWithOrgaAndRolle,
            ]);

            const personId: string = faker.string.uuid();

            schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations.mockResolvedValue([
                personId,
            ]);
            schulconnexRepo.findPersonIdsWithRollenerweiterungForServiceProviderAndOptionallyOrganisations.mockResolvedValue(
                [],
            );

            personRepositoryMock.findByPersonIds.mockResolvedValue([DoFactory.createPerson(true, { id: personId })]);

            emailRepoMock.getEmailAddressAndStatusForPersonIds.mockResolvedValue({
                ok: false,
                error: undefined as unknown as DomainError,
            });

            const res: Result<PersonInfoResponseV1[], DomainError> = await sut.findPersonsForPersonenInfoV1(
                permissions,
                0,
                10,
            );

            expect(res.ok).toBe(false);
        });
    });

    it('should return error when email microservice fails', async () => {
        emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);

        const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

        permissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
        dBiamPersonenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([
            {
                personenkontext: DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: new Date(),
                    getRolle: () =>
                        Promise.resolve(
                            DoFactory.createRolle(true, {
                                rollenart: RollenArt.SYSADMIN,
                                systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
                                serviceProviderIds: ['serviceProvider1'],
                            }),
                        ),
                    getOrganisation: () =>
                        Promise.resolve(DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE })),
                }),
                organisation: DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }),
                rolle: DoFactory.createRolle(true, {
                    rollenart: RollenArt.SYSADMIN,
                    systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
                    serviceProviderIds: ['serviceProvider1'],
                }),
            } satisfies KontextWithOrgaAndRolle,
        ]);

        const personId: string = faker.string.uuid();

        schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations.mockResolvedValueOnce([
            personId,
        ]);

        schulconnexRepo.findPersonIdsWithRollenerweiterungForServiceProviderAndOptionallyOrganisations.mockResolvedValueOnce(
            [],
        );

        emailResolverServiceMock.findEmailsBySpshPersons.mockResolvedValue({
            ok: false,
            error: undefined as unknown as DomainError,
        });

        const res: Result<PersonInfoResponseV1[], DomainError> = await sut.findPersonsForPersonenInfoV1(
            permissions,
            0,
            10,
        );

        expect(res.ok).toBe(false);
    });

    describe('findPersonsForPersonenInfoV2', () => {
        it('should return empty array when caller has 0 organisations with PERSONEN_LESEN', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [],
            });
            dBiamPersonenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([]);

            const res: Result<PersonInfoDtoV2[], DomainError> = await sut.findPersonsForPersonenInfoV2(
                permissions,
                0,
                10,
            );

            expectOkResult(res);
            expect(res.value.length).toEqual(0);
            expect(
                schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations,
            ).not.toHaveBeenCalled();
        });

        it('should return persons with specific permissions', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const orga1: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const orga2: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.SYSADMIN,
                systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
                serviceProviderIds: ['serviceProvider1', 'serviceProvider2'],
            });
            const kontext1: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga1);
                },
            });
            const kontext2: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga2);
                },
            });

            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [orga1.id, orga1.id],
            });
            dBiamPersonenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([
                {
                    personenkontext: kontext1,
                    organisation: orga1,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
                {
                    personenkontext: kontext2,
                    organisation: orga2,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ]);

            const personId1: string = faker.string.uuid();
            const personId2: string = faker.string.uuid();
            schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations.mockResolvedValueOnce([
                personId1,
            ]);
            schulconnexRepo.findPersonIdsWithRollenerweiterungForServiceProviderAndOptionallyOrganisations.mockResolvedValueOnce(
                [personId2],
            );

            personRepositoryMock.findByPersonIds.mockResolvedValue([
                DoFactory.createPerson(true, { id: personId1 }),
                DoFactory.createPerson(true, { id: personId2 }),
            ]);
            emailRepoMock.getEmailAddressAndStatusForPersonIds.mockResolvedValue({
                ok: true,
                value: new Map([
                    [personId1, createMock(PersonEmailResponse)],
                    [personId2, createMock(PersonEmailResponse)],
                ]),
            });
            dBiamPersonenkontextRepoMock.findByPersonIdsAndServiceprovidersWithOrgaAndRolle.mockResolvedValue(
                new Map([
                    [personId1, []],
                    [personId2, []],
                ]),
            );
            userLockRepoMock.findByPersonIds.mockResolvedValue(
                new Map([
                    [personId1, []],
                    [personId2, []],
                ]),
            );

            const res: Result<PersonInfoDtoV2[], DomainError> = await sut.findPersonsForPersonenInfoV2(
                permissions,
                0,
                10,
            );

            expect(res).toBeDefined();
            expect(
                schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations,
            ).toHaveBeenCalled();
            expect(personRepositoryMock.findByPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expect(emailRepoMock.getEmailAddressAndStatusForPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expect(
                dBiamPersonenkontextRepoMock.findByPersonIdsAndServiceprovidersWithOrgaAndRolle,
            ).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
                expect.arrayContaining(rolle.serviceProviderIds),
                { all: false, orgaIds: [orga1.id, orga1.id] },
            );
            expect(userLockRepoMock.findByPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expectOkResult(res);
            expect(res.value.length).toEqual(2);
            expect(res.value[0]).toBeInstanceOf(PersonInfoDtoV2);
            expect(res.value[1]).toBeInstanceOf(PersonInfoDtoV2);
        });

        it('should return error when email microservice fails', async () => {
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            dBiamPersonenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([
                {
                    personenkontext: DoFactory.createPersonenkontext(true, {
                        loeschungZeitpunkt: new Date(),
                        getRolle: () =>
                            Promise.resolve(
                                DoFactory.createRolle(true, {
                                    rollenart: RollenArt.SYSADMIN,
                                    systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
                                    serviceProviderIds: ['serviceProvider1'],
                                }),
                            ),
                        getOrganisation: () =>
                            Promise.resolve(DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE })),
                    }),
                    organisation: DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }),
                    rolle: DoFactory.createRolle(true, {
                        rollenart: RollenArt.SYSADMIN,
                        systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
                        serviceProviderIds: ['serviceProvider1'],
                    }),
                } satisfies KontextWithOrgaAndRolle,
            ]);

            const personId: string = faker.string.uuid();

            schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations.mockResolvedValueOnce([
                personId,
            ]);

            schulconnexRepo.findPersonIdsWithRollenerweiterungForServiceProviderAndOptionallyOrganisations.mockResolvedValueOnce(
                [],
            );

            emailResolverServiceMock.findEmailsBySpshPersons.mockResolvedValue({
                ok: false,
                error: undefined as unknown as DomainError,
            });

            const res: Result<PersonInfoDtoV2[], DomainError> = await sut.findPersonsForPersonenInfoV2(
                permissions,
                0,
                10,
            );

            expect(res.ok).toBe(false);
        });

        it('should ignore kontext roles without PERSONEN_LESEN systemrecht', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: ['orga1'],
            });

            const rolleWithoutPermission: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.SYSADMIN,
                systemrechte: [],
                serviceProviderIds: ['serviceProvider1'],
            });

            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolleWithoutPermission),
                getOrganisation: () =>
                    Promise.resolve(
                        DoFactory.createOrganisation(true, {
                            typ: OrganisationsTyp.SCHULE,
                        }),
                    ),
            });

            dBiamPersonenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([
                {
                    personenkontext: kontext,
                    organisation: DoFactory.createOrganisation(true, {
                        typ: OrganisationsTyp.SCHULE,
                    }),
                    rolle: rolleWithoutPermission,
                } satisfies KontextWithOrgaAndRolle,
            ]);

            const res: Result<PersonInfoDtoV2[], DomainError> = await sut.findPersonsForPersonenInfoV2(
                permissions,
                0,
                10,
            );

            expectOkResult(res);
            expect(res.value).toEqual([]);

            expect(
                schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations,
            ).not.toHaveBeenCalled();
        });

        it('should return persons with all permissions using new microservice', async () => {
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const orga1: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const orga2: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.SYSADMIN,
                systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
                serviceProviderIds: ['serviceProvider1', 'serviceProvider2'],
            });
            const kontext1: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga1);
                },
            });
            const kontext2: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga2);
                },
            });

            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });
            dBiamPersonenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([
                {
                    personenkontext: kontext1,
                    organisation: orga1,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
                {
                    personenkontext: kontext2,
                    organisation: orga2,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ]);

            const personId1: string = faker.string.uuid();
            const personId2: string = faker.string.uuid();
            schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations.mockResolvedValueOnce([
                personId1,
                personId2,
            ]);
            schulconnexRepo.findPersonIdsWithRollenerweiterungForServiceProviderAndOptionallyOrganisations.mockResolvedValueOnce(
                [],
            );

            personRepositoryMock.findByPersonIds.mockResolvedValue([
                DoFactory.createPerson(true, { id: personId1 }),
                DoFactory.createPerson(true, { id: personId1 }),
            ]);
            emailResolverServiceMock.findEmailsBySpshPersons.mockResolvedValue({
                ok: true,
                value: new Map([
                    [personId1, createMock(PersonEmailResponse)],
                    [personId2, createMock(PersonEmailResponse)],
                ]),
            });
            dBiamPersonenkontextRepoMock.findByPersonIdsAndServiceprovidersWithOrgaAndRolle.mockResolvedValue(
                new Map([
                    [personId1, []],
                    [personId2, []],
                ]),
            );
            userLockRepoMock.findByPersonIds.mockResolvedValue(
                new Map([
                    [personId1, []],
                    [personId2, []],
                ]),
            );

            const res: Result<PersonInfoDtoV2[], DomainError> = await sut.findPersonsForPersonenInfoV2(
                permissions,
                0,
                10,
            );
            expect(res).toBeDefined();
            expect(
                schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations,
            ).toHaveBeenCalled();
            expect(personRepositoryMock.findByPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expect(emailResolverServiceMock.findEmailsBySpshPersons).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expect(
                dBiamPersonenkontextRepoMock.findByPersonIdsAndServiceprovidersWithOrgaAndRolle,
            ).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
                expect.arrayContaining(rolle.serviceProviderIds),
                { all: true },
            );
            expect(userLockRepoMock.findByPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expectOkResult(res);
            expect(res.value.length).toEqual(2);
            expect(res.value[0]).toBeInstanceOf(PersonInfoDtoV2);
            expect(res.value[1]).toBeInstanceOf(PersonInfoDtoV2);
        });

        it('should return persons with all permissions using old repo', async () => {
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const orga1: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const orga2: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.SYSADMIN,
                systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
                serviceProviderIds: ['serviceProvider1', 'serviceProvider2'],
            });
            const kontext1: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga1);
                },
            });
            const kontext2: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga2);
                },
            });

            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });
            dBiamPersonenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([
                {
                    personenkontext: kontext1,
                    organisation: orga1,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
                {
                    personenkontext: kontext2,
                    organisation: orga2,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ]);

            const personId1: string = faker.string.uuid();
            const personId2: string = faker.string.uuid();
            schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations.mockResolvedValueOnce([
                personId1,
                personId2,
            ]);
            schulconnexRepo.findPersonIdsWithRollenerweiterungForServiceProviderAndOptionallyOrganisations.mockResolvedValueOnce(
                [],
            );

            personRepositoryMock.findByPersonIds.mockResolvedValue([
                DoFactory.createPerson(true, { id: personId1 }),
                DoFactory.createPerson(true, { id: personId1 }),
            ]);
            emailRepoMock.getEmailAddressAndStatusForPersonIds.mockResolvedValue({
                ok: true,
                value: new Map([
                    [personId1, createMock(PersonEmailResponse)],
                    [personId2, createMock(PersonEmailResponse)],
                ]),
            });
            dBiamPersonenkontextRepoMock.findByPersonIdsAndServiceprovidersWithOrgaAndRolle.mockResolvedValue(
                new Map([
                    [personId1, []],
                    [personId2, []],
                ]),
            );
            userLockRepoMock.findByPersonIds.mockResolvedValue(
                new Map([
                    [personId1, []],
                    [personId2, []],
                ]),
            );

            const res: Result<PersonInfoDtoV2[], DomainError> = await sut.findPersonsForPersonenInfoV2(
                permissions,
                0,
                10,
            );
            expect(res).toBeDefined();
            expect(
                schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations,
            ).toHaveBeenCalled();
            expect(personRepositoryMock.findByPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expect(emailRepoMock.getEmailAddressAndStatusForPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expect(
                dBiamPersonenkontextRepoMock.findByPersonIdsAndServiceprovidersWithOrgaAndRolle,
            ).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
                expect.arrayContaining(rolle.serviceProviderIds),
                { all: true },
            );
            expect(userLockRepoMock.findByPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expectOkResult(res);
            expect(res.value.length).toEqual(2);
            expect(res.value[0]).toBeInstanceOf(PersonInfoDtoV2);
            expect(res.value[1]).toBeInstanceOf(PersonInfoDtoV2);
        });

        it('should return persons and default to empty kontext and userlock array', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const orga1: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const orga2: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.SYSADMIN,
                systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
                serviceProviderIds: ['serviceProvider1', 'serviceProvider2'],
            });
            const kontext1: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga1);
                },
            });
            const kontext2: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga2);
                },
            });

            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });
            dBiamPersonenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([
                {
                    personenkontext: kontext1,
                    organisation: orga1,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
                {
                    personenkontext: kontext2,
                    organisation: orga2,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ]);

            const personId1: string = faker.string.uuid();
            const personId2: string = faker.string.uuid();
            schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations.mockResolvedValueOnce([
                personId1,
                personId2,
            ]);
            schulconnexRepo.findPersonIdsWithRollenerweiterungForServiceProviderAndOptionallyOrganisations.mockResolvedValueOnce(
                [],
            );

            personRepositoryMock.findByPersonIds.mockResolvedValue([
                DoFactory.createPerson(true, { id: personId1 }),
                DoFactory.createPerson(true, { id: personId1 }),
            ]);
            emailRepoMock.getEmailAddressAndStatusForPersonIds.mockResolvedValue({
                ok: true,
                value: new Map([
                    [personId1, createMock(PersonEmailResponse)],
                    [personId2, createMock(PersonEmailResponse)],
                ]),
            });
            dBiamPersonenkontextRepoMock.findByPersonIdsAndServiceprovidersWithOrgaAndRolle.mockResolvedValue(
                new Map([
                    ['', []],
                    ['', []],
                ]),
            );
            userLockRepoMock.findByPersonIds.mockResolvedValue(
                new Map([
                    ['', []],
                    ['', []],
                ]),
            );

            const res: Result<PersonInfoDtoV2[], DomainError> = await sut.findPersonsForPersonenInfoV2(
                permissions,
                0,
                10,
            );
            expect(res).toBeDefined();
            expect(
                schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations,
            ).toHaveBeenCalled();
            expect(personRepositoryMock.findByPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expect(emailRepoMock.getEmailAddressAndStatusForPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expect(
                dBiamPersonenkontextRepoMock.findByPersonIdsAndServiceprovidersWithOrgaAndRolle,
            ).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
                expect.arrayContaining(rolle.serviceProviderIds),
                { all: true },
            );
            expect(userLockRepoMock.findByPersonIds).toHaveBeenCalledWith(
                expect.arrayContaining([personId1, personId2]),
            );
            expectOkResult(res);
            expect(res.value.length).toEqual(2);
            expect(res.value[0]).toBeInstanceOf(PersonInfoDtoV2);
            expect(res.value[1]).toBeInstanceOf(PersonInfoDtoV2);
        });

        it('should return error when email repo returns error', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            dBiamPersonenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([
                {
                    personenkontext: DoFactory.createPersonenkontext(true, {
                        loeschungZeitpunkt: new Date(),
                        getRolle: () =>
                            Promise.resolve(
                                DoFactory.createRolle(true, {
                                    rollenart: RollenArt.SYSADMIN,
                                    systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
                                    serviceProviderIds: ['serviceProvider1', 'serviceProvider2'],
                                }),
                            ),
                        getOrganisation() {
                            return Promise.resolve(
                                DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }),
                            );
                        },
                    }),
                    organisation: DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }),
                    rolle: DoFactory.createRolle(true, {
                        rollenart: RollenArt.SYSADMIN,
                        systemrechte: [RollenSystemRecht.PERSONEN_LESEN],
                        serviceProviderIds: ['serviceProvider1', 'serviceProvider2'],
                    }),
                } satisfies KontextWithOrgaAndRolle,
            ]);

            const personId: string = faker.string.uuid();

            schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations.mockResolvedValue([
                personId,
            ]);
            schulconnexRepo.findPersonIdsWithRollenerweiterungForServiceProviderAndOptionallyOrganisations.mockResolvedValue(
                [],
            );

            personRepositoryMock.findByPersonIds.mockResolvedValue([DoFactory.createPerson(true, { id: personId })]);

            emailRepoMock.getEmailAddressAndStatusForPersonIds.mockResolvedValue({
                ok: false,
                error: undefined as unknown as DomainError,
            });

            const res: Result<PersonInfoDtoV2[], DomainError> = await sut.findPersonsForPersonenInfoV2(
                permissions,
                0,
                10,
            );

            expect(res.ok).toBe(false);
        });
    });
});
