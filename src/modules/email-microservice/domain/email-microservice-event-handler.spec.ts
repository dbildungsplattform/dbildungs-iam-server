import { faker } from '@faker-js/faker';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import {
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    DoFactory,
    EventSystemTestModule,
} from '../../../../test/utils/index.js';
import { EventModule } from '../../../core/eventbus/index.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { LocksForPersonChangedEvent } from '../../../shared/events/locks-for-person-changed.event.js';
import { OrganisationDeletedEvent } from '../../../shared/events/organisation-deleted.event.js';
import { PersonDeletedEvent } from '../../../shared/events/person-deleted.event.js';
import { PersonExternalSystemsSyncEvent } from '../../../shared/events/person-external-systems-sync.event.js';
import { PersonRenamedEvent } from '../../../shared/events/person-renamed-event.js';
import { type PersonenkontextEventKontextData } from '../../../shared/events/personenkontext-event.types.js';
import { PersonenkontextUpdatedEvent } from '../../../shared/events/personenkontext-updated.event.js';
import { SchuleUpdatedEvent } from '../../../shared/events/schule-updated.event.js';
import { UserLock } from '../../keycloak-administration/domain/user-lock.js';
import { UserLockRepository } from '../../keycloak-administration/repository/user-lock.repository.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { type Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { ServiceProviderSystem } from '../../service-provider/domain/service-provider.enum.js';
import { EmailMicroserviceModule } from '../email-microservice.module.js';
import { EmailMicroserviceEventHandler } from './email-microservice-event-handler.js';
import { EmailResolverService } from './email-resolver.service.js';
import { PersonHasNoUsernameError } from './error/person-has-no-username.error.js';

type SetEmailParams = Omit<Parameters<EmailResolverService['setEmailForSpshPerson']>[0], 'spshPersonId'>;

function createPersonRenamedEvent({
    personId,
    vorname,
    familienname,
    username,
}: Pick<PersonRenamedEvent, 'personId' | 'vorname' | 'familienname' | 'username'>): PersonRenamedEvent {
    return new PersonRenamedEvent(
        personId,
        vorname,
        familienname,
        username,
        faker.person.firstName(),
        faker.person.lastName(),
        faker.internet.username(),
    );
}

function createRolleWithServiceProvider({
    rolleId = faker.string.uuid(),
    serviceProviderId = faker.string.uuid(),
    externalSystem,
}: {
    rolleId?: string;
    serviceProviderId?: string;
    externalSystem: ServiceProviderSystem;
}): Rolle<true> {
    return DoFactory.createRolle(true, {
        id: rolleId,
        serviceProviderData: [
            DoFactory.createServiceProvider(true, {
                id: serviceProviderId,
                externalSystem,
            }),
        ],
    });
}

function createSchuleUpdatedEvent({
    organisationId,
    name,
    oldName,
}: Pick<SchuleUpdatedEvent, 'organisationId' | 'name' | 'oldName'>): SchuleUpdatedEvent {
    return new SchuleUpdatedEvent(
        organisationId,
        undefined,
        name,
        false,
        undefined,
        undefined,
        undefined,
        oldName,
        undefined,
        undefined,
    );
}

describe('EmailMicroserviceEventHandler', () => {
    let app: INestApplication;
    let module: TestingModule;

    let sut: EmailMicroserviceEventHandler;
    let loggerMock: DeepMocked<ClassLogger>;
    let emailResolverServiceMock: DeepMocked<EmailResolverService>;
    let orgaRepoMock: DeepMocked<OrganisationRepository>;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let personRepositoryMock: DeepMocked<PersonRepository>;
    let userLockRepoMock: DeepMocked<UserLockRepository>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                EmailMicroserviceModule,
                CommonTestModule,
                EventModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: false }),
            ],
            providers: [],
        })
            .overrideModule(EventModule)
            .useModule(EventSystemTestModule)
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .overrideProvider(EmailResolverService)
            .useValue(createMock(EmailResolverService))
            .overrideProvider(OrganisationRepository)
            .useValue(createMock(OrganisationRepository))
            .overrideProvider(RolleRepo)
            .useValue(createMock(RolleRepo))
            .overrideProvider(DBiamPersonenkontextRepo)
            .useValue(createMock<DBiamPersonenkontextRepo>(DBiamPersonenkontextRepo))
            .overrideProvider(PersonRepository)
            .useValue(createMock<PersonRepository>(PersonRepository))
            .overrideProvider(UserLockRepository)
            .useValue(createMock(UserLockRepository))
            .compile();

        sut = module.get(EmailMicroserviceEventHandler);
        loggerMock = module.get(ClassLogger);
        emailResolverServiceMock = module.get(EmailResolverService);
        orgaRepoMock = module.get(OrganisationRepository);
        rolleRepoMock = module.get(RolleRepo);
        personenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        personRepositoryMock = module.get(PersonRepository);
        userLockRepoMock = module.get(UserLockRepository);

        app = module.createNestApplication();
        await app.init();
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('handlePersonenkontextUpdatedEvent', () => {
        it('should log and call emailResolverService', async () => {
            const mockServiceProviderId: string = faker.string.uuid();
            const spshPersonId: string = faker.string.uuid();
            const mockOrganisation: Organisation<true> = DoFactory.createOrganisation(true, { kennung: '0706054' });
            const params: SetEmailParams = {
                spshUsername: faker.internet.username(),
                organisationen: [mockOrganisation],
                firstName: faker.person.firstName(),
                lastName: faker.person.lastName(),
                spshServiceProviderId: mockServiceProviderId,
                gesperrt: true,
            };
            const mockEvent: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: spshPersonId,
                    vorname: params.firstName,
                    familienname: params.lastName,
                    username: params.spshUsername,
                },
                [],
                [],
                [
                    {
                        id: 'pk1',
                        rolleId: 'r1',
                        rolle: RollenArt.LERN,
                        orgaId: mockOrganisation.id,
                        orgaKennung: '0706054',
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [ServiceProviderSystem.EMAIL],
                    },
                ],
            );
            const mockRolle: Rolle<true> = createRolleWithServiceProvider({
                serviceProviderId: mockServiceProviderId,
                externalSystem: ServiceProviderSystem.EMAIL,
            });

            rolleRepoMock.findByIds.mockResolvedValue(new Map([['r1', mockRolle]]));
            orgaRepoMock.findByIds.mockResolvedValueOnce(new Map([[mockOrganisation.id, mockOrganisation]]));
            userLockRepoMock.findByPersonId.mockResolvedValueOnce([createMock(UserLock)]);

            await sut.handlePersonenkontextUpdatedEvent(mockEvent);
            expect(orgaRepoMock.findByIds).toHaveBeenCalledWith([mockOrganisation.id]);
            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining('Received PersonenkontextUpdatedEvent'),
            );
            expect(emailResolverServiceMock.setEmailForSpshPerson).toHaveBeenCalledWith({
                spshPersonId: spshPersonId,
                ...params,
                organisationen: [mockOrganisation],
            });
        });

        it('should log and call emailResolverService when username is undefined (not in praxis)', async () => {
            const mockServiceProviderId: string = faker.string.uuid();
            const spshPersonId: string = faker.string.uuid();
            const params: SetEmailParams = {
                spshUsername: '',
                organisationen: [DoFactory.createOrganisation(true, { kennung: '0706054' })],
                firstName: faker.person.firstName(),
                lastName: faker.person.lastName(),
                spshServiceProviderId: mockServiceProviderId,
                gesperrt: false,
            };
            const mockEvent: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: spshPersonId,
                    vorname: params.firstName,
                    familienname: params.lastName,
                    username: undefined,
                },
                [],
                [],
                [
                    {
                        id: 'pk1',
                        rolleId: 'r1',
                        rolle: RollenArt.LERN,
                        orgaId: faker.string.uuid(),
                        orgaKennung: '0706054',
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [ServiceProviderSystem.EMAIL],
                    },
                ],
            );
            const mockRolle: Rolle<true> = createRolleWithServiceProvider({
                serviceProviderId: mockServiceProviderId,
                externalSystem: ServiceProviderSystem.EMAIL,
            });

            rolleRepoMock.findByIds.mockResolvedValue(new Map([['r1', mockRolle]]));
            userLockRepoMock.findByPersonId.mockResolvedValueOnce([]);

            await expect(sut.handlePersonenkontextUpdatedEvent(mockEvent)).rejects.toThrow(
                `Person with id:${spshPersonId} has no username, cannot resolve email.`,
            );
            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining('Received PersonenkontextUpdatedEvent'),
            );
            expect(emailResolverServiceMock.setEmailForSpshPerson).not.toHaveBeenCalled();
        });

        it('should log and return early when no email service provider is found', async () => {
            const mockPersonId: string = faker.string.uuid();
            const mockRolleId: string = 'r1';
            const mockEvent: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: mockPersonId,
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                    username: 'testuser',
                },
                [],
                [],
                [
                    {
                        id: 'pk1',
                        rolleId: mockRolleId,
                        rolle: RollenArt.LEHR,
                        orgaId: faker.string.uuid(),
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
            );
            const mockRolle: Rolle<true> = createRolleWithServiceProvider({
                rolleId: mockRolleId,
                externalSystem: ServiceProviderSystem.NONE,
            });

            rolleRepoMock.findByIds.mockResolvedValue(new Map([[mockRolleId, mockRolle]]));
            orgaRepoMock.findByIds.mockResolvedValueOnce(new Map());
            userLockRepoMock.findByPersonId.mockResolvedValueOnce([]);

            await sut.handlePersonenkontextUpdatedEvent(mockEvent);
            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining('Received PersonenkontextUpdatedEvent'),
            );
            expect(loggerMock.debug).toHaveBeenCalledWith(
                expect.stringContaining(`No email service provider found or removed for personId:${mockPersonId}`),
            );
            expect(emailResolverServiceMock.setEmailForSpshPerson).not.toHaveBeenCalled();
        });

        it('should resolve correct email service provider and call setEmailForSpshPerson', async () => {
            const mockPersonId: string = faker.string.uuid();
            const mockServiceProviderId: string = faker.string.uuid();
            const mockOrganisation: Organisation<true> = DoFactory.createOrganisation(true, { kennung: '0706054' });
            const mockEvent: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: mockPersonId,
                    username: 'testuser',
                    vorname: 'Max',
                    familienname: 'Mustermann',
                },
                [],
                [],
                [
                    {
                        id: 'pk1',
                        rolleId: 'r1',
                        rolle: RollenArt.LERN,
                        orgaId: mockOrganisation.id,
                        orgaKennung: '0706054',
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
            );
            const mockRolle: Rolle<true> = createRolleWithServiceProvider({
                serviceProviderId: mockServiceProviderId,
                externalSystem: ServiceProviderSystem.EMAIL,
            });

            rolleRepoMock.findByIds.mockResolvedValue(new Map([['r1', mockRolle]]));
            orgaRepoMock.findByIds.mockResolvedValueOnce(new Map([[mockOrganisation.id, mockOrganisation]]));
            userLockRepoMock.findByPersonId.mockResolvedValueOnce([]);

            vi.spyOn(emailResolverServiceMock, 'setEmailForSpshPerson').mockResolvedValue();

            await sut.handlePersonenkontextUpdatedEvent(mockEvent);
            expect(emailResolverServiceMock.setEmailForSpshPerson).toHaveBeenCalledWith({
                spshPersonId: mockPersonId,
                spshUsername: 'testuser',
                organisationen: [mockOrganisation],
                firstName: 'Max',
                lastName: 'Mustermann',
                gesperrt: false,
                spshServiceProviderId: mockServiceProviderId,
            });
        });

        it('should call setEmailsSuspendedForSpshPerson if currentKontexte has no email SpId but removedKontexte has one', async () => {
            const mockPersonId: string = faker.string.uuid();
            const orgaId: string = faker.string.uuid();
            const rolleId1: string = faker.string.uuid();
            const rolleId2: string = faker.string.uuid();
            const mockServiceProviderId1: string = faker.string.uuid();
            const mockServiceProviderId2: string = faker.string.uuid();
            const mockEvent: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: mockPersonId,
                    username: 'testuser',
                    vorname: 'Max',
                    familienname: 'Mustermann',
                },
                // new kontexte
                [],
                // removed kontexte
                [
                    {
                        id: 'pk2',
                        rolleId: rolleId2,
                        rolle: RollenArt.LERN,
                        orgaId: orgaId,
                        orgaKennung: '0706054',
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [ServiceProviderSystem.EMAIL],
                    },
                ],
                // current kontexte
                [
                    {
                        id: 'pk1',
                        rolleId: rolleId1,
                        rolle: RollenArt.LERN,
                        orgaId: orgaId,
                        orgaKennung: '0706054',
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [ServiceProviderSystem.NONE],
                    },
                ],
            );
            const mockRolle1: Rolle<true> = createRolleWithServiceProvider({
                rolleId: rolleId1,
                serviceProviderId: mockServiceProviderId1,
                externalSystem: ServiceProviderSystem.NONE,
            });
            const mockRolle2: Rolle<true> = createRolleWithServiceProvider({
                rolleId: rolleId2,
                serviceProviderId: mockServiceProviderId2,
                externalSystem: ServiceProviderSystem.EMAIL,
            });

            rolleRepoMock.findByIds.mockImplementation((ids: string[]) => {
                const map: Map<string, Rolle<true>> = new Map<string, Rolle<true>>();
                if (ids.includes(rolleId1)) {
                    map.set(rolleId1, mockRolle1);
                }
                if (ids.includes(rolleId2)) {
                    map.set(rolleId2, mockRolle2);
                }
                return Promise.resolve(map);
            });

            orgaRepoMock.findByIds.mockResolvedValueOnce(new Map());
            userLockRepoMock.findByPersonId.mockResolvedValueOnce([]);

            await sut.handlePersonenkontextUpdatedEvent(mockEvent);
            expect(emailResolverServiceMock.setEmailsSuspendedForSpshPerson).toHaveBeenCalledWith({
                spshPersonId: mockPersonId,
                gesperrt: false,
            });
        });

        it('should filter out kontexte whose id is in removedKontexte', async () => {
            const mockServiceProviderId: string = faker.string.uuid();
            const spshPersonId: string = faker.string.uuid();
            const organisationToKeep: Organisation<true> = DoFactory.createOrganisation(true, { kennung: 'K1' });
            const organisationToRemove: Organisation<true> = DoFactory.createOrganisation(true, { kennung: 'K2' });

            const kontextToKeep: PersonenkontextEventKontextData = {
                id: 'pk1',
                rolleId: 'r1',
                rolle: RollenArt.LERN,
                orgaId: organisationToKeep.id,
                orgaKennung: 'K1',
                isItslearningOrga: false,
                serviceProviderExternalSystems: [ServiceProviderSystem.EMAIL],
            };
            const kontextToRemove: PersonenkontextEventKontextData = {
                id: 'pk2',
                rolleId: 'r2',
                rolle: RollenArt.LERN,
                orgaId: organisationToRemove.id,
                orgaKennung: 'K2',
                isItslearningOrga: false,
                serviceProviderExternalSystems: [ServiceProviderSystem.EMAIL],
            };

            const mockEvent: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: spshPersonId,
                    vorname: 'Max',
                    familienname: 'Mustermann',
                    username: 'testuser',
                },
                [],
                [kontextToRemove],
                [kontextToKeep, kontextToRemove],
            );

            const mockRolle: Rolle<true> = createRolleWithServiceProvider({
                rolleId: 'r1',
                serviceProviderId: mockServiceProviderId,
                externalSystem: ServiceProviderSystem.EMAIL,
            });

            rolleRepoMock.findByIds.mockResolvedValue(new Map([['r1', mockRolle]]));
            orgaRepoMock.findByIds.mockResolvedValueOnce(
                new Map([
                    [organisationToKeep.id, organisationToKeep],
                    [organisationToRemove.id, organisationToRemove],
                ]),
            );
            userLockRepoMock.findByPersonId.mockResolvedValueOnce([]);

            await sut.handlePersonenkontextUpdatedEvent(mockEvent);

            expect(orgaRepoMock.findByIds).toHaveBeenCalledWith([organisationToKeep.id]);
            expect(emailResolverServiceMock.setEmailForSpshPerson).toHaveBeenCalledWith(
                expect.objectContaining({
                    organisationen: [organisationToKeep],
                }),
            );
        });

        it('should only include organisationen for kontexte with a rolle in rollenMap', async () => {
            const mockServiceProviderId: string = faker.string.uuid();
            const spshPersonId: string = faker.string.uuid();
            const organisationWithoutRolle: Organisation<true> = DoFactory.createOrganisation(true, { kennung: 'K1' });
            const mockOrganisation: Organisation<true> = DoFactory.createOrganisation(true, { kennung: 'K2' });
            const params: SetEmailParams = {
                spshUsername: faker.internet.username(),
                organisationen: [mockOrganisation],
                firstName: faker.person.firstName(),
                lastName: faker.person.lastName(),
                spshServiceProviderId: mockServiceProviderId,
                gesperrt: false,
            };

            const mockEvent: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: spshPersonId,
                    vorname: params.firstName,
                    familienname: params.lastName,
                    username: params.spshUsername,
                },
                [],
                [],
                [
                    {
                        id: 'pk1',
                        rolleId: 'r1',
                        rolle: RollenArt.LERN,
                        orgaId: organisationWithoutRolle.id,
                        orgaKennung: 'K1',
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [ServiceProviderSystem.EMAIL],
                    },
                    {
                        id: 'pk2',
                        rolleId: 'r2',
                        rolle: RollenArt.LERN,
                        orgaId: mockOrganisation.id,
                        orgaKennung: 'K2',
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [ServiceProviderSystem.EMAIL],
                    },
                ],
            );

            const mockRolle: Rolle<true> = createRolleWithServiceProvider({
                rolleId: 'r2',
                serviceProviderId: mockServiceProviderId,
                externalSystem: ServiceProviderSystem.EMAIL,
            });

            rolleRepoMock.findByIds.mockResolvedValue(new Map([['r2', mockRolle]]));
            orgaRepoMock.findByIds.mockResolvedValueOnce(
                new Map([
                    [organisationWithoutRolle.id, organisationWithoutRolle],
                    [mockOrganisation.id, mockOrganisation],
                ]),
            );
            userLockRepoMock.findByPersonId.mockResolvedValueOnce([]);

            await sut.handlePersonenkontextUpdatedEvent(mockEvent);

            expect(emailResolverServiceMock.setEmailForSpshPerson).toHaveBeenCalledWith({
                spshPersonId: spshPersonId,
                ...params,
            });
        });

        it('should filter out kontexte whose organisation is missing from orgaMap', async () => {
            const mockServiceProviderId: string = faker.string.uuid();
            const spshPersonId: string = faker.string.uuid();

            const mockEvent: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: spshPersonId,
                    vorname: 'Max',
                    familienname: 'Mustermann',
                    username: 'testuser',
                },
                [],
                [],
                [
                    {
                        id: 'pk1',
                        rolleId: 'r1',
                        rolle: RollenArt.LERN,
                        orgaId: faker.string.uuid(),
                        orgaKennung: undefined,
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [ServiceProviderSystem.EMAIL],
                    },
                ],
            );

            const mockRolle: Rolle<true> = createRolleWithServiceProvider({
                rolleId: 'r1',
                serviceProviderId: mockServiceProviderId,
                externalSystem: ServiceProviderSystem.EMAIL,
            });

            rolleRepoMock.findByIds.mockResolvedValue(new Map([['r1', mockRolle]]));
            orgaRepoMock.findByIds.mockResolvedValueOnce(new Map());
            userLockRepoMock.findByPersonId.mockResolvedValueOnce([]);

            await sut.handlePersonenkontextUpdatedEvent(mockEvent);

            expect(emailResolverServiceMock.setEmailForSpshPerson).toHaveBeenCalledWith(
                expect.objectContaining({
                    organisationen: [],
                }),
            );
        });
    });

    describe('handlePersonRenamedEvent', () => {
        it('should log and call emailResolverService', async () => {
            const kennung: string = faker.string.numeric(7);
            const mockOrganisation: Organisation<true> = DoFactory.createOrganisation(true, { kennung });
            const spshServiceProviderId: string = faker.string.uuid();
            const mockEvent: PersonRenamedEvent = createPersonRenamedEvent({
                personId: faker.string.uuid(),
                vorname: faker.person.firstName(),
                familienname: faker.person.lastName(),
                username: faker.internet.username(),
            });
            const mockRolle: Rolle<true> = createRolleWithServiceProvider({
                serviceProviderId: spshServiceProviderId,
                externalSystem: ServiceProviderSystem.EMAIL,
            });
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                {
                    personenkontext: DoFactory.createPersonenkontext(true),
                    organisation: mockOrganisation,
                    rolle: mockRolle,
                },
            ]);
            rolleRepoMock.findByIds.mockResolvedValue(new Map([[mockRolle.id, mockRolle]]));
            orgaRepoMock.findByIds.mockResolvedValueOnce(new Map([[mockOrganisation.id, mockOrganisation]]));
            userLockRepoMock.findByPersonId.mockResolvedValueOnce([]);

            await sut.handlePersonRenamedEvent(mockEvent);

            expect(orgaRepoMock.findByIds).toHaveBeenCalledWith([mockOrganisation.id]);
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('Received PersonRenamedEvent'));
            expect(emailResolverServiceMock.setEmailForSpshPerson).toHaveBeenCalledWith({
                spshPersonId: mockEvent.personId,
                spshUsername: mockEvent.username,
                organisationen: [mockOrganisation],
                gesperrt: false,
                firstName: mockEvent.vorname,
                lastName: mockEvent.familienname,
                spshServiceProviderId,
            });
        });

        it('should fail when username is undefined', async () => {
            const fakePersonId: string = faker.string.uuid();
            const mockEvent: PersonRenamedEvent = createPersonRenamedEvent({
                personId: fakePersonId,
                vorname: faker.person.firstName(),
                familienname: faker.person.lastName(),
                username: undefined,
            });

            await expect(sut.handlePersonRenamedEvent(mockEvent)).rejects.toEqual(
                new PersonHasNoUsernameError(fakePersonId),
            );

            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('Received PersonRenamedEvent'));
            expect(emailResolverServiceMock.setEmailForSpshPerson).not.toHaveBeenCalled();
        });

        it('should return early when no email service provider', async () => {
            const kennung: string = faker.string.numeric(7);
            const spshServiceProviderId: string = faker.string.uuid();
            const mockEvent: PersonRenamedEvent = createPersonRenamedEvent({
                personId: faker.string.uuid(),
                vorname: faker.person.firstName(),
                familienname: faker.person.lastName(),
                username: faker.internet.username(),
            });
            const mockRolle: Rolle<true> = createRolleWithServiceProvider({
                serviceProviderId: spshServiceProviderId,
                externalSystem: ServiceProviderSystem.NONE,
            });
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                {
                    personenkontext: DoFactory.createPersonenkontext(true),
                    organisation: DoFactory.createOrganisation(true, { kennung }),
                    rolle: mockRolle,
                },
            ]);
            rolleRepoMock.findByIds.mockResolvedValue(new Map([[mockRolle.id, mockRolle]]));
            orgaRepoMock.findByIds.mockResolvedValueOnce(new Map());
            userLockRepoMock.findByPersonId.mockResolvedValueOnce([]);

            await sut.handlePersonRenamedEvent(mockEvent);

            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('Received PersonRenamedEvent'));
            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining(`No email service provider found for personId:${mockEvent.personId}`),
            );
            expect(emailResolverServiceMock.setEmailForSpshPerson).not.toHaveBeenCalled();
        });
    });

    describe('handlePersonDeletedEvent', () => {
        it('should log and call emailResolverService.deleteEmailsForSpshPerson', async () => {
            const personId: string = faker.string.uuid();
            const username: string = faker.internet.username();
            const event: PersonDeletedEvent = new PersonDeletedEvent(personId, username);

            await sut.handlePersonDeletedEvent(event);

            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining(
                    `Received PersonenkontextDeletedEvent, personId:${personId}, username:${username}`,
                ),
            );
            expect(emailResolverServiceMock.deleteEmailsForSpshPerson).toHaveBeenCalledWith({ spshPersonId: personId });
        });
    });

    describe('handleOrganisationDeletedEvent', () => {
        it('should log and return early when organisation is not a school', async () => {
            const organisationId: string = faker.string.uuid();
            const event: OrganisationDeletedEvent = new OrganisationDeletedEvent(
                organisationId,
                faker.company.name(),
                faker.string.numeric(7),
                OrganisationsTyp.LAND,
            );

            await sut.handleOrganisationDeletedEvent(event);

            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining(
                    `Ignoring Event for organisationId:${organisationId} because it is not a school`,
                ),
            );
            expect(emailResolverServiceMock.deleteSchool).not.toHaveBeenCalled();
        });

        it('should call deleteSchool when organisation is a school', async () => {
            const organisationId: string = faker.string.uuid();
            const event: OrganisationDeletedEvent = new OrganisationDeletedEvent(
                organisationId,
                faker.company.name(),
                faker.string.numeric(7),
                OrganisationsTyp.SCHULE,
            );

            await sut.handleOrganisationDeletedEvent(event);

            expect(emailResolverServiceMock.deleteSchool).toHaveBeenCalledWith({ organisationId });
        });
    });

    describe('handleSchuleUpdatedEvent', () => {
        it('should log and return early when newName is not provided', async () => {
            const organisationId: string = faker.string.uuid();
            const event: SchuleUpdatedEvent = createSchuleUpdatedEvent({
                organisationId,
                name: '',
                oldName: faker.word.noun(),
            });

            await sut.handleSchuleUpdatedEvent(event);

            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining(
                    `Ignoring Event for organisationId:${organisationId} because name is not provided`,
                ),
            );
            expect(emailResolverServiceMock.updateSchoolName).not.toHaveBeenCalled();
        });

        it('should log and return early when newName is the same as oldName', async () => {
            const organisationId: string = faker.string.uuid();
            const name: string = faker.company.name();
            const event: SchuleUpdatedEvent = createSchuleUpdatedEvent({
                organisationId,
                name,
                oldName: name,
            });

            await sut.handleSchuleUpdatedEvent(event);

            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining(
                    `Ignoring Event for organisationId:${organisationId} because name is the same as oldName`,
                ),
            );
            expect(emailResolverServiceMock.updateSchoolName).not.toHaveBeenCalled();
        });

        it('should call updateSchoolName when name changed', async () => {
            const organisationId: string = faker.string.uuid();
            const newName: string = faker.company.name();
            const event: SchuleUpdatedEvent = createSchuleUpdatedEvent({
                organisationId,
                name: newName,
                oldName: faker.word.noun(),
            });

            await sut.handleSchuleUpdatedEvent(event);

            expect(emailResolverServiceMock.updateSchoolName).toHaveBeenCalledWith({
                organisationId,
                newName,
            });
        });
    });

    describe('handlePersonExternalSystemsSyncEvent', () => {
        it('should log and call setEmailForSpshPerson when provider exists', async () => {
            const personId: string = faker.string.uuid();
            const username: string = faker.internet.username();
            const firstName: string = faker.person.firstName();
            const lastName: string = faker.person.lastName();
            const serviceProviderId: string = faker.string.uuid();
            const kennung: string = faker.string.numeric(7);

            const event: PersonExternalSystemsSyncEvent = new PersonExternalSystemsSyncEvent(personId);
            const mockOrganisation: Organisation<true> = DoFactory.createOrganisation(true, { kennung });

            const mockPerson: Person<true> = DoFactory.createPerson(true, {
                id: personId,
                username,
                vorname: firstName,
                familienname: lastName,
            });
            const mockRolle: Rolle<true> = createRolleWithServiceProvider({
                serviceProviderId,
                externalSystem: ServiceProviderSystem.EMAIL,
            });
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                {
                    personenkontext: DoFactory.createPersonenkontext(true),
                    organisation: mockOrganisation,
                    rolle: mockRolle,
                },
            ]);
            rolleRepoMock.findByIds.mockResolvedValue(new Map([[mockRolle.id, mockRolle]]));
            orgaRepoMock.findByIds.mockResolvedValueOnce(new Map([[mockOrganisation.id, mockOrganisation]]));
            userLockRepoMock.findByPersonId.mockResolvedValueOnce([]);
            personRepositoryMock.findById.mockResolvedValue(mockPerson);

            await sut.handlePersonExternalSystemsSyncEvent(event);

            expect(orgaRepoMock.findByIds).toHaveBeenCalledWith([mockOrganisation.id]);
            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining('Received PersonExternalSystemsSyncEvent'),
            );
            expect(emailResolverServiceMock.setEmailForSpshPerson).toHaveBeenCalledWith({
                spshPersonId: personId,
                spshUsername: username,
                organisationen: [mockOrganisation],
                gesperrt: false,
                firstName,
                lastName,
                spshServiceProviderId: serviceProviderId,
            });
        });

        it('should log and return if person not found', async () => {
            const personId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();
            const event: PersonExternalSystemsSyncEvent = new PersonExternalSystemsSyncEvent(personId);
            const mockRolle: Rolle<true> = createRolleWithServiceProvider({
                serviceProviderId,
                externalSystem: ServiceProviderSystem.EMAIL,
            });
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                {
                    personenkontext: DoFactory.createPersonenkontext(true),
                    organisation: DoFactory.createOrganisation(true),
                    rolle: mockRolle,
                },
            ]);
            rolleRepoMock.findByIds.mockResolvedValue(new Map([[faker.string.uuid(), mockRolle]]));
            orgaRepoMock.findByIds.mockResolvedValueOnce(new Map());
            userLockRepoMock.findByPersonId.mockResolvedValueOnce([]);
            personRepositoryMock.findById.mockResolvedValue(undefined);

            await sut.handlePersonExternalSystemsSyncEvent(event);

            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    `Person with id:${personId} not found. Therefor aborting setEmailForSpshPerson`,
                ),
            );
            expect(emailResolverServiceMock.setEmailForSpshPerson).not.toHaveBeenCalled();
        });

        it('should log and return if person has no username', async () => {
            const personId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();
            const event: PersonExternalSystemsSyncEvent = new PersonExternalSystemsSyncEvent(personId);
            const mockPerson: Person<true> = DoFactory.createPerson(true);
            mockPerson.username = undefined;
            const mockRolle: Rolle<true> = createRolleWithServiceProvider({
                serviceProviderId,
                externalSystem: ServiceProviderSystem.EMAIL,
            });
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                {
                    personenkontext: DoFactory.createPersonenkontext(true),
                    organisation: DoFactory.createOrganisation(true),
                    rolle: mockRolle,
                },
            ]);
            rolleRepoMock.findByIds.mockResolvedValue(new Map([[faker.string.uuid(), mockRolle]]));
            orgaRepoMock.findByIds.mockResolvedValueOnce(new Map());
            userLockRepoMock.findByPersonId.mockResolvedValueOnce([]);
            personRepositoryMock.findById.mockResolvedValue(mockPerson);

            await sut.handlePersonExternalSystemsSyncEvent(event);

            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    `Person with id:${personId} found, but has no username. Therefor aborting setEmailForSpshPerson`,
                ),
            );
            expect(emailResolverServiceMock.setEmailForSpshPerson).not.toHaveBeenCalled();
        });

        it('should call setEmailsSuspendedForSpshPerson if no email service provider found', async () => {
            const personId: string = faker.string.uuid();
            const event: PersonExternalSystemsSyncEvent = new PersonExternalSystemsSyncEvent(personId);
            const mockPerson: Person<true> = DoFactory.createPerson(true);
            const mockRolle: Rolle<true> = createRolleWithServiceProvider({
                externalSystem: ServiceProviderSystem.NONE,
            });
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                {
                    personenkontext: DoFactory.createPersonenkontext(true),
                    organisation: DoFactory.createOrganisation(true),
                    rolle: mockRolle,
                },
            ]);
            rolleRepoMock.findByIds.mockResolvedValue(new Map([[faker.string.uuid(), mockRolle]]));
            orgaRepoMock.findByIds.mockResolvedValueOnce(new Map());
            userLockRepoMock.findByPersonId.mockResolvedValueOnce([]);
            personRepositoryMock.findById.mockResolvedValue(mockPerson);

            await sut.handlePersonExternalSystemsSyncEvent(event);

            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining('No email service provider found for personId:'),
            );
            expect(emailResolverServiceMock.setEmailsSuspendedForSpshPerson).toHaveBeenCalledWith({
                spshPersonId: personId,
                gesperrt: false,
            });
        });
    });

    describe('handleLocksForPersonChangedEvent', () => {
        it('should call setEmailsSuspendedForSpshPerson when no provider exists', async () => {
            const personId: string = faker.string.uuid();
            const event: LocksForPersonChangedEvent = new LocksForPersonChangedEvent(personId, [], []);
            const mockRolle: Rolle<true> = createRolleWithServiceProvider({
                externalSystem: ServiceProviderSystem.NONE,
            });
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                {
                    personenkontext: DoFactory.createPersonenkontext(true),
                    organisation: DoFactory.createOrganisation(true),
                    rolle: mockRolle,
                },
            ]);
            rolleRepoMock.findByIds.mockResolvedValue(new Map([[mockRolle.id, mockRolle]]));
            userLockRepoMock.findByPersonId.mockResolvedValueOnce([]);

            await sut.handleLocksForPersonChangedEvent(event);

            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining('Received LocksForPersonChangedEvent'),
            );
            expect(emailResolverServiceMock.setEmailsSuspendedForSpshPerson).toHaveBeenCalledWith({
                spshPersonId: personId,
                gesperrt: false,
            });
        });
    });
});
