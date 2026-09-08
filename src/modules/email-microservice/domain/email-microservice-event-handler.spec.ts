import { faker } from '@faker-js/faker';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    DoFactory,
    EventSystemTestModule,
} from '../../../../test/utils/index.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { PersonenkontextUpdatedEvent } from '../../../shared/events/personenkontext-updated.event.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { ServiceProviderSystem } from '../../service-provider/domain/service-provider.enum.js';
import { EmailMicroserviceModule } from '../email-microservice.module.js';
import { EmailMicroserviceEventHandler } from './email-microservice-event-handler.js';
import { EmailResolverService } from './email-resolver.service.js';
import { SetEmailAddressForSpshPersonBodyParams } from '../../../email/modules/core/api/dtos/params/set-email-address-for-spsh-person.bodyparams.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { PersonRenamedEvent } from '../../../shared/events/person-renamed-event.js';
import { EventModule } from '../../../core/eventbus/index.js';
import { PersonDeletedEvent } from '../../../shared/events/person-deleted.event.js';
import { PersonenkontextEventKontextData } from '../../../shared/events/personenkontext-event.types.js';
import { PersonExternalSystemsSyncEvent } from '../../../shared/events/person-external-systems-sync.event.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { Person } from '../../person/domain/person.js';
import { CommonTestModule } from '../../../../test/utils/common-test.module.js';

describe('EmailMicroserviceEventHandler', () => {
    let app: INestApplication;
    let module: TestingModule;

    let sut: EmailMicroserviceEventHandler;
    let loggerMock: DeepMocked<ClassLogger>;
    let emailResolverServiceMock: DeepMocked<EmailResolverService>;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let personRepositoryMock: DeepMocked<PersonRepository>;

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
            .overrideProvider(RolleRepo)
            .useValue(createMock(RolleRepo))
            .overrideProvider(DBiamPersonenkontextRepo)
            .useValue(createMock<DBiamPersonenkontextRepo>(DBiamPersonenkontextRepo))
            .overrideProvider(PersonRepository)
            .useValue(createMock<PersonRepository>(PersonRepository))
            .compile();

        sut = module.get(EmailMicroserviceEventHandler);
        loggerMock = module.get(ClassLogger);
        emailResolverServiceMock = module.get(EmailResolverService);
        rolleRepoMock = module.get(RolleRepo);
        personenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        personRepositoryMock = module.get(PersonRepository);

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
        it('should log and call emailResolverService when microservice is enabled', async () => {
            const mockServiceProviderId: string = faker.string.uuid();
            const spshPersonId: string = faker.string.uuid();
            const params: SetEmailAddressForSpshPersonBodyParams = {
                spshUsername: faker.internet.username(),
                kennungen: ['0706054'],
                firstName: faker.person.firstName(),
                lastName: faker.person.lastName(),
                spshServiceProviderId: mockServiceProviderId,
            } satisfies SetEmailAddressForSpshPersonBodyParams;
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
                        orgaId: faker.string.uuid(),
                        orgaKennung: '0706054',
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [ServiceProviderSystem.EMAIL],
                    },
                ],
            );
            const mockRolle: Rolle<true> = DoFactory.createRolle(true, {
                id: faker.string.uuid(),
                serviceProviderData: [
                    DoFactory.createServiceProvider(true, {
                        id: mockServiceProviderId,
                        externalSystem: ServiceProviderSystem.EMAIL,
                    }),
                ],
            });
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(true);

            rolleRepoMock.findByIds.mockResolvedValue(new Map([['r1', mockRolle]]));

            await sut.handlePersonenkontextUpdatedEvent(mockEvent);
            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining('Received PersonenkontextUpdatedEvent'),
            );
            expect(emailResolverServiceMock.setEmailForSpshPerson).toHaveBeenCalledWith({
                spshPersonId: spshPersonId,
                ...params,
            });
        });

        it('should log and call emailResolverService when microservice is enabled and username is undefined (not in praxis)', async () => {
            const mockServiceProviderId: string = faker.string.uuid();
            const spshPersonId: string = faker.string.uuid();
            const params: SetEmailAddressForSpshPersonBodyParams = {
                spshUsername: '',
                kennungen: ['0706054'],
                firstName: faker.person.firstName(),
                lastName: faker.person.lastName(),
                spshServiceProviderId: mockServiceProviderId,
            } satisfies SetEmailAddressForSpshPersonBodyParams;
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
            const mockRolle: Rolle<true> = DoFactory.createRolle(true, {
                id: faker.string.uuid(),
                serviceProviderData: [
                    DoFactory.createServiceProvider(true, {
                        id: mockServiceProviderId,
                        externalSystem: ServiceProviderSystem.EMAIL,
                    }),
                ],
            });
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(true);

            rolleRepoMock.findByIds.mockResolvedValue(new Map([['r1', mockRolle]]));

            await expect(sut.handlePersonenkontextUpdatedEvent(mockEvent)).rejects.toThrow(
                `Person with id:${spshPersonId} has no username, cannot resolve email.`,
            );
            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining('Received PersonenkontextUpdatedEvent'),
            );
            expect(emailResolverServiceMock.setEmailForSpshPerson).not.toHaveBeenCalled();
        });

        it('should not call emailResolverService when microservice is disabled', async () => {
            const mockEvent: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
                {
                    id: faker.string.uuid(),
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                    username: faker.internet.username(),
                },
                [{} as PersonenkontextEventKontextData, {} as PersonenkontextEventKontextData],
                [{} as PersonenkontextEventKontextData],
                [{} as PersonenkontextEventKontextData],
            );
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(false);

            await sut.handlePersonenkontextUpdatedEvent(mockEvent);
            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining('Received PersonenkontextUpdatedEvent'),
            );
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('Ignoring Event for'));
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
            const mockRolle: Rolle<true> = DoFactory.createRolle(true, {
                id: mockRolleId,
                serviceProviderData: [
                    DoFactory.createServiceProvider(true, {
                        id: faker.string.uuid(),
                        externalSystem: ServiceProviderSystem.NONE,
                    }),
                ],
            });

            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(true);

            rolleRepoMock.findByIds.mockResolvedValue(new Map([[mockRolleId, mockRolle]]));

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
                        orgaId: faker.string.uuid(),
                        orgaKennung: '0706054',
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [],
                    },
                ],
            );
            const mockRolle: Rolle<true> = DoFactory.createRolle(true, {
                id: faker.string.uuid(),
                serviceProviderData: [
                    DoFactory.createServiceProvider(true, {
                        id: mockServiceProviderId,
                        externalSystem: ServiceProviderSystem.EMAIL,
                    }),
                ],
            });

            rolleRepoMock.findByIds.mockResolvedValue(new Map([['r1', mockRolle]]));

            vi.spyOn(emailResolverServiceMock, 'setEmailForSpshPerson').mockResolvedValue();

            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);

            await sut.handlePersonenkontextUpdatedEvent(mockEvent);
            expect(emailResolverServiceMock.setEmailForSpshPerson).toHaveBeenCalledWith({
                spshPersonId: mockPersonId,
                spshUsername: 'testuser',
                kennungen: ['0706054'],
                firstName: 'Max',
                lastName: 'Mustermann',
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
            const mockRolle1: Rolle<true> = DoFactory.createRolle(true, {
                id: rolleId1,
                serviceProviderData: [
                    DoFactory.createServiceProvider(true, {
                        id: mockServiceProviderId1,
                        externalSystem: ServiceProviderSystem.NONE,
                    }),
                ],
            });
            const mockRolle2: Rolle<true> = DoFactory.createRolle(true, {
                id: rolleId2,
                serviceProviderData: [
                    DoFactory.createServiceProvider(true, {
                        id: mockServiceProviderId2,
                        externalSystem: ServiceProviderSystem.EMAIL,
                    }),
                ],
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

            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);

            await sut.handlePersonenkontextUpdatedEvent(mockEvent);
            expect(emailResolverServiceMock.setEmailsSuspendedForSpshPerson).toHaveBeenCalledWith({
                spshPersonId: mockPersonId,
            });
        });

        it('should filter out kontexte whose id is in removedKontexte', async () => {
            const mockServiceProviderId: string = faker.string.uuid();
            const spshPersonId: string = faker.string.uuid();

            const kontextToKeep: PersonenkontextEventKontextData = {
                id: 'pk1',
                rolleId: 'r1',
                rolle: RollenArt.LERN,
                orgaId: faker.string.uuid(),
                orgaKennung: 'K1',
                isItslearningOrga: false,
                serviceProviderExternalSystems: [ServiceProviderSystem.EMAIL],
            };
            const kontextToRemove: PersonenkontextEventKontextData = {
                id: 'pk2',
                rolleId: 'r2',
                rolle: RollenArt.LERN,
                orgaId: faker.string.uuid(),
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

            const mockRolle: Rolle<true> = DoFactory.createRolle(true, {
                id: 'r1',
                serviceProviderData: [
                    DoFactory.createServiceProvider(true, {
                        id: mockServiceProviderId,
                        externalSystem: ServiceProviderSystem.EMAIL,
                    }),
                ],
            });

            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(true);
            rolleRepoMock.findByIds.mockResolvedValue(new Map([['r1', mockRolle]]));

            await sut.handlePersonenkontextUpdatedEvent(mockEvent);

            expect(emailResolverServiceMock.setEmailForSpshPerson).toHaveBeenCalledWith(
                expect.objectContaining({
                    kennungen: ['K1'],
                }),
            );
        });

        it('should only include kennungen for kontexte with a rolle in rollenMap', async () => {
            const mockServiceProviderId: string = faker.string.uuid();
            const spshPersonId: string = faker.string.uuid();
            const params: SetEmailAddressForSpshPersonBodyParams = {
                spshUsername: faker.internet.username(),
                kennungen: ['K2'],
                firstName: faker.person.firstName(),
                lastName: faker.person.lastName(),
                spshServiceProviderId: mockServiceProviderId,
            } satisfies SetEmailAddressForSpshPersonBodyParams;

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
                        orgaId: faker.string.uuid(),
                        orgaKennung: 'K1',
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [ServiceProviderSystem.EMAIL],
                    },
                    {
                        id: 'pk2',
                        rolleId: 'r2',
                        rolle: RollenArt.LERN,
                        orgaId: faker.string.uuid(),
                        orgaKennung: 'K2',
                        isItslearningOrga: false,
                        serviceProviderExternalSystems: [ServiceProviderSystem.EMAIL],
                    },
                ],
            );

            const mockRolle: Rolle<true> = DoFactory.createRolle(true, {
                id: 'r2',
                serviceProviderData: [
                    DoFactory.createServiceProvider(true, {
                        id: mockServiceProviderId,
                        externalSystem: ServiceProviderSystem.EMAIL,
                    }),
                ],
            });

            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(true);
            rolleRepoMock.findByIds.mockResolvedValue(new Map([['r2', mockRolle]]));

            await sut.handlePersonenkontextUpdatedEvent(mockEvent);

            expect(emailResolverServiceMock.setEmailForSpshPerson).toHaveBeenCalledWith({
                spshPersonId: spshPersonId,
                spshUsername: params.spshUsername,
                kennungen: ['K2'],
                firstName: params.firstName,
                lastName: params.lastName,
                spshServiceProviderId: mockServiceProviderId,
            });
        });

        it('should filter out kontexte with undefined orgaKennung', async () => {
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

            const mockRolle: Rolle<true> = DoFactory.createRolle(true, {
                id: 'r1',
                serviceProviderData: [
                    DoFactory.createServiceProvider(true, {
                        id: mockServiceProviderId,
                        externalSystem: ServiceProviderSystem.EMAIL,
                    }),
                ],
            });

            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(true);
            rolleRepoMock.findByIds.mockResolvedValue(new Map([['r1', mockRolle]]));

            await sut.handlePersonenkontextUpdatedEvent(mockEvent);

            expect(emailResolverServiceMock.setEmailForSpshPerson).toHaveBeenCalledWith(
                expect.objectContaining({
                    kennungen: [],
                }),
            );
        });
    });

    describe('handlePersonRenamedEvent', () => {
        it('should log and call emailResolverService when microservice is enabled', async () => {
            const kennung: string = faker.string.numeric(7);
            const spshServiceProviderId: string = faker.string.uuid();
            const mockEvent: PersonRenamedEvent = new PersonRenamedEvent(
                faker.string.uuid(),
                faker.person.firstName(),
                faker.person.lastName(),
                faker.internet.username(),
                faker.person.firstName(),
                faker.person.lastName(),
                faker.internet.username(),
            );
            const mockRolle: Rolle<true> = DoFactory.createRolle(true, {
                serviceProviderData: [
                    DoFactory.createServiceProvider(true, {
                        id: spshServiceProviderId,
                        externalSystem: ServiceProviderSystem.EMAIL,
                    }),
                ],
            });
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                {
                    personenkontext: DoFactory.createPersonenkontext(true),
                    organisation: DoFactory.createOrganisation(true, { kennung }),
                    rolle: mockRolle,
                },
            ]);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(true);
            rolleRepoMock.findByIds.mockResolvedValue(new Map([[mockRolle.id, mockRolle]]));

            await sut.handlePersonRenamedEvent(mockEvent);

            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('Received PersonRenamedEvent'));
            expect(emailResolverServiceMock.setEmailForSpshPerson).toHaveBeenCalledWith({
                spshPersonId: mockEvent.personId,
                spshUsername: mockEvent.username,
                kennungen: [kennung],
                firstName: mockEvent.vorname,
                lastName: mockEvent.familienname,
                spshServiceProviderId,
            });
        });

        it('should not call when disabled', async () => {
            const mockEvent: PersonRenamedEvent = new PersonRenamedEvent(
                faker.string.uuid(),
                faker.person.firstName(),
                faker.person.lastName(),
                faker.internet.username(),
                faker.person.firstName(),
                faker.person.lastName(),
                faker.internet.username(),
            );
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(false);

            await sut.handlePersonRenamedEvent(mockEvent);

            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('Received PersonRenamedEvent'));
            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('Ignoring Event for'));
            expect(emailResolverServiceMock.setEmailForSpshPerson).not.toHaveBeenCalled();
        });

        it('should fail when microservice is enabled and username is undefined', async () => {
            const mockEvent: PersonRenamedEvent = new PersonRenamedEvent(
                faker.string.uuid(),
                faker.person.firstName(),
                faker.person.lastName(),
                undefined, // username
                faker.person.firstName(),
                faker.person.lastName(),
                faker.internet.username(),
            );
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(true);

            await expect(sut.handlePersonRenamedEvent(mockEvent)).rejects.toEqual(
                new Error(`Person with id:${mockEvent.personId} has no username, cannot resolve email.`),
            );

            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('Received PersonRenamedEvent'));
            expect(emailResolverServiceMock.setEmailForSpshPerson).not.toHaveBeenCalled();
        });

        it('should return early when no email service provider', async () => {
            const kennung: string = faker.string.numeric(7);
            const spshServiceProviderId: string = faker.string.uuid();
            const mockEvent: PersonRenamedEvent = new PersonRenamedEvent(
                faker.string.uuid(),
                faker.person.firstName(),
                faker.person.lastName(),
                faker.internet.username(),
                faker.person.firstName(),
                faker.person.lastName(),
                faker.internet.username(),
            );
            const mockRolle: Rolle<true> = DoFactory.createRolle(true, {
                serviceProviderData: [
                    DoFactory.createServiceProvider(true, {
                        id: spshServiceProviderId,
                        externalSystem: ServiceProviderSystem.NONE,
                    }),
                ],
            });
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                {
                    personenkontext: DoFactory.createPersonenkontext(true),
                    organisation: DoFactory.createOrganisation(true, { kennung }),
                    rolle: mockRolle,
                },
            ]);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(true);
            rolleRepoMock.findByIds.mockResolvedValue(new Map([[mockRolle.id, mockRolle]]));

            await sut.handlePersonRenamedEvent(mockEvent);

            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('Received PersonRenamedEvent'));
            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining(`No email service provider found for personId:${mockEvent.personId}`),
            );
            expect(emailResolverServiceMock.setEmailForSpshPerson).not.toHaveBeenCalled();
        });
    });

    describe('handlePersonDeletedEvent', () => {
        it('should log and call emailResolverService.deleteEmailsForSpshPerson when microservice is enabled', async () => {
            const personId: string = faker.string.uuid();
            const username: string = faker.internet.username();
            const event: PersonDeletedEvent = new PersonDeletedEvent(personId, username);

            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(true);

            await sut.handlePersonDeletedEvent(event);

            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining(
                    `Received PersonenkontextDeletedEvent, personId:${personId}, username:${username}`,
                ),
            );
            expect(emailResolverServiceMock.deleteEmailsForSpshPerson).toHaveBeenCalledWith({ spshPersonId: personId });
        });

        it('should log and return early when microservice is disabled', async () => {
            const personId: string = faker.string.uuid();
            const username: string = faker.internet.username();
            const event: PersonDeletedEvent = new PersonDeletedEvent(personId, username);

            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(false);

            await sut.handlePersonDeletedEvent(event);

            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining(
                    `Received PersonenkontextDeletedEvent, personId:${personId}, username:${username}`,
                ),
            );
            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining(
                    `Ignoring Event for personId:${personId} because email microservice is disabled`,
                ),
            );
            expect(emailResolverServiceMock.deleteEmailsForSpshPerson).not.toHaveBeenCalled();
        });
    });

    describe('handlePersonExternalSystemsSyncEvent', () => {
        it('should log and return if microservice is disabled', async () => {
            const personId: string = faker.string.uuid();
            const event: PersonExternalSystemsSyncEvent = new PersonExternalSystemsSyncEvent(personId);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);

            await sut.handlePersonExternalSystemsSyncEvent(event);

            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('Ignoring Event for personId:'));
            expect(emailResolverServiceMock.setEmailForSpshPerson).not.toHaveBeenCalled();
            expect(emailResolverServiceMock.deleteEmailsForSpshPerson).not.toHaveBeenCalled();
        });

        it('should log and call setEmailForSpshPerson when microservice is enabled and provider exists', async () => {
            const personId: string = faker.string.uuid();
            const username: string = faker.internet.username();
            const firstName: string = faker.person.firstName();
            const lastName: string = faker.person.lastName();
            const serviceProviderId: string = faker.string.uuid();
            const kennung: string = faker.string.numeric(7);

            const event: PersonExternalSystemsSyncEvent = new PersonExternalSystemsSyncEvent(personId);

            const mockPerson: Person<true> = DoFactory.createPerson(true, {
                id: personId,
                username,
                vorname: firstName,
                familienname: lastName,
            });
            const mockRolle: Rolle<true> = DoFactory.createRolle(true, {
                serviceProviderData: [
                    DoFactory.createServiceProvider(true, {
                        id: serviceProviderId,
                        externalSystem: ServiceProviderSystem.EMAIL,
                    }),
                ],
            });
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                {
                    personenkontext: DoFactory.createPersonenkontext(true),
                    organisation: DoFactory.createOrganisation(true, { kennung: kennung }),
                    rolle: mockRolle,
                },
            ]);
            rolleRepoMock.findByIds.mockResolvedValue(new Map([[mockRolle.id, mockRolle]]));
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);
            personRepositoryMock.findById.mockResolvedValue(mockPerson);

            await sut.handlePersonExternalSystemsSyncEvent(event);

            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining('Received PersonExternalSystemsSyncEvent'),
            );
            expect(emailResolverServiceMock.setEmailForSpshPerson).toHaveBeenCalledWith({
                spshPersonId: personId,
                spshUsername: username,
                kennungen: [kennung],
                firstName,
                lastName,
                spshServiceProviderId: serviceProviderId,
            });
        });

        it('should log and return if person not found', async () => {
            const personId: string = faker.string.uuid();
            const serviceProviderId: string = faker.string.uuid();
            const event: PersonExternalSystemsSyncEvent = new PersonExternalSystemsSyncEvent(personId);
            const mockRolle: Rolle<true> = DoFactory.createRolle(true, {
                serviceProviderData: [
                    DoFactory.createServiceProvider(true, {
                        id: serviceProviderId,
                        externalSystem: ServiceProviderSystem.EMAIL,
                    }),
                ],
            });
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                {
                    personenkontext: DoFactory.createPersonenkontext(true),
                    organisation: DoFactory.createOrganisation(true),
                    rolle: mockRolle,
                },
            ]);
            rolleRepoMock.findByIds.mockResolvedValue(new Map([[faker.string.uuid(), mockRolle]]));
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);
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
            const mockRolle: Rolle<true> = DoFactory.createRolle(true, {
                serviceProviderData: [
                    DoFactory.createServiceProvider(true, {
                        id: serviceProviderId,
                        externalSystem: ServiceProviderSystem.EMAIL,
                    }),
                ],
            });
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                {
                    personenkontext: DoFactory.createPersonenkontext(true),
                    organisation: DoFactory.createOrganisation(true),
                    rolle: mockRolle,
                },
            ]);
            rolleRepoMock.findByIds.mockResolvedValue(new Map([[faker.string.uuid(), mockRolle]]));
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);
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
            const mockRolle: Rolle<true> = DoFactory.createRolle(true, {
                serviceProviderData: [
                    DoFactory.createServiceProvider(true, {
                        externalSystem: ServiceProviderSystem.NONE,
                    }),
                ],
            });
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                {
                    personenkontext: DoFactory.createPersonenkontext(true),
                    organisation: DoFactory.createOrganisation(true),
                    rolle: mockRolle,
                },
            ]);
            rolleRepoMock.findByIds.mockResolvedValue(new Map([[faker.string.uuid(), mockRolle]]));
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);
            personRepositoryMock.findById.mockResolvedValue(mockPerson);

            await sut.handlePersonExternalSystemsSyncEvent(event);

            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining('No email service provider found for personId:'),
            );
            expect(emailResolverServiceMock.setEmailsSuspendedForSpshPerson).toHaveBeenCalledWith({
                spshPersonId: personId,
            });
        });
    });
});
