import { faker } from '@faker-js/faker';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { EmailAddressResponse } from '../../../email/modules/core/api/dtos/response/email-address.response.js';
import { EmailAddress } from '../../../email/modules/core/domain/email-address.js';
import { EmailAddressStatusEnum } from '../../../email/modules/core/persistence/email-address-status.entity.js';
import {
    DomainError,
    EntityNotFoundError,
    MissingPermissionsError,
    MultipleRollenartenError,
} from '../../../shared/error/index.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { EmailAddressNotFoundError } from '../../email/error/email-address-not-found.error.js';
import { Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import {
    DBiamPersonenkontextRepo,
    ExternalPkData,
} from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { UserExternalData, UserExternaldataService } from './user-externaldata.service.js';

describe('UserExternaldataService', () => {
    let sut: UserExternaldataService;
    let personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let personRepositoryMock: DeepMocked<PersonRepository>;
    let emailResolverServiceMock: DeepMocked<EmailResolverService>;

    const oxContextId: string = 'test-context-id';
    const keycloakClient: string = 'the-angebot-client';

    const createExternalPkData = (props?: Partial<ExternalPkData>): ExternalPkData => ({
        pkId: faker.string.uuid(),
        rolleId: faker.string.uuid(),
        rollenart: RollenArt.LEHR,
        kennung: faker.string.alpha(),
        serviceProvider: [],
        ...props,
    });

    const callGetExternalData = (
        person: Person<true>,
        client: string,
        includeEmailAddress: boolean,
    ): Promise<Result<UserExternalData, DomainError>> => {
        personRepositoryMock.findByKeycloakUserId.mockResolvedValueOnce(person);

        return sut.getExternalData(person.keycloakUserId, client, includeEmailAddress);
    };

    beforeEach(() => {
        vi.resetAllMocks();

        personenkontextRepoMock = createMock<DBiamPersonenkontextRepo>(DBiamPersonenkontextRepo);
        personRepositoryMock = createMock<PersonRepository>(PersonRepository);
        emailResolverServiceMock = createMock<EmailResolverService>(EmailResolverService);

        personenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValue([]);

        sut = new UserExternaldataService(personenkontextRepoMock, personRepositoryMock, emailResolverServiceMock);
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('getExternalData', () => {
        it('should return EntityNotFoundError when no person is found for the given keycloak sub', async () => {
            personRepositoryMock.findByKeycloakUserId.mockResolvedValueOnce(undefined);

            const result: Result<UserExternalData, DomainError> = await sut.getExternalData(
                faker.string.uuid(),
                keycloakClient,
                false,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(EntityNotFoundError);
            }
            expect(personenkontextRepoMock.findExternalPkData).not.toHaveBeenCalled();
        });

        it('should return MissingPermissionsError when no Personenkontext grants permission for the Angebot', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            personenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([
                createExternalPkData({
                    serviceProvider: [DoFactory.createServiceProvider(true, { keycloakClient: 'other-client' })],
                }),
            ]);

            const result: Result<UserExternalData, DomainError> = await callGetExternalData(
                person,
                keycloakClient,
                false,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(MissingPermissionsError);
            }
        });

        it('should ignore Personenkontexte without kennung or rollenart', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            personenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([
                createExternalPkData({
                    kennung: undefined,
                    serviceProvider: [DoFactory.createServiceProvider(true, { keycloakClient })],
                }),
                createExternalPkData({
                    rollenart: undefined,
                    serviceProvider: [DoFactory.createServiceProvider(true, { keycloakClient })],
                }),
            ]);

            const result: Result<UserExternalData, DomainError> = await callGetExternalData(
                person,
                keycloakClient,
                false,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(MissingPermissionsError);
            }
        });

        it('should return only the Schulzuordnungen for which a permission exists via direct service provider assignment', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            const permittedPk: ExternalPkData = createExternalPkData({
                kennung: 'permitted-kennung',
                rollenart: RollenArt.LEHR,
                serviceProvider: [DoFactory.createServiceProvider(true, { keycloakClient })],
            });
            const unrelatedPk: ExternalPkData = createExternalPkData({
                kennung: 'unrelated-kennung',
                serviceProvider: [DoFactory.createServiceProvider(true, { keycloakClient: 'other-client' })],
            });

            personenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([permittedPk, unrelatedPk]);

            const result: Result<UserExternalData, DomainError> = await callGetExternalData(
                person,
                keycloakClient,
                false,
            );

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.personId).toBe(person.id);
                expect(result.value.vorname).toBe(person.vorname);
                expect(result.value.nachname).toBe(person.familienname);
                expect(result.value.rollenart).toBe(RollenArt.LEHR);
                expect(result.value.personenkontexte).toEqual([
                    { dienststellennr: 'permitted-kennung', rolleId: permittedPk.rolleId },
                ]);
                expect(result.value.emailAdresse).toBeUndefined();
                expect(result.value.oxLoginId).toBeUndefined();
            }
        });

        it('should grant permission via Rollenerweiterung when Personenkontext has no own service providers', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            const pk: ExternalPkData = createExternalPkData({ serviceProvider: undefined });
            const erweiterterServiceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                keycloakClient,
            });

            personenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([pk]);
            personenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([
                {
                    personenkontext: DoFactory.createPersonenkontext(true, { id: pk.pkId }),
                    serviceProvider: erweiterterServiceProvider,
                },
            ]);

            const result: Result<UserExternalData, DomainError> = await callGetExternalData(
                person,
                keycloakClient,
                false,
            );

            expect(result.ok).toBe(true);
        });

        it('should return MultipleRollenartenError when permitted Personenkontexte have different Rollenarten', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            personenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([
                createExternalPkData({
                    rollenart: RollenArt.LEHR,
                    serviceProvider: [DoFactory.createServiceProvider(true, { keycloakClient })],
                }),
                createExternalPkData({
                    rollenart: RollenArt.LERN,
                    serviceProvider: [DoFactory.createServiceProvider(true, { keycloakClient })],
                }),
            ]);

            const result: Result<UserExternalData, DomainError> = await callGetExternalData(
                person,
                keycloakClient,
                false,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(MultipleRollenartenError);
            }
        });

        describe('when includeEmailAddress is false', () => {
            it('should not call the email resolver', async () => {
                const person: Person<true> = DoFactory.createPerson(true);
                personenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([
                    createExternalPkData({
                        serviceProvider: [DoFactory.createServiceProvider(true, { keycloakClient })],
                    }),
                ]);

                await callGetExternalData(person, keycloakClient, false);

                expect(emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse).not.toHaveBeenCalled();
            });
        });

        describe('when includeEmailAddress is true and email microservice is used', () => {
            const setup = (): void => {
                personenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([
                    createExternalPkData({
                        serviceProvider: [DoFactory.createServiceProvider(true, { keycloakClient })],
                    }),
                ]);
            };

            it('should set emailAdresse and oxLoginId when email is ACTIVE', async () => {
                const person: Person<true> = DoFactory.createPerson(true);
                setup();
                const oxLoginId: string = faker.string.uuid();
                const emailAddress: EmailAddress<true> = DoFactory.createMicroserviceEmailAddress(true, {
                    spshPersonId: person.id,
                    externalId: oxLoginId,
                    sortedStatuses: [{ status: EmailAddressStatusEnum.ACTIVE }],
                });
                const response: EmailAddressResponse = new EmailAddressResponse(
                    emailAddress,
                    emailAddress.getStatus()!,
                    oxContextId,
                );
                emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(
                    Ok(response),
                );

                const result: Result<UserExternalData, DomainError> = await callGetExternalData(
                    person,
                    keycloakClient,
                    true,
                );

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value.emailAdresse).toBe(emailAddress.address);
                    expect(result.value.oxLoginId).toBe(`${oxLoginId}@${oxContextId}`);
                }
            });

            it('should omit emailAdresse and oxLoginId when email is SUSPENDED', async () => {
                const person: Person<true> = DoFactory.createPerson(true);
                setup();
                const emailAddress: EmailAddress<true> = DoFactory.createMicroserviceEmailAddress(true, {
                    spshPersonId: person.id,
                    sortedStatuses: [{ status: EmailAddressStatusEnum.SUSPENDED }],
                });
                const response: EmailAddressResponse = new EmailAddressResponse(
                    emailAddress,
                    emailAddress.getStatus()!,
                    oxContextId,
                );
                emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(
                    Ok(response),
                );

                const result: Result<UserExternalData, DomainError> = await callGetExternalData(
                    person,
                    keycloakClient,
                    true,
                );

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value.emailAdresse).toBeUndefined();
                    expect(result.value.oxLoginId).toBeUndefined();
                }
            });

            it('should set oxLoginId but not emailAdresse when email is DEACTIVE', async () => {
                const person: Person<true> = DoFactory.createPerson(true);
                setup();
                const oxLoginId: string = faker.string.uuid();
                const emailAddress: EmailAddress<true> = DoFactory.createMicroserviceEmailAddress(true, {
                    spshPersonId: person.id,
                    externalId: oxLoginId,
                    sortedStatuses: [{ status: EmailAddressStatusEnum.DEACTIVE }],
                });
                const response: EmailAddressResponse = new EmailAddressResponse(
                    emailAddress,
                    emailAddress.getStatus()!,
                    oxContextId,
                );
                emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(
                    Ok(response),
                );

                const result: Result<UserExternalData, DomainError> = await callGetExternalData(
                    person,
                    keycloakClient,
                    true,
                );

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value.emailAdresse).toBeUndefined();
                    expect(result.value.oxLoginId).toBe(`${oxLoginId}@${oxContextId}`);
                }
            });

            it('should return {} when no email address exists for the person', async () => {
                const person: Person<true> = DoFactory.createPerson(true);
                setup();
                emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(
                    Ok(undefined),
                );

                const result: Result<UserExternalData, DomainError> = await callGetExternalData(
                    person,
                    keycloakClient,
                    true,
                );

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value.emailAdresse).toBeUndefined();
                    expect(result.value.oxLoginId).toBeUndefined();
                }
            });

            it('should propagate the error from the email microservice', async () => {
                const person: Person<true> = DoFactory.createPerson(true);
                setup();
                const error: EmailAddressNotFoundError = new EmailAddressNotFoundError();
                emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(Err(error));

                const result: Result<UserExternalData, DomainError> = await callGetExternalData(
                    person,
                    keycloakClient,
                    true,
                );

                expect(result.ok).toBe(false);
                if (!result.ok) {
                    expect(result.error).toBe(error);
                }
            });
        });
    });
});
