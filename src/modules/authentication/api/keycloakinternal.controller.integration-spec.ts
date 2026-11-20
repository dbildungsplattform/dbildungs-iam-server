import { faker } from '@faker-js/faker';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';

import { MikroORM } from '@mikro-orm/core';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { APP_FILTER } from '@nestjs/core';
import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { DatabaseTestModule, DoFactory } from '../../../../test/utils/index.js';
import { EmailAddressResponse } from '../../../email/modules/core/api/dtos/response/email-address.response.js';
import { EmailAddressStatusEnum } from '../../../email/modules/core/persistence/email-address-status.entity.js';
import { ExternalDataCacheInterceptor } from '../../../shared/cache/external-data-cache-interceptor.js';
import { EntityNotFoundError, MissingPermissionsError, MultipleRollenartenError } from '../../../shared/error/index.js';
import { SharedExceptionFilter } from '../../../shared/filter/shared-exception-filter.js';
import { ValidationExceptionFilter } from '../../../shared/filter/validation-exception-filter.js';
import { Ok } from '../../../shared/util/result.js';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { EmailMicroserviceModule } from '../../email-microservice/email-microservice.module.js';
import { type Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { PersonModule } from '../../person/person.module.js';
import {
    DBiamPersonenkontextRepo,
    type ExternalPkData,
} from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { PersonenKontextModule } from '../../personenkontext/personenkontext.module.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { RolleModule } from '../../rolle/rolle.module.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderModule } from '../../service-provider/service-provider.module.js';
import { UserExternaldataService } from '../domain/user-externaldata.service.js';
import { AuthenticationExceptionFilter } from './authentication-exception-filter.js';
import { UserExternalDataV2Response } from './externaldata/user-externaldata-v2.response.js';
import { KeycloakInternalController } from './keycloakinternal.controller.js';

describe('KeycloakInternalController', () => {
    let module: TestingModule;
    let keycloakinternalController: KeycloakInternalController;
    let dbiamPersonenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let personRepoMock: DeepMocked<PersonRepository>;
    let emailResolverServiceMock: DeepMocked<EmailResolverService>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                CommonTestModule,
                ServiceProviderModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                PersonModule,
                PersonenKontextModule,
                RolleModule,
                EmailMicroserviceModule,
            ],
            providers: [
                KeycloakInternalController,
                UserExternaldataService,
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

    describe('externalDataV2', () => {
        it('should return external data for the Angebot the person is permitted for', async () => {
            const keycloakSub: string = faker.string.uuid();
            const keycloakClientId: string = faker.string.alphanumeric(10);
            const person: Person<true> = DoFactory.createPerson(true, { keycloakUserId: keycloakSub });

            const pkExternalData: ExternalPkData[] = [
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: faker.lorem.word(),
                    serviceProvider: [createMock<ServiceProvider<true>>(ServiceProvider<true>, { keycloakClientId })],
                },
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: faker.lorem.word(),
                    serviceProvider: [
                        createMock<ServiceProvider<true>>(ServiceProvider<true>, {
                            keycloakClientId: faker.string.alphanumeric(10),
                        }),
                    ],
                },
            ];

            personRepoMock.findByKeycloakUserId.mockResolvedValueOnce(person);
            dbiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(pkExternalData);
            dbiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);

            const result: UserExternalDataV2Response = await keycloakinternalController.getExternalDataV2({
                sub: keycloakSub,
                keycloakClientId,
            });

            expect(result).toBeInstanceOf(UserExternalDataV2Response);
            expect(result.personId).toEqual(person.id);
            expect(result.vorname).toEqual(person.vorname);
            expect(result.nachname).toEqual(person.familienname);
            expect(result.rollenart).toEqual(RollenArt.LEHR);
            expect(result.personenkontexte).toEqual([
                { dstNr: pkExternalData[0]?.kennung, rolleId: pkExternalData[0]?.rolleId },
            ]);
            expect(result.dienststellenNummern).toEqual([pkExternalData[0]?.kennung]);
            expect(result.emailAdresse).toBeUndefined();
            expect(result.oxLoginId).toBeUndefined();
        });

        it('should throw MissingPermissionsError when no Personenkontext grants permission for the Angebot', async () => {
            const keycloakSub: string = faker.string.uuid();
            const keycloakClientId: string = faker.string.alphanumeric(10);
            const person: Person<true> = DoFactory.createPerson(true, { keycloakUserId: keycloakSub });

            personRepoMock.findByKeycloakUserId.mockResolvedValueOnce(person);
            dbiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([]);
            dbiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);

            await expect(
                keycloakinternalController.getExternalDataV2({ sub: keycloakSub, keycloakClientId }),
            ).rejects.toBeInstanceOf(MissingPermissionsError);
        });

        it('should throw MissingPermissionsError when all Personenkontexte belong to a different keycloakClientId', async () => {
            const keycloakSub: string = faker.string.uuid();
            const keycloakClientId: string = faker.string.alphanumeric(10);
            const person: Person<true> = DoFactory.createPerson(true, { keycloakUserId: keycloakSub });

            const pkExternalData: ExternalPkData[] = [DoFactory.createExternalPkData()];

            personRepoMock.findByKeycloakUserId.mockResolvedValueOnce(person);
            dbiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(pkExternalData);
            dbiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);

            await expect(
                keycloakinternalController.getExternalDataV2({ sub: keycloakSub, keycloakClientId }),
            ).rejects.toBeInstanceOf(MissingPermissionsError);
        });

        it('should throw MultipleRollenartenError when the person has multiple Rollenarten for the permitted Personenkontexte', async () => {
            const keycloakSub: string = faker.string.uuid();
            const keycloakClientId: string = faker.string.alphanumeric(10);
            const person: Person<true> = DoFactory.createPerson(true, { keycloakUserId: keycloakSub });

            const pkExternalData: ExternalPkData[] = [
                DoFactory.createExternalPkData({ rollenart: RollenArt.LEHR, keycloakClientId }),
                DoFactory.createExternalPkData({ rollenart: RollenArt.LERN, keycloakClientId }),
            ];

            personRepoMock.findByKeycloakUserId.mockResolvedValueOnce(person);
            dbiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(pkExternalData);
            dbiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);

            await expect(
                keycloakinternalController.getExternalDataV2({ sub: keycloakSub, keycloakClientId }),
            ).rejects.toBeInstanceOf(MultipleRollenartenError);
        });

        it('should include the email address when includeEmailAddress is true and the email is active', async () => {
            const keycloakSub: string = faker.string.uuid();
            const keycloakClientId: string = faker.string.alphanumeric(10);
            const person: Person<true> = DoFactory.createPerson(true, { keycloakUserId: keycloakSub });

            const pkExternalData: ExternalPkData[] = [DoFactory.createExternalPkData({ keycloakClientId })];

            const emailAddressResponseMock: EmailAddressResponse =
                createMock<EmailAddressResponse>(EmailAddressResponse);
            emailAddressResponseMock.status = EmailAddressStatusEnum.ACTIVE;
            emailAddressResponseMock.address = faker.internet.email();
            emailAddressResponseMock.oxLoginId = faker.string.uuid();

            personRepoMock.findByKeycloakUserId.mockResolvedValueOnce(person);
            dbiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(pkExternalData);
            dbiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(
                Ok(emailAddressResponseMock),
            );

            const result: UserExternalDataV2Response = await keycloakinternalController.getExternalDataV2({
                sub: keycloakSub,
                keycloakClientId,
                includeEmailAddress: true,
            });

            expect(result.emailAdresse).toEqual(emailAddressResponseMock.address);
            expect(emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse).toHaveBeenCalledWith(
                person.id,
            );
        });

        it('should not include the email address when includeEmailAddress is false', async () => {
            const keycloakSub: string = faker.string.uuid();
            const keycloakClientId: string = faker.string.alphanumeric(10);
            const person: Person<true> = DoFactory.createPerson(true, { keycloakUserId: keycloakSub });

            const pkExternalData: ExternalPkData[] = [DoFactory.createExternalPkData({ keycloakClientId })];

            personRepoMock.findByKeycloakUserId.mockResolvedValueOnce(person);
            dbiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(pkExternalData);
            dbiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);

            const result: UserExternalDataV2Response = await keycloakinternalController.getExternalDataV2({
                sub: keycloakSub,
                keycloakClientId,
                includeEmailAddress: false,
            });

            expect(result.emailAdresse).toBeUndefined();
            expect(emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse).not.toHaveBeenCalled();
        });

        it('should not include the email address when the email account is suspended, even if requested', async () => {
            const keycloakSub: string = faker.string.uuid();
            const keycloakClientId: string = faker.string.alphanumeric(10);
            const person: Person<true> = DoFactory.createPerson(true, { keycloakUserId: keycloakSub });

            const pkExternalData: ExternalPkData[] = [DoFactory.createExternalPkData({ keycloakClientId })];

            const emailAddressResponseMock: EmailAddressResponse =
                createMock<EmailAddressResponse>(EmailAddressResponse);
            emailAddressResponseMock.status = EmailAddressStatusEnum.SUSPENDED;
            emailAddressResponseMock.address = faker.internet.email();
            emailAddressResponseMock.oxLoginId = faker.string.uuid();

            personRepoMock.findByKeycloakUserId.mockResolvedValueOnce(person);
            dbiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(pkExternalData);
            dbiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(
                Ok(emailAddressResponseMock),
            );

            const result: UserExternalDataV2Response = await keycloakinternalController.getExternalDataV2({
                sub: keycloakSub,
                keycloakClientId,
                includeEmailAddress: true,
            });

            expect(result.emailAdresse).toBeUndefined();
            expect(result.oxLoginId).toBeUndefined();
        });

        it('should not include the email address when the email account is not active', async () => {
            const keycloakSub: string = faker.string.uuid();
            const keycloakClientId: string = faker.string.alphanumeric(10);
            const person: Person<true> = DoFactory.createPerson(true, { keycloakUserId: keycloakSub });

            const pkExternalData: ExternalPkData[] = [DoFactory.createExternalPkData({ keycloakClientId })];

            const emailAddressResponseMock: EmailAddressResponse =
                createMock<EmailAddressResponse>(EmailAddressResponse);
            emailAddressResponseMock.status = EmailAddressStatusEnum.PENDING;
            emailAddressResponseMock.address = faker.internet.email();
            emailAddressResponseMock.oxLoginId = faker.string.uuid();

            personRepoMock.findByKeycloakUserId.mockResolvedValueOnce(person);
            dbiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(pkExternalData);
            dbiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(
                Ok(emailAddressResponseMock),
            );

            const result: UserExternalDataV2Response = await keycloakinternalController.getExternalDataV2({
                sub: keycloakSub,
                keycloakClientId,
                includeEmailAddress: true,
            });

            expect(result.emailAdresse).toBeUndefined();
            expect(result.oxLoginId).toEqual(emailAddressResponseMock.oxLoginId);
        });

        it('should throw EntityNotFoundError if person not found by keycloak user id', async () => {
            const keycloakSub: string = faker.string.uuid();
            personRepoMock.findByKeycloakUserId.mockResolvedValueOnce(undefined);

            await expect(
                keycloakinternalController.getExternalDataV2({
                    sub: keycloakSub,
                    keycloakClientId: faker.string.alphanumeric(10),
                }),
            ).rejects.toBeInstanceOf(EntityNotFoundError);
        });
    });
});
