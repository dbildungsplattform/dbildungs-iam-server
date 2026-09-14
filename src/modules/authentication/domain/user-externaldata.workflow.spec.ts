import { faker } from '@faker-js/faker';
import { ConfigService } from '@nestjs/config';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { EmailAddressResponse } from '../../../email/modules/core/api/dtos/response/email-address.response.js';
import { EmailAddress } from '../../../email/modules/core/domain/email-address.js';
import { EmailAddressStatusEnum } from '../../../email/modules/core/persistence/email-address-status.entity.js';
import { DomainError, MultipleRollenartenError } from '../../../shared/error/index.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { EmailAddressStatus } from '../../email/domain/email-address.js';
import { EmailAddressNotFoundError } from '../../email/error/email-address-not-found.error.js';
import { EmailRepo } from '../../email/persistence/email.repo.js';
import { PersonEmailResponse } from '../../person/api/person-email-response.js';
import { Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import {
    DBiamPersonenkontextRepo,
    ErweiterterServiceProviderForPK,
    ExternalPkData,
} from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { ServiceProviderSystem } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { RequiredExternalPkData } from '../api/keycloakinternal.controller.js';
import { POLYTHEA_SERVICE_PROVIDER_ID, UserExternaldataWorkflowAggregate } from './user-extenaldata.workflow.js';

const createRequiredExternalPkData = (props?: Partial<RequiredExternalPkData>): RequiredExternalPkData => {
    return {
        pkId: props?.pkId ?? faker.string.uuid(),
        rolleId: props?.rolleId ?? faker.string.uuid(),
        rollenart: props?.rollenart ?? RollenArt.LEHR,
        kennung: props?.kennung ?? faker.string.alpha(),
        serviceProvider: props?.serviceProvider ?? [],
    };
};

describe('UserExternaldataWorkflow', () => {
    let sut: UserExternaldataWorkflowAggregate;
    let dBiamPersonenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let personRepositoryMock: DeepMocked<PersonRepository>;
    let emailRepoMock: DeepMocked<EmailRepo>;
    let emailResolverServiceMock: DeepMocked<EmailResolverService>;
    let configServiceMock: DeepMocked<ConfigService>;

    beforeEach(() => {
        configServiceMock = createMock<ConfigService>(ConfigService);
        configServiceMock.getOrThrow.mockReturnValue({});

        dBiamPersonenkontextRepoMock = createMock<DBiamPersonenkontextRepo>(DBiamPersonenkontextRepo);
        personRepositoryMock = createMock<PersonRepository>(PersonRepository);
        emailRepoMock = createMock<EmailRepo>(EmailRepo);
        emailResolverServiceMock = createMock<EmailResolverService>(EmailResolverService);
        sut = UserExternaldataWorkflowAggregate.createNew(
            dBiamPersonenkontextRepoMock,
            personRepositoryMock,
            configServiceMock,
            emailRepoMock,
            emailResolverServiceMock,
        );
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('initialize', () => {
        it('should initialize aggregate', async () => {
            const person: Person<true> = DoFactory.createPerson(true);

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([]);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(false);

            await sut.initialize(person.id);
            expect(sut.person).toBeDefined();
            expect(sut.checkedExternalPkData).toBeDefined();
        });

        it('should initialize aggregate with contextID using EmailMicroservice', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            const oxLoginId: string = faker.string.uuid();
            const oxContextId: string = 'test-context-id';

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([]);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(true);
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
            emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(Ok(response));

            await sut.initialize(person.id);
            expect(sut.person).toBeDefined();
            expect(sut.checkedExternalPkData).toBeDefined();
            expect(sut.oxLoginId).toBe(`${oxLoginId}@${oxContextId}`);
            expect(sut.email).toBe(emailAddress.address);
        });

        it('should initialize aggregate with contextID using email repo', async () => {
            const person: Person<true> = DoFactory.createPerson(true);

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([]);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(false);
            const emailAddress: string = faker.internet.email();

            const response: PersonEmailResponse = new PersonEmailResponse(EmailAddressStatus.ENABLED, emailAddress);
            emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(response);

            await sut.initialize(person.id);
            expect(sut.person).toBeDefined();
            expect(sut.checkedExternalPkData).toBeDefined();
            expect(sut.email).toBe(emailAddress);
        });

        it('should initialize aggregate with undefined email when repo email status is DISABLED', async () => {
            const person: Person<true> = DoFactory.createPerson(true);

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([]);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(false);

            const response: PersonEmailResponse = new PersonEmailResponse(
                EmailAddressStatus.DISABLED,
                faker.internet.email(),
            );

            emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(response);

            await sut.initialize(person.id);

            expect(sut.person).toBeDefined();
            expect(sut.checkedExternalPkData).toBeDefined();
            expect(sut.email).toBeUndefined();
        });

        it('should set email to undefined if user has no email', async () => {
            const person: Person<true> = DoFactory.createPerson(true);

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([]);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(true);

            emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(Ok(undefined));

            await sut.initialize(person.id);

            expect(sut.email).toBeUndefined();
        });

        it('should not set contextID and address when user has suspended email', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            const oxLoginId: string = faker.string.uuid();
            const oxContextId: string = 'test-context-id';

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([]);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(true);
            const emailAddress: EmailAddress<true> = DoFactory.createMicroserviceEmailAddress(true, {
                spshPersonId: person.id,
                externalId: oxLoginId,
                sortedStatuses: [{ status: EmailAddressStatusEnum.SUSPENDED }],
            });

            const response: EmailAddressResponse = new EmailAddressResponse(
                emailAddress,
                emailAddress.getStatus()!,
                oxContextId,
            );
            emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(Ok(response));

            await sut.initialize(person.id);
            expect(sut.person).toBeDefined();
            expect(sut.email).toBeUndefined();
            expect(sut.checkedExternalPkData).toBeDefined();
            expect(sut.oxLoginId).toBeUndefined();
        });

        it('should set oxLoginId but not email when status is DEACTIVE', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            const oxLoginId: string = faker.string.uuid();
            const oxContextId: string = 'test-context-id';

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([]);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(true);
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
            emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(Ok(response));

            await sut.initialize(person.id);
            expect(sut.person).toBeDefined();
            expect(sut.email).toBeUndefined();
            expect(sut.checkedExternalPkData).toBeDefined();
            expect(sut.oxLoginId).toBe(`${oxLoginId}@${oxContextId}`);
        });

        it('should return entity Not found error when person not found', async () => {
            personRepositoryMock.findById.mockResolvedValueOnce(undefined);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([]);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);

            const response: Option<DomainError> = await sut.initialize(faker.string.uuid());
            expect(response).toBeInstanceOf(DomainError);
        });

        it('should return Error from email microservice', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            const error: EmailAddressNotFoundError = new EmailAddressNotFoundError();

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([]);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(true);
            emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(Err(error));

            const response: Option<DomainError> = await sut.initialize(person.id);

            expect(response).toBe(error);
        });
    });

    describe('mergedExternalPkData', () => {
        const setup = (): { person: Person<true> } => {
            const person: Person<true> = DoFactory.createPerson(true);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);

            return { person };
        };

        it('should merge service providers for matching pkId', async () => {
            const { person }: { person: Person<true> } = setup();
            const externalPkData: RequiredExternalPkData[] = [
                {
                    pkId: 'pk1',
                    rolleId: 'rolle1',
                    serviceProvider: [DoFactory.createServiceProvider(true, { id: 'sp1', name: 'Provider 1' })],
                    rollenart: RollenArt.LEHR,
                    kennung: 'kennung1',
                },
            ];

            const erweitererSP: ErweiterterServiceProviderForPK = {
                personenkontext: DoFactory.createPersonenkontext(true, { id: 'pk1' }),
                serviceProvider: DoFactory.createServiceProvider(true, { id: 'sp2', name: 'Provider 2' }),
            };

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(externalPkData);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([erweitererSP]);

            await sut.initialize(person.id);

            expect(sut.mergedExternalPkData![0]!.serviceProvider).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: 'sp1', name: 'Provider 1' }),
                    expect.objectContaining({ id: 'sp2', name: 'Provider 2' }),
                ]),
            );
        });

        it('should not add duplicates when merging', async () => {
            const { person }: { person: Person<true> } = setup();
            const sp1: ServiceProvider<true> = DoFactory.createServiceProvider(true, { id: 'sp1', name: 'Provider 1' });
            const externalPkData: RequiredExternalPkData[] = [
                {
                    pkId: 'pk1',
                    rolleId: 'rolle1',
                    rollenart: RollenArt.LEHR,
                    kennung: faker.string.alpha(),
                    serviceProvider: [sp1],
                },
            ];

            const erweitererSP: ErweiterterServiceProviderForPK = {
                personenkontext: DoFactory.createPersonenkontext(true, { id: 'pk1' }),
                serviceProvider: sp1,
            };

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(externalPkData);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([erweitererSP]);

            await sut.initialize(person.id);

            expect(sut.mergedExternalPkData![0]!.serviceProvider).toHaveLength(1);
        });

        it('should handle empty personenKontextErweiterungen', async () => {
            const { person }: { person: Person<true> } = setup();
            const externalPkData: RequiredExternalPkData[] = [
                {
                    pkId: 'pk1',
                    rolleId: 'rolle1',
                    serviceProvider: [DoFactory.createServiceProvider(true, { id: 'sp1', name: 'Provider 1' })],
                    rollenart: RollenArt.LEHR,
                    kennung: faker.string.alpha(),
                },
            ];

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(externalPkData);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);

            await sut.initialize(person.id);

            expect(sut.mergedExternalPkData).toHaveLength(1);
            expect(sut.mergedExternalPkData![0]!.pkId).toBe('pk1');
            expect(sut.mergedExternalPkData![0]!.serviceProvider).toEqual(
                expect.arrayContaining([expect.objectContaining({ id: 'sp1', name: 'Provider 1' })]),
            );
        });

        it('should handle empty externalPkData', async () => {
            const { person }: { person: Person<true> } = setup();
            const erweitererSP: ErweiterterServiceProviderForPK = {
                personenkontext: DoFactory.createPersonenkontext(true, { id: 'pk1' }),
                serviceProvider: DoFactory.createServiceProvider(true, { id: 'sp1', name: 'Provider 1' }),
            };

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([]);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([erweitererSP]);

            await sut.initialize(person.id);

            expect(sut.mergedExternalPkData).toEqual([]);
        });

        it('should merge multiple service providers for same pkId', async () => {
            const { person }: { person: Person<true> } = setup();
            const externalPkData: RequiredExternalPkData[] = [
                {
                    pkId: 'pk1',
                    rolleId: 'rolle1',
                    serviceProvider: [DoFactory.createServiceProvider(true, { id: 'sp1', name: 'Provider 1' })],
                    rollenart: RollenArt.LEHR,
                    kennung: faker.string.alpha(),
                },
            ];

            const erweitererSP1: ErweiterterServiceProviderForPK = {
                personenkontext: DoFactory.createPersonenkontext(true, { id: 'pk1' }),
                serviceProvider: DoFactory.createServiceProvider(true, { id: 'sp2', name: 'Provider 2' }),
            };

            const erweitererSP2: ErweiterterServiceProviderForPK = {
                personenkontext: DoFactory.createPersonenkontext(true, { id: 'pk1' }),
                serviceProvider: DoFactory.createServiceProvider(true, { id: 'sp3', name: 'Provider 3' }),
            };

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(externalPkData);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([
                erweitererSP1,
                erweitererSP2,
            ]);

            await sut.initialize(person.id);

            expect(sut.mergedExternalPkData![0]!.serviceProvider).toHaveLength(3);
            expect(sut.mergedExternalPkData![0]!.serviceProvider.map((sp: ServiceProvider<true>) => sp.id)).toEqual([
                'sp1',
                'sp2',
                'sp3',
            ]);
        });
    });

    describe('externalPkDataWithVidisAngebotId', () => {
        const setup = (): { person: Person<true> } => {
            const person: Person<true> = DoFactory.createPerson(true);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);

            return { person };
        };

        it('should return pkData where at least one serviceProvider has vidisAngebotId', async () => {
            const { person }: { person: Person<true> } = setup();
            const externalPkData: RequiredExternalPkData[] = [
                {
                    pkId: 'pk1',
                    rolleId: 'rolle1',
                    serviceProvider: [
                        createMock<ServiceProvider<true>>(ServiceProvider<true>, {
                            id: 'sp1',
                            name: 'Provider 1',
                            vidisAngebotId: 'vidis-123',
                        }),
                    ],
                    rollenart: RollenArt.LEHR,
                    kennung: faker.string.alpha(),
                },
                {
                    pkId: 'pk2',
                    rolleId: 'rolle2',
                    serviceProvider: [
                        createMock<ServiceProvider<true>>(ServiceProvider<true>, {
                            id: 'sp2',
                            name: 'Provider 2',
                        }),
                    ],
                    rollenart: RollenArt.LEHR,
                    kennung: faker.string.alpha(),
                },
            ];

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(externalPkData);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);

            await sut.initialize(person.id);

            expect(sut.externalPkDataWithVidisAngebotId).toHaveLength(1);
            expect(sut.externalPkDataWithVidisAngebotId![0]!.pkId).toBe('pk1');
        });

        it('should return empty array if no serviceProvider has vidisAngebotId', async () => {
            const { person }: { person: Person<true> } = setup();
            const externalPkData: RequiredExternalPkData[] = [
                {
                    pkId: 'pk1',
                    rolleId: 'rolle1',
                    serviceProvider: [
                        createMock<ServiceProvider<true>>(ServiceProvider<true>, {
                            id: 'sp1',
                            name: 'Provider 1',
                            vidisAngebotId: undefined,
                        }),
                    ],
                    rollenart: RollenArt.LEHR,
                    kennung: faker.string.alpha(),
                },
                {
                    pkId: 'pk2',
                    rolleId: 'rolle2',
                    serviceProvider: [
                        createMock<ServiceProvider<true>>(ServiceProvider<true>, {
                            id: 'sp2',
                            name: 'Provider 2',
                            vidisAngebotId: undefined,
                        }),
                    ],
                    rollenart: RollenArt.LEHR,
                    kennung: faker.string.alpha(),
                },
            ];

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(externalPkData);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);

            await sut.initialize(person.id);

            expect(sut.externalPkDataWithVidisAngebotId).toEqual([]);
        });

        it('should handle empty externalPkData array', async () => {
            const { person }: { person: Person<true> } = setup();

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([]);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);

            await sut.initialize(person.id);

            expect(sut.externalPkDataWithVidisAngebotId).toEqual([]);
        });

        it('should include pkData if multiple serviceProviders and one has vidisAngebotId', async () => {
            const { person }: { person: Person<true> } = setup();
            const externalPkData: RequiredExternalPkData[] = [
                {
                    pkId: 'pk1',
                    rolleId: 'rolle1',
                    serviceProvider: [
                        createMock<ServiceProvider<true>>(ServiceProvider<true>, {
                            id: 'sp1',
                            name: 'Provider 1',
                            vidisAngebotId: undefined,
                        }),
                        createMock<ServiceProvider<true>>(ServiceProvider<true>, {
                            id: 'sp2',
                            name: 'Provider 2',
                            vidisAngebotId: 'vidis-456',
                        }),
                    ],
                    rollenart: RollenArt.LEHR,
                    kennung: faker.string.alpha(),
                },
            ];

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(externalPkData);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);

            await sut.initialize(person.id);

            expect(sut.externalPkDataWithVidisAngebotId).toHaveLength(1);
            expect(sut.externalPkDataWithVidisAngebotId![0]!.pkId).toBe('pk1');
        });

        it('should ignore falsy values like empty string for vidisAngebotId', async () => {
            const { person }: { person: Person<true> } = setup();
            const externalPkData: RequiredExternalPkData[] = [
                {
                    pkId: 'pk1',
                    rolleId: 'rolle1',
                    serviceProvider: [
                        createMock<ServiceProvider<true>>(ServiceProvider<true>, {
                            id: 'sp1',
                            name: 'Provider 1',
                            vidisAngebotId: '',
                        }),
                    ],
                    rollenart: RollenArt.LEHR,
                    kennung: faker.string.alpha(),
                },
            ];

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(externalPkData);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);

            await sut.initialize(person.id);

            expect(sut.externalPkDataWithVidisAngebotId).toEqual([]);
        });
    });

    describe('oxParams', () => {
        it('should return oxParams with oxLoginId when using email microservice', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            const oxLoginId: string = faker.string.uuid();
            const oxContextId: string = 'test-context-id';

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([]);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);

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
            emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(Ok(response));

            await sut.initialize(person.id);

            expect(sut.oxParams).toEqual({ oxLoginId: `${oxLoginId}@${oxContextId}` });
        });

        it('should return oxParams with contextId and username when using old email system with EMAIL service provider', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            const externalPkData: RequiredExternalPkData[] = [
                createRequiredExternalPkData({
                    serviceProvider: [
                        DoFactory.createServiceProvider(true, {
                            externalSystem: ServiceProviderSystem.EMAIL,
                        }),
                    ],
                }),
            ];

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(externalPkData);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);

            await sut.initialize(person.id);

            expect(sut.oxParams).toEqual({
                contextId: sut.contextID,
                username: person.username,
            });
        });

        it('should return undefined oxParams when using old email system without EMAIL service provider', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            const externalPkData: RequiredExternalPkData[] = [
                createRequiredExternalPkData({
                    serviceProvider: [
                        DoFactory.createServiceProvider(true, {
                            externalSystem: ServiceProviderSystem.NONE,
                        }),
                    ],
                }),
            ];

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(externalPkData);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);

            await sut.initialize(person.id);

            expect(sut.oxParams).toBeUndefined();
        });

        it('should return undefined oxParams when using email microservice but no email exists', async () => {
            const person: Person<true> = DoFactory.createPerson(true);

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce([]);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);
            emailResolverServiceMock.findEmailBySpshPersonAsEmailAddressResponse.mockResolvedValueOnce(Ok(undefined));

            await sut.initialize(person.id);

            expect(sut.oxParams).toBeUndefined();
        });
    });

    describe('multipleRollenarten', () => {
        it('should return MultipleRollenartenError when person has multiple different rollenarten', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            const externalPkData: RequiredExternalPkData[] = [
                createRequiredExternalPkData({ rollenart: RollenArt.LEHR }),
                createRequiredExternalPkData({ rollenart: RollenArt.LERN }),
            ];

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(externalPkData);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);

            const result: Option<DomainError> = await sut.initialize(person.id);

            expect(result).toBeInstanceOf(MultipleRollenartenError);
        });
    });

    describe('checkedExternalPkData filtering', () => {
        it('should filter out invalid ExternalPkData entries with missing kennung', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            const invalidExternalPkData: ExternalPkData[] = [
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: undefined, // missing kennung
                    serviceProvider: [],
                },
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: faker.string.alpha(), // valid entry
                    serviceProvider: [],
                },
            ];

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(invalidExternalPkData);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);

            await sut.initialize(person.id);

            expect(sut.checkedExternalPkData).toHaveLength(1);
        });
    });

    describe('polytheaDienststellenNummern', () => {
        const setup = (): { person: Person<true> } => {
            const person: Person<true> = DoFactory.createPerson(true);
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);

            return { person };
        };

        it('should include kennung when pk has Polythea service provider', async () => {
            const { person }: { person: Person<true> } = setup();
            const externalPkData: RequiredExternalPkData[] = [
                createRequiredExternalPkData({
                    kennung: 'poly-kennung',
                    serviceProvider: [
                        DoFactory.createServiceProvider(true, {
                            id: POLYTHEA_SERVICE_PROVIDER_ID,
                        }),
                    ],
                }),
                createRequiredExternalPkData({
                    kennung: 'non-poly-kennung',
                    serviceProvider: [
                        DoFactory.createServiceProvider(true, {
                            id: faker.string.uuid(),
                        }),
                    ],
                }),
            ];

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(externalPkData);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);

            await sut.initialize(person.id);

            expect(sut.polytheaDienststellenNummern).toEqual(['poly-kennung']);
        });

        it('should return empty list when no Polythea service provider is present', async () => {
            const { person }: { person: Person<true> } = setup();
            const externalPkData: RequiredExternalPkData[] = [
                createRequiredExternalPkData({
                    kennung: 'kennung-1',
                    serviceProvider: [
                        DoFactory.createServiceProvider(true, {
                            id: faker.string.uuid(),
                        }),
                    ],
                }),
            ];

            personRepositoryMock.findById.mockResolvedValueOnce(person);
            dBiamPersonenkontextRepoMock.findExternalPkData.mockResolvedValueOnce(externalPkData);
            dBiamPersonenkontextRepoMock.findErweiterteSPByPersonId.mockResolvedValueOnce([]);

            await sut.initialize(person.id);

            expect(sut.polytheaDienststellenNummern).toEqual([]);
        });

        it('should filter out undefined kennung values in private method result', () => {
            const polytheaPkData: ExternalPkData[] = [
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: undefined,
                    serviceProvider: [
                        DoFactory.createServiceProvider(true, {
                            id: POLYTHEA_SERVICE_PROVIDER_ID,
                        }),
                    ],
                },
                {
                    pkId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                    kennung: 'poly-kennung',
                    serviceProvider: [
                        DoFactory.createServiceProvider(true, {
                            id: POLYTHEA_SERVICE_PROVIDER_ID,
                        }),
                    ],
                },
            ];

            const result: string[] = (
                sut as unknown as {
                    computePolytheaDienststellenNummern: (checkedExternalPkData: ExternalPkData[]) => string[];
                }
            ).computePolytheaDienststellenNummern(polytheaPkData);

            expect(result).toEqual(['poly-kennung']);
        });
    });
});
