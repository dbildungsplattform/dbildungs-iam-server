import { faker } from '@faker-js/faker';
import { Test, TestingModule } from '@nestjs/testing';
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
    let module: TestingModule;
    let sut: UserExternaldataService;
    let personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let personRepositoryMock: DeepMocked<PersonRepository>;
    let emailResolverServiceMock: DeepMocked<EmailResolverService>;

    const oxContextId: string = 'test-context-id';
    const keycloakClientId: string = 'the-angebot-client';

    const createExternalPkData = (props?: Partial<ExternalPkData>): ExternalPkData => ({
        pkId: faker.string.uuid(),
        rolleId: faker.string.uuid(),
        rollenart: RollenArt.LEHR,
        kennung: faker.string.alpha(),
        serviceProvider: [],
        ...props,
    });

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                UserExternaldataService,
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock<DBiamPersonenkontextRepo>(DBiamPersonenkontextRepo),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock<PersonRepository>(PersonRepository),
                },
                {
                    provide: EmailResolverService,
                    useValue: createMock<EmailResolverService>(EmailResolverService),
                },
            ],
        }).compile();

        sut = module.get(UserExternaldataService);
        personenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        personRepositoryMock = module.get(PersonRepository);
        emailResolverServiceMock = module.get(EmailResolverService);
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('getExternalData', () => {
        // shared by every scenario that needs a person with exactly one permitted Personenkontext
        const setupPermittedPerson = (): { person: Person<true>; permittedPk: ExternalPkData } => {
            const person: Person<true> = DoFactory.createPerson(true);
            const permittedPk: ExternalPkData = createExternalPkData({
                serviceProvider: [DoFactory.createServiceProvider(true, { keycloakClientId })],
            });

            personRepositoryMock.findByKeycloakUserId.mockResolvedValueOnce(person);
            personenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
            personenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([permittedPk]);

            return { person, permittedPk };
        };

        describe('when no person is found for the given keycloak sub', () => {
            const setup = (): { keycloakSub: string } => {
                const keycloakSub: string = faker.string.uuid();

                personRepositoryMock.findByKeycloakUserId.mockResolvedValueOnce(undefined);

                return { keycloakSub };
            };

            it('should return EntityNotFoundError and not query Personenkontexte', async () => {
                const { keycloakSub }: { keycloakSub: string } = setup();

                const result: Result<UserExternalData, DomainError> = await sut.getExternalData(
                    keycloakSub,
                    keycloakClientId,
                    false,
                );

                expect(result.ok).toBe(false);
                if (!result.ok) {
                    expect(result.error).toBeInstanceOf(EntityNotFoundError);
                }
                expect(personenkontextRepoMock.findExternalPkData).not.toHaveBeenCalled();
            });
        });

        describe('when no Personenkontext grants permission for the Angebot', () => {
            const setup = (): { person: Person<true> } => {
                const person: Person<true> = DoFactory.createPerson(true);

                personRepositoryMock.findByKeycloakUserId.mockResolvedValueOnce(person);
                personenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
                personenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([
                    createExternalPkData({
                        serviceProvider: [DoFactory.createServiceProvider(true, { keycloakClientId: 'other-client' })],
                    }),
                ]);

                return { person };
            };

            it('should return MissingPermissionsError', async () => {
                const { person }: { person: Person<true> } = setup();

                const result: Result<UserExternalData, DomainError> = await sut.getExternalData(
                    person.keycloakUserId!,
                    keycloakClientId,
                    false,
                );

                expect(result.ok).toBe(false);
                if (!result.ok) {
                    expect(result.error).toBeInstanceOf(MissingPermissionsError);
                }
            });
        });

        describe('when Personenkontexte are missing kennung or rollenart', () => {
            const setup = (): { person: Person<true> } => {
                const person: Person<true> = DoFactory.createPerson(true);

                personRepositoryMock.findByKeycloakUserId.mockResolvedValueOnce(person);
                personenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
                personenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([
                    createExternalPkData({
                        kennung: undefined,
                        serviceProvider: [DoFactory.createServiceProvider(true, { keycloakClientId })],
                    }),
                    createExternalPkData({
                        rollenart: undefined,
                        serviceProvider: [DoFactory.createServiceProvider(true, { keycloakClientId })],
                    }),
                ]);

                return { person };
            };

            it('should ignore them and return MissingPermissionsError', async () => {
                const { person }: { person: Person<true> } = setup();

                const result: Result<UserExternalData, DomainError> = await sut.getExternalData(
                    person.keycloakUserId!,
                    keycloakClientId,
                    false,
                );

                expect(result.ok).toBe(false);
                if (!result.ok) {
                    expect(result.error).toBeInstanceOf(MissingPermissionsError);
                }
            });
        });

        describe('when permission exists via direct service provider assignment', () => {
            const setup = (): { person: Person<true>; permittedPk: ExternalPkData } => {
                const person: Person<true> = DoFactory.createPerson(true);
                const permittedPk: ExternalPkData = createExternalPkData({
                    kennung: 'permitted-kennung',
                    rollenart: RollenArt.LEHR,
                    serviceProvider: [DoFactory.createServiceProvider(true, { keycloakClientId })],
                });
                const unrelatedPk: ExternalPkData = createExternalPkData({
                    kennung: 'unrelated-kennung',
                    serviceProvider: [DoFactory.createServiceProvider(true, { keycloakClientId: 'other-client' })],
                });

                personRepositoryMock.findByKeycloakUserId.mockResolvedValueOnce(person);
                personenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
                personenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([permittedPk, unrelatedPk]);

                return { person, permittedPk };
            };

            it('should return only the Schulzuordnungen for which a permission exists', async () => {
                const { person, permittedPk }: { person: Person<true>; permittedPk: ExternalPkData } = setup();

                const result: Result<UserExternalData, DomainError> = await sut.getExternalData(
                    person.keycloakUserId!,
                    keycloakClientId,
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
        });

        describe('when a Personenkontext has no own service providers but a Rollenerweiterung grants permission', () => {
            const setup = (): { person: Person<true> } => {
                const person: Person<true> = DoFactory.createPerson(true);
                const pk: ExternalPkData = createExternalPkData({ serviceProvider: undefined });
                const erweiterterServiceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                    keycloakClientId,
                });

                personRepositoryMock.findByKeycloakUserId.mockResolvedValueOnce(person);
                personenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([pk]);
                personenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([
                    {
                        personenkontext: DoFactory.createPersonenkontext(true, { id: pk.pkId }),
                        serviceProvider: erweiterterServiceProvider,
                    },
                ]);

                return { person };
            };

            it('should grant permission', async () => {
                const { person }: { person: Person<true> } = setup();

                const result: Result<UserExternalData, DomainError> = await sut.getExternalData(
                    person.keycloakUserId!,
                    keycloakClientId,
                    false,
                );

                expect(result.ok).toBe(true);
            });
        });

        describe('when permitted Personenkontexte have different Rollenarten', () => {
            const setup = (): { person: Person<true> } => {
                const person: Person<true> = DoFactory.createPerson(true);

                personRepositoryMock.findByKeycloakUserId.mockResolvedValueOnce(person);
                personenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
                personenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([
                    createExternalPkData({
                        rollenart: RollenArt.LEHR,
                        serviceProvider: [DoFactory.createServiceProvider(true, { keycloakClientId })],
                    }),
                    createExternalPkData({
                        rollenart: RollenArt.LERN,
                        serviceProvider: [DoFactory.createServiceProvider(true, { keycloakClientId })],
                    }),
                ]);

                return { person };
            };

            it('should return MultipleRollenartenError', async () => {
                const { person }: { person: Person<true> } = setup();

                const result: Result<UserExternalData, DomainError> = await sut.getExternalData(
                    person.keycloakUserId!,
                    keycloakClientId,
                    false,
                );

                expect(result.ok).toBe(false);
                if (!result.ok) {
                    expect(result.error).toBeInstanceOf(MultipleRollenartenError);
                }
            });
        });

        describe('when includeEmailAddress is false', () => {
            const setup = (): { person: Person<true> } => setupPermittedPerson();

            it('should not call the email resolver', async () => {
                const { person }: { person: Person<true> } = setup();

                await sut.getExternalData(person.keycloakUserId!, keycloakClientId, false);

                expect(emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse).not.toHaveBeenCalled();
            });
        });

        describe('when includeEmailAddress is true and email microservice is used', () => {
            describe('when email is ACTIVE', () => {
                const setup = (): { person: Person<true>; emailAddress: EmailAddress<true>; oxLoginId: string } => {
                    const { person }: { person: Person<true> } = setupPermittedPerson();
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

                    return { person, emailAddress, oxLoginId };
                };

                it('should set emailAdresse and oxLoginId', async () => {
                    const {
                        person,
                        emailAddress,
                        oxLoginId,
                    }: { person: Person<true>; emailAddress: EmailAddress<true>; oxLoginId: string } = setup();

                    const result: Result<UserExternalData, DomainError> = await sut.getExternalData(
                        person.keycloakUserId!,
                        keycloakClientId,
                        true,
                    );

                    expect(result.ok).toBe(true);
                    if (result.ok) {
                        expect(result.value.emailAdresse).toBe(emailAddress.address);
                        expect(result.value.oxLoginId).toBe(`${oxLoginId}@${oxContextId}`);
                    }
                });
            });

            describe('when email is SUSPENDED', () => {
                const setup = (): { person: Person<true> } => {
                    const { person }: { person: Person<true> } = setupPermittedPerson();
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

                    return { person };
                };

                it('should omit emailAdresse and oxLoginId', async () => {
                    const { person }: { person: Person<true> } = setup();

                    const result: Result<UserExternalData, DomainError> = await sut.getExternalData(
                        person.keycloakUserId!,
                        keycloakClientId,
                        true,
                    );

                    expect(result.ok).toBe(true);
                    if (result.ok) {
                        expect(result.value.emailAdresse).toBeUndefined();
                        expect(result.value.oxLoginId).toBeUndefined();
                    }
                });
            });

            describe('when email is DEACTIVE', () => {
                const setup = (): { person: Person<true>; oxLoginId: string } => {
                    const { person }: { person: Person<true> } = setupPermittedPerson();
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

                    return { person, oxLoginId };
                };

                it('should set oxLoginId but not emailAdresse', async () => {
                    const { person, oxLoginId }: { person: Person<true>; oxLoginId: string } = setup();

                    const result: Result<UserExternalData, DomainError> = await sut.getExternalData(
                        person.keycloakUserId!,
                        keycloakClientId,
                        true,
                    );

                    expect(result.ok).toBe(true);
                    if (result.ok) {
                        expect(result.value.emailAdresse).toBeUndefined();
                        expect(result.value.oxLoginId).toBe(`${oxLoginId}@${oxContextId}`);
                    }
                });
            });

            describe('when no email address exists for the person', () => {
                const setup = (): { person: Person<true> } => {
                    const { person }: { person: Person<true> } = setupPermittedPerson();

                    emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(
                        Ok(undefined),
                    );

                    return { person };
                };

                it('should return without emailAdresse and oxLoginId', async () => {
                    const { person }: { person: Person<true> } = setup();

                    const result: Result<UserExternalData, DomainError> = await sut.getExternalData(
                        person.keycloakUserId!,
                        keycloakClientId,
                        true,
                    );

                    expect(result.ok).toBe(true);
                    if (result.ok) {
                        expect(result.value.emailAdresse).toBeUndefined();
                        expect(result.value.oxLoginId).toBeUndefined();
                    }
                });
            });

            describe('when the email microservice returns an error', () => {
                const setup = (): { person: Person<true>; error: EmailAddressNotFoundError } => {
                    const { person }: { person: Person<true> } = setupPermittedPerson();
                    const error: EmailAddressNotFoundError = new EmailAddressNotFoundError();

                    emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(
                        Err(error),
                    );

                    return { person, error };
                };

                it('should propagate the error', async () => {
                    const { person, error }: { person: Person<true>; error: EmailAddressNotFoundError } = setup();

                    const result: Result<UserExternalData, DomainError> = await sut.getExternalData(
                        person.keycloakUserId!,
                        keycloakClientId,
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
});
