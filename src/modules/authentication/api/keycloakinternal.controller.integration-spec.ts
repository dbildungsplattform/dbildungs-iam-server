import { faker } from '@faker-js/faker';
import { Test, TestingModule } from '@nestjs/testing';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';

import { MikroORM } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { APP_FILTER } from '@nestjs/core';
import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { DatabaseTestModule, DoFactory } from '../../../../test/utils/index.js';
import { createAndPersistServiceProvider } from '../../../../test/utils/service-provider-test-helper.js';
import { EmailAddressResponse } from '../../../email/modules/core/api/dtos/response/email-address.response.js';
import { EmailAddressStatusEnum } from '../../../email/modules/core/persistence/email-address-status.entity.js';
import { ExternalDataCacheInterceptor } from '../../../shared/cache/external-data-cache-interceptor.js';
import { EntityNotFoundError, MultipleRollenartenError } from '../../../shared/error/index.js';
import { UserExternalDataWorkflowError } from '../../../shared/error/user-externaldata-workflow.error.js';
import { SharedExceptionFilter } from '../../../shared/filter/shared-exception-filter.js';
import { ValidationExceptionFilter } from '../../../shared/filter/validation-exception-filter.js';
import { Ok } from '../../../shared/util/result.js';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { EmailMicroserviceModule } from '../../email-microservice/email-microservice.module.js';
import { EmailPersistenceModule } from '../../email/email-persistence.module.js';
import { Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { PersonModule } from '../../person/person.module.js';
import { Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import {
    DBiamPersonenkontextRepo,
    ErweiterterServiceProviderForPK,
    ExternalPkData,
} from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { PersonenKontextModule } from '../../personenkontext/personenkontext.module.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { RolleModule } from '../../rolle/rolle.module.js';
import { ServiceProviderSystem } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderModule } from '../../service-provider/service-provider.module.js';
import { UserExternaldataWorkflowFactory } from '../domain/user-extenaldata.factory.js';
import {
    POLYTHEA_SERVICE_PROVIDER_ID,
    UserExternaldataWorkflowAggregate,
} from '../domain/user-extenaldata.workflow.js';
import { AuthenticationExceptionFilter } from './authentication-exception-filter.js';
import { UserExternalDataResponse } from './externaldata/user-externaldata.response.js';
import { KeycloakInternalController } from './keycloakinternal.controller.js';

describe('KeycloakInternalController', () => {
    let module: TestingModule;
    let keycloakinternalController: KeycloakInternalController;
    let dbiamPersonenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let personRepoMock: DeepMocked<PersonRepository>;
    let emailResolverServiceMock: DeepMocked<EmailResolverService>;
    let em: EntityManager;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                CommonTestModule,
                ServiceProviderModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                PersonModule,
                PersonenKontextModule,
                RolleModule,
                EmailPersistenceModule,
                EmailMicroserviceModule,
            ],
            providers: [
                KeycloakInternalController,
                UserExternaldataWorkflowFactory,
                ExternalDataCacheInterceptor,
                { provide: CACHE_MANAGER, useValue: { get: vi.fn(), set: vi.fn() } },
                { provide: APP_FILTER, useClass: ValidationExceptionFilter },
                { provide: APP_FILTER, useClass: AuthenticationExceptionFilter },
                { provide: APP_FILTER, useClass: SharedExceptionFilter },
            ],
        })
            .overrideProvider(PersonRepository)
            .useValue(createMock(PersonRepository))
            .overrideProvider(DBiamPersonenkontextRepo)
            .useValue(createMock(DBiamPersonenkontextRepo))
            .overrideProvider(EmailResolverService)
            .useValue(createMock(EmailResolverService))
            .overrideProvider(ExternalDataCacheInterceptor)
            .useValue(createMock(ExternalDataCacheInterceptor))
            .compile();

        await DatabaseTestModule.setupDatabase(module.get(MikroORM));
        em = module.get(EntityManager);

        keycloakinternalController = module.get(KeycloakInternalController);
        dbiamPersonenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        personRepoMock = module.get(PersonRepository);
        emailResolverServiceMock = module.get(EmailResolverService);
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    afterAll(async () => {
        await module.get(MikroORM).close();
        await module.close();
    });

    it('should be defined', () => {
        expect(keycloakinternalController).toBeDefined();
    });

    describe('externalData', () => {
        it('should return user external data old way', async () => {
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);
            const keycloakSub: string = faker.string.uuid();
            const person: Person<true> = Person.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.person.lastName(),
                faker.person.firstName(),
                '1',
                faker.lorem.word(),
                keycloakSub,
                faker.string.uuid(),
            );

            const pkExternalData: ExternalPkData[] = [
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: faker.lorem.word(),
                    serviceProvider: [
                        createMock<ServiceProvider<true>>(ServiceProvider<true>, {
                            vidisAngebotId: faker.string.uuid(),
                        }),
                    ],
                },
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: faker.lorem.word(),
                    serviceProvider: [
                        createMock<ServiceProvider<true>>(ServiceProvider<true>, {
                            vidisAngebotId: faker.string.uuid(),
                        }),
                    ],
                },
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: faker.lorem.word(),
                    serviceProvider: [
                        createMock<ServiceProvider<true>>(ServiceProvider<true>, {
                            externalSystem: ServiceProviderSystem.EMAIL,
                            vidisAngebotId: undefined,
                        }),
                    ],
                },
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: undefined, //To Be Filtered Out
                    serviceProvider: [],
                },
            ];
            const sp: ServiceProvider<true> = await createAndPersistServiceProvider(em);

            const pk: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                personId: person.id,
                rolleId: faker.string.uuid(),
                organisationId: faker.string.uuid(),
            });

            const personenKontextErweiterungen: ErweiterterServiceProviderForPK[] = [
                {
                    personenkontext: pk,
                    serviceProvider: sp,
                },
            ];

            personRepoMock.findByKeycloakUserId.mockResolvedValueOnce(person);
            personRepoMock.findById.mockResolvedValueOnce(person);
            dbiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(pkExternalData);
            dbiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce(personenKontextErweiterungen);

            const result: UserExternalDataResponse = await keycloakinternalController.getExternalData({
                sub: keycloakSub,
            });
            expect(result).toBeInstanceOf(UserExternalDataResponse);
            expect(result.ox?.id).toContain(`${person.username}@`);
            expect(result.itslearning.personId).toEqual(person.id);
            expect(result.vidis.personId).toEqual(person.id);
            expect(result.vidis.vorname).toEqual(person.vorname);
            expect(result.vidis.nachname).toEqual(person.familienname);
            expect(result.vidis.rollenart).toEqual(pkExternalData[0]?.rollenart);
            expect(result.vidis.dienststellenNummern.length).toEqual(2);
            expect(result.opsh.vorname).toEqual(person.vorname);
            expect(result.opsh.nachname).toEqual(person.familienname);
            expect(result.opsh.personenkontexte.length).toEqual(3);
            expect(result.onlineDateiablage.personId).toEqual(person.id);
            expect(result.iqshHelpdesk.vorname).toEqual(person.vorname);
            expect(result.iqshHelpdesk.nachname).toEqual(person.familienname);
            expect(result.polyteia.dienststellenNummern.length).toEqual(0);
            expect(result.polyteia.rollenart).toEqual(RollenArt.LEHR);
        });

        it('should omit ox response if user has no email', async () => {
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);
            const keycloakSub: string = faker.string.uuid();
            const person: Person<true> = Person.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.person.lastName(),
                faker.person.firstName(),
                '1',
                faker.lorem.word(),
                keycloakSub,
                faker.string.uuid(),
            );

            personRepoMock.findByKeycloakUserId.mockResolvedValueOnce(person);
            personRepoMock.findById.mockResolvedValueOnce(person);
            dbiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([]);
            dbiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);

            const result: UserExternalDataResponse = await keycloakinternalController.getExternalData({
                sub: keycloakSub,
            });

            expect(result).toBeInstanceOf(UserExternalDataResponse);
            expect(result.ox).toBeUndefined();
        });

        it('should return user external data new Microservice', async () => {
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);
            const keycloakSub: string = faker.string.uuid();
            const person: Person<true> = Person.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.person.lastName(),
                faker.person.firstName(),
                '1',
                faker.lorem.word(),
                keycloakSub,
                faker.string.uuid(),
            );

            const pkExternalData: ExternalPkData[] = [
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: faker.lorem.word(),
                    serviceProvider: [
                        createMock<ServiceProvider<true>>(ServiceProvider<true>, {
                            vidisAngebotId: faker.string.uuid(),
                        }),
                    ],
                },
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: faker.lorem.word(),
                    serviceProvider: [
                        createMock<ServiceProvider<true>>(ServiceProvider<true>, {
                            id: POLYTHEA_SERVICE_PROVIDER_ID,
                        }),
                    ],
                },
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: undefined, //To Be Filtered Out
                    serviceProvider: [],
                },
            ];
            const sp: ServiceProvider<true> = await createAndPersistServiceProvider(em);

            const pk: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                personId: person.id,
                rolleId: faker.string.uuid(),
                organisationId: faker.string.uuid(),
            });

            const personenKontextErweiterungen: ErweiterterServiceProviderForPK[] = [
                {
                    personenkontext: pk,
                    serviceProvider: sp,
                },
            ];

            const emailAddressResponseMock: EmailAddressResponse =
                createMock<EmailAddressResponse>(EmailAddressResponse);
            emailAddressResponseMock.oxLoginId = `${faker.string.uuid()}@${faker.number.int({ min: 1000, max: 9999 })}`;
            emailAddressResponseMock.status = EmailAddressStatusEnum.ACTIVE;
            emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(
                Ok(emailAddressResponseMock),
            );
            personRepoMock.findByKeycloakUserId.mockResolvedValueOnce(person);
            personRepoMock.findById.mockResolvedValueOnce(person);
            dbiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(pkExternalData);
            dbiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce(personenKontextErweiterungen);

            const result: UserExternalDataResponse = await keycloakinternalController.getExternalData({
                sub: keycloakSub,
            });
            expect(result).toBeInstanceOf(UserExternalDataResponse);
            expect(result.ox?.id).toContain(`@`);
            expect(result.itslearning.personId).toEqual(person.id);
            expect(result.vidis.personId).toEqual(person.id);
            expect(result.vidis.vorname).toEqual(person.vorname);
            expect(result.vidis.nachname).toEqual(person.familienname);
            expect(result.vidis.rollenart).toEqual(pkExternalData[0]?.rollenart);
            expect(result.vidis.dienststellenNummern.length).toEqual(1);
            expect(result.opsh.vorname).toEqual(person.vorname);
            expect(result.opsh.nachname).toEqual(person.familienname);
            expect(result.opsh.personenkontexte.length).toEqual(2);
            expect(result.onlineDateiablage.personId).toEqual(person.id);
            expect(result.iqshHelpdesk.vorname).toEqual(person.vorname);
            expect(result.iqshHelpdesk.nachname).toEqual(person.familienname);
            expect(result.polyteia.vorname).toEqual(person.vorname);
            expect(result.polyteia.familienname).toEqual(person.familienname);
            expect(result.polyteia.dienststellenNummern.length).toEqual(1);
            expect(result.polyteia.rollenart).toEqual(RollenArt.LEHR);
        });

        it('should return user external data new Microservice without ox params', async () => {
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);
            const keycloakSub: string = faker.string.uuid();
            const person: Person<true> = Person.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.person.lastName(),
                faker.person.firstName(),
                '1',
                faker.lorem.word(),
                keycloakSub,
                faker.string.uuid(),
            );

            const pkExternalData: ExternalPkData[] = [
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: faker.lorem.word(),
                    serviceProvider: [
                        createMock<ServiceProvider<true>>(ServiceProvider<true>, {
                            vidisAngebotId: faker.string.uuid(),
                        }),
                    ],
                },
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: faker.lorem.word(),
                    serviceProvider: [
                        createMock<ServiceProvider<true>>(ServiceProvider<true>, {
                            vidisAngebotId: faker.string.uuid(),
                        }),
                    ],
                },
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: faker.lorem.word(),
                    serviceProvider: [
                        createMock<ServiceProvider<true>>(ServiceProvider<true>, {
                            id: POLYTHEA_SERVICE_PROVIDER_ID,
                        }),
                    ],
                },
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: undefined, //To Be Filtered Out
                    serviceProvider: [],
                },
            ];
            const sp: ServiceProvider<true> = await createAndPersistServiceProvider(em);

            const pk: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                personId: person.id,
                rolleId: faker.string.uuid(),
                organisationId: faker.string.uuid(),
            });

            const personenKontextErweiterungen: ErweiterterServiceProviderForPK[] = [
                {
                    personenkontext: pk,
                    serviceProvider: sp,
                },
            ];

            emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(Ok(undefined));
            personRepoMock.findByKeycloakUserId.mockResolvedValueOnce(person);
            personRepoMock.findById.mockResolvedValueOnce(person);
            dbiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(pkExternalData);
            dbiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce(personenKontextErweiterungen);

            const result: UserExternalDataResponse = await keycloakinternalController.getExternalData({
                sub: keycloakSub,
            });
            expect(result).toBeInstanceOf(UserExternalDataResponse);
            expect(result.ox).toBeUndefined();
            expect(result.itslearning.personId).toEqual(person.id);
            expect(result.vidis.personId).toEqual(person.id);
            expect(result.vidis.vorname).toEqual(person.vorname);
            expect(result.vidis.nachname).toEqual(person.familienname);
            expect(result.vidis.rollenart).toEqual(pkExternalData[0]?.rollenart);
            expect(result.vidis.dienststellenNummern.length).toEqual(2);
            expect(result.opsh.vorname).toEqual(person.vorname);
            expect(result.opsh.nachname).toEqual(person.familienname);

            expect(result.opsh.personenkontexte.length).toEqual(3);
            expect(result.onlineDateiablage.personId).toEqual(person.id);
            expect(result.iqshHelpdesk.vorname).toEqual(person.vorname);
            expect(result.iqshHelpdesk.nachname).toEqual(person.familienname);
            expect(result.polyteia.vorname).toEqual(person.vorname);
            expect(result.polyteia.familienname).toEqual(person.familienname);
            expect(result.polyteia.dienststellenNummern.length).toEqual(1);
            expect(result.polyteia.rollenart).toEqual(RollenArt.LEHR);
        });

        it('should throw error if multiple unique Rollenarten are present', async () => {
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);
            const keycloakSub: string = faker.string.uuid();
            const person: Person<true> = Person.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.person.lastName(),
                faker.person.firstName(),
                '1',
                faker.lorem.word(),
                keycloakSub,
                faker.string.uuid(),
            );

            const pkExternalData: ExternalPkData[] = [
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: faker.lorem.word(),
                    serviceProvider: [],
                },
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LERN,
                    kennung: faker.lorem.word(),
                    serviceProvider: [],
                },
            ];

            personRepoMock.findByKeycloakUserId.mockResolvedValueOnce(person);
            personRepoMock.findById.mockResolvedValueOnce(person);
            dbiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(pkExternalData);
            dbiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);

            await expect(keycloakinternalController.getExternalData({ sub: keycloakSub })).rejects.toBeInstanceOf(
                MultipleRollenartenError,
            );
        });

        it('should throw EntityNotFoundError if person not found during workflow initialization', async () => {
            const keycloakSub: string = faker.string.uuid();
            const pkExternalData: ExternalPkData[] = [
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: faker.lorem.word(),
                },
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LERN,
                    kennung: faker.lorem.word(),
                },
            ];

            personRepoMock.findByKeycloakUserId.mockResolvedValueOnce(DoFactory.createPerson(true));
            personRepoMock.findById.mockResolvedValueOnce(undefined);
            dbiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(pkExternalData);

            await expect(keycloakinternalController.getExternalData({ sub: keycloakSub })).rejects.toBeInstanceOf(
                EntityNotFoundError,
            );
        });

        it('should throw EntityNotFoundError if person not found by keycloak user id', async () => {
            const keycloakSub: string = faker.string.uuid();
            personRepoMock.findByKeycloakUserId.mockResolvedValueOnce(undefined);

            await expect(keycloakinternalController.getExternalData({ sub: keycloakSub })).rejects.toBeInstanceOf(
                EntityNotFoundError,
            );
        });

        it('should throw UserExternalDataWorkflowError when workflow fields are not initialized', async () => {
            const keycloakSub: string = faker.string.uuid();
            const person: Person<true> = DoFactory.createPerson(true, { keycloakUserId: keycloakSub });

            personRepoMock.findByKeycloakUserId.mockResolvedValueOnce(person);

            // Create a mock workflow that returns no error but has undefined fields
            const workflowMock: DeepMocked<UserExternaldataWorkflowAggregate> =
                createMock<UserExternaldataWorkflowAggregate>(UserExternaldataWorkflowAggregate);
            workflowMock.initialize.mockResolvedValueOnce(undefined);
            workflowMock.person = undefined;
            workflowMock.checkedExternalPkData = undefined;
            workflowMock.mergedExternalPkData = undefined;
            workflowMock.externalPkDataWithVidisAngebotId = undefined;
            workflowMock.vidisDienststellennummern = undefined;
            workflowMock.polytheaDienststellenNummern = undefined;

            const workflowFactoryMock: DeepMocked<UserExternaldataWorkflowFactory> =
                createMock<UserExternaldataWorkflowFactory>(UserExternaldataWorkflowFactory);
            workflowFactoryMock.createNew.mockReturnValueOnce(workflowMock);

            // Create a new controller instance with the mocked factory
            const controllerWithMockedFactory: KeycloakInternalController = new KeycloakInternalController(
                workflowFactoryMock,
                personRepoMock,
            );

            await expect(controllerWithMockedFactory.getExternalData({ sub: keycloakSub })).rejects.toThrow(
                UserExternalDataWorkflowError,
            );
        });
    });
});
