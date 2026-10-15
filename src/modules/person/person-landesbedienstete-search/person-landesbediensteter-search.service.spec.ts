import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { faker } from '@faker-js/faker';

import { PersonLandesbediensteterSearchService } from './person-landesbediensteter-search.service.js';
import { PersonRepository } from '../persistence/person.repository.js';
import {
    DBiamPersonenkontextRepo,
    type KontextWithOrgaAndRolle,
} from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { EmailRepo } from '../../email/persistence/email.repo.js';
import { UserLockRepository } from '../../keycloak-administration/repository/user-lock.repository.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { type UserLock } from '../../keycloak-administration/domain/user-lock.js';
import { PersonLockOccasion } from '../domain/person.enums.js';
import { LandesbediensteterSearchNoPersonFoundError } from '../domain/landesbediensteter-search-no-person-found.error.js';
import { LandesbediensteterSearchMultiplePersonsFoundError } from '../domain/landesbediensteter-search-multiple-persons-found.error.js';
import { type Person } from '../domain/person.js';
import { EmailAddressStatus } from '../../email/domain/email-address.js';
import { type PersonEmailResponse } from '../api/person-email-response.js';
import { type PersonLandesbediensteterSearchResponse } from '../api/person-landesbediensteter-search.response.js';
import { type Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import {
    EmailResolverService,
    type PersonIdWithEmailResponse,
} from '../../email-microservice/domain/email-resolver.service.js';

describe('PersonLandesbediensteterSearchService', () => {
    let module: TestingModule;
    let sut: PersonLandesbediensteterSearchService;

    let personRepositoryMock: DeepMocked<PersonRepository>;
    let personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let emailRepoMock: DeepMocked<EmailRepo>;
    let userLockRepositoryMock: DeepMocked<UserLockRepository>;
    let emailResolverServiceMock: DeepMocked<EmailResolverService>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                PersonLandesbediensteterSearchService,
                { provide: PersonRepository, useValue: createMock(PersonRepository) },
                { provide: DBiamPersonenkontextRepo, useValue: createMock(DBiamPersonenkontextRepo) },
                { provide: EmailRepo, useValue: createMock(EmailRepo) },
                { provide: UserLockRepository, useValue: createMock(UserLockRepository) },
                { provide: EmailResolverService, useValue: createMock(EmailResolverService) },
            ],
        }).compile();

        sut = module.get(PersonLandesbediensteterSearchService);
        personRepositoryMock = module.get(PersonRepository);
        personenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        emailRepoMock = module.get(EmailRepo);
        userLockRepositoryMock = module.get(UserLockRepository);
        emailResolverServiceMock = module.get(EmailResolverService);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('findLandesbediensteter', () => {
        it('should throw if more than one param is defined', async () => {
            await expect(
                sut.findLandesbediensteter(faker.string.uuid(), faker.internet.email(), undefined, undefined),
            ).rejects.toThrow(LandesbediensteterSearchNoPersonFoundError);
        });

        it('should throw if no param is defined', async () => {
            await expect(sut.findLandesbediensteter()).rejects.toThrow(LandesbediensteterSearchNoPersonFoundError);
        });

        it('should return an empty array if no person found', async () => {
            personRepositoryMock.findByUsername.mockResolvedValueOnce([]);
            const result: PersonLandesbediensteterSearchResponse[] = await sut.findLandesbediensteter(
                undefined,
                undefined,
                faker.internet.username(),
                undefined,
            );
            expect(result).toEqual([]);
        });

        it('should throw if multiple persons found', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            personRepositoryMock.findByUsername.mockResolvedValueOnce([person, person]);
            await expect(
                sut.findLandesbediensteter(undefined, undefined, faker.internet.username(), undefined),
            ).rejects.toThrow(LandesbediensteterSearchMultiplePersonsFoundError);
        });

        it('should throw if person has no personalnummer', async () => {
            const person: Person<true> = DoFactory.createPerson(true, { personalnummer: undefined });
            personRepositoryMock.findByUsername.mockResolvedValueOnce([person]);
            userLockRepositoryMock.findByPersonId.mockResolvedValueOnce([]);
            await expect(
                sut.findLandesbediensteter(undefined, undefined, faker.internet.username(), undefined),
            ).rejects.toThrow(LandesbediensteterSearchNoPersonFoundError);
        });

        it('should throw if person is locked manually', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            personRepositoryMock.findByUsername.mockResolvedValueOnce([person]);
            userLockRepositoryMock.findByPersonId.mockResolvedValueOnce([
                { locked_occasion: PersonLockOccasion.MANUELL_GESPERRT } as UserLock,
            ]);
            await expect(
                sut.findLandesbediensteter(undefined, undefined, faker.internet.username(), undefined),
            ).rejects.toThrow(LandesbediensteterSearchNoPersonFoundError);
        });

        it('should throw error if fullname is provided but is not valid because only vorname provided', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            person.personalnummer = faker.string.alphanumeric(5);
            const email: PersonEmailResponse = {
                address: faker.internet.email(),
                status: faker.helpers.enumValue(EmailAddressStatus),
            };
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga);
                },
            });
            const kontexte: Array<KontextWithOrgaAndRolle> = [
                {
                    personenkontext: kontext,
                    organisation: orga,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ];
            personRepositoryMock.findByUsername.mockResolvedValueOnce([person]);
            userLockRepositoryMock.findByPersonId.mockResolvedValueOnce([]);
            emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(email);
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce(kontexte);
            await expect(sut.findLandesbediensteter(undefined, undefined, undefined, 'onlyvorname')).rejects.toThrow(
                LandesbediensteterSearchNoPersonFoundError,
            );
        });

        it('should throw error if fullname is provided but is not valid because only familienname provided', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            person.personalnummer = faker.string.alphanumeric(5);
            const email: PersonEmailResponse = {
                address: faker.internet.email(),
                status: faker.helpers.enumValue(EmailAddressStatus),
            };
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga);
                },
            });
            const kontexte: Array<KontextWithOrgaAndRolle> = [
                {
                    personenkontext: kontext,
                    organisation: orga,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ];
            personRepositoryMock.findByUsername.mockResolvedValueOnce([person]);
            userLockRepositoryMock.findByPersonId.mockResolvedValueOnce([]);
            emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(email);
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce(kontexte);
            await expect(
                sut.findLandesbediensteter(undefined, undefined, undefined, undefined, 'onlyfamilienname'),
            ).rejects.toThrow(LandesbediensteterSearchNoPersonFoundError);
        });

        it('should return valid response if person is found and valid by personalnummer', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            person.personalnummer = faker.string.alphanumeric(5);
            const email: PersonEmailResponse = {
                address: faker.internet.email(),
                status: faker.helpers.enumValue(EmailAddressStatus),
            };
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga);
                },
            });
            const kontexte: Array<KontextWithOrgaAndRolle> = [
                {
                    personenkontext: kontext,
                    organisation: orga,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ];
            personRepositoryMock.findByPersonalnummer.mockResolvedValueOnce([person]);
            userLockRepositoryMock.findByPersonId.mockResolvedValueOnce([]);
            emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(email);
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce(kontexte);

            const result: PersonLandesbediensteterSearchResponse[] = await sut.findLandesbediensteter(
                person.personalnummer,
                undefined,
                undefined,
                undefined,
            );

            expect(result).toBeDefined();
            expect(result[0]?.primaryEmailAddress).toEqual(email.address);
            expect(result[0]?.personenkontexte.length).toEqual(1);
        });

        it('should pass undefined primaryEmailAddress if resolved email is undefined', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            person.personalnummer = faker.string.alphanumeric(5);
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga);
                },
            });
            const kontexte: Array<KontextWithOrgaAndRolle> = [
                {
                    personenkontext: kontext,
                    organisation: orga,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ];
            personRepositoryMock.findByPersonalnummer.mockResolvedValueOnce([person]);
            userLockRepositoryMock.findByPersonId.mockResolvedValueOnce([]);
            emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(undefined);
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce(kontexte);

            const result: PersonLandesbediensteterSearchResponse[] = await sut.findLandesbediensteter(
                person.personalnummer,
                undefined,
                undefined,
                undefined,
            );

            expect(result).toBeDefined();
            expect(result[0]?.primaryEmailAddress).toBeUndefined();
            expect(result[0]?.personenkontexte.length).toEqual(1);
        });

        it('should return valid response if person is found and valid by username', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            const email: PersonEmailResponse = {
                address: faker.internet.email(),
                status: faker.helpers.enumValue(EmailAddressStatus),
            };
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga);
                },
            });
            const kontexte: Array<KontextWithOrgaAndRolle> = [
                {
                    personenkontext: kontext,
                    organisation: orga,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ];
            personRepositoryMock.findByUsername.mockResolvedValueOnce([person]);
            userLockRepositoryMock.findByPersonId.mockResolvedValueOnce([]);
            emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(email);
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce(kontexte);

            const result: PersonLandesbediensteterSearchResponse[] = await sut.findLandesbediensteter(
                undefined,
                undefined,
                faker.internet.username(),
                undefined,
            );

            expect(result).toBeDefined();
            expect(result[0]?.primaryEmailAddress).toEqual(email.address);
            expect(result[0]?.personenkontexte.length).toEqual(1);
        });

        it('should return valid response if person is found and valid by emailaddress when email resolver service is disabled', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            person.personalnummer = faker.string.alphanumeric(5);
            const email: PersonEmailResponse = {
                address: faker.internet.email(),
                status: faker.helpers.enumValue(EmailAddressStatus),
            };
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga);
                },
            });
            const kontexte: Array<KontextWithOrgaAndRolle> = [
                {
                    personenkontext: kontext,
                    organisation: orga,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ];
            personRepositoryMock.findByPrimaryEmailAddress.mockResolvedValueOnce([person]);
            userLockRepositoryMock.findByPersonId.mockResolvedValueOnce([]);
            emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(email);
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce(kontexte);

            const result: PersonLandesbediensteterSearchResponse[] = await sut.findLandesbediensteter(
                undefined,
                faker.internet.email(),
                undefined,
                undefined,
            );

            expect(result).toBeDefined();
            expect(result[0]?.primaryEmailAddress).toEqual(email.address);
            expect(result[0]?.personenkontexte.length).toEqual(1);
        });

        it('should return valid response if email resolver service is enabled and spshPersonId is found', async () => {
            const email: PersonEmailResponse = {
                address: faker.internet.email(),
                status: faker.helpers.enumValue(EmailAddressStatus),
            };
            const mockedSpshPersonId: string = faker.string.uuid();
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);
            emailResolverServiceMock.findByPrimaryAddress.mockResolvedValueOnce({
                personId: mockedSpshPersonId,
                personEmailResponse: email,
            } satisfies PersonIdWithEmailResponse);
            const person: Person<true> = DoFactory.createPerson(true);
            person.personalnummer = faker.string.alphanumeric(5);
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga);
                },
            });
            const kontexte: Array<KontextWithOrgaAndRolle> = [
                {
                    personenkontext: kontext,
                    organisation: orga,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ];
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            userLockRepositoryMock.findByPersonId.mockResolvedValueOnce([]);
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce(kontexte);

            const address: string = faker.internet.email();

            const result: PersonLandesbediensteterSearchResponse[] = await sut.findLandesbediensteter(
                undefined,
                address,
                undefined,
                undefined,
            );

            expect(result).toBeDefined();
            expect(emailResolverServiceMock.findByPrimaryAddress).toHaveBeenCalledWith(address);
            expect(result[0]?.primaryEmailAddress).toEqual(email.address);
            expect(emailRepoMock.getEmailAddressAndStatusForPerson).not.toHaveBeenCalled();
            expect(result[0]?.personenkontexte.length).toEqual(1);
        });

        it('should return valid response with email from email resolver service if person is found by personalnummer', async () => {
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);
            const person: Person<true> = DoFactory.createPerson(true);
            person.personalnummer = faker.string.alphanumeric(5);
            const email: PersonEmailResponse = {
                address: faker.internet.email(),
                status: faker.helpers.enumValue(EmailAddressStatus),
            };
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga);
                },
            });
            const kontexte: Array<KontextWithOrgaAndRolle> = [
                {
                    personenkontext: kontext,
                    organisation: orga,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ];
            personRepositoryMock.findByPersonalnummer.mockResolvedValueOnce([person]);
            userLockRepositoryMock.findByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.findEmailBySpshPerson.mockResolvedValueOnce(email);
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce(kontexte);

            const result: PersonLandesbediensteterSearchResponse[] = await sut.findLandesbediensteter(
                person.personalnummer,
                undefined,
                undefined,
                undefined,
            );

            expect(result).toBeDefined();
            expect(emailResolverServiceMock.findEmailBySpshPerson).toHaveBeenCalledWith(person.id);
            expect(result[0]?.primaryEmailAddress).toEqual(email.address);
            expect(emailRepoMock.getEmailAddressAndStatusForPerson).not.toHaveBeenCalled();
            expect(result[0]?.personenkontexte.length).toEqual(1);
        });

        it('should return valid response with email from email resolver service if person is found by username', async () => {
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);
            const person: Person<true> = DoFactory.createPerson(true);
            person.personalnummer = faker.string.alphanumeric(5);
            const email: PersonEmailResponse = {
                address: faker.internet.email(),
                status: faker.helpers.enumValue(EmailAddressStatus),
            };
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga);
                },
            });
            const kontexte: Array<KontextWithOrgaAndRolle> = [
                {
                    personenkontext: kontext,
                    organisation: orga,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ];
            personRepositoryMock.findByUsername.mockResolvedValueOnce([person]);
            userLockRepositoryMock.findByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.findEmailBySpshPerson.mockResolvedValueOnce(email);
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce(kontexte);

            const username: string = faker.internet.username();
            const result: PersonLandesbediensteterSearchResponse[] = await sut.findLandesbediensteter(
                undefined,
                undefined,
                username,
                undefined,
            );

            expect(result).toBeDefined();
            expect(emailResolverServiceMock.findEmailBySpshPerson).toHaveBeenCalledWith(person.id);
            expect(result[0]?.primaryEmailAddress).toEqual(email.address);
            expect(emailRepoMock.getEmailAddressAndStatusForPerson).not.toHaveBeenCalled();
            expect(result[0]?.personenkontexte.length).toEqual(1);
        });

        it('should return valid response with email from email resolver service if person is found by fullname', async () => {
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);
            const person: Person<true> = DoFactory.createPerson(true);
            person.personalnummer = faker.string.alphanumeric(5);
            const email: PersonEmailResponse = {
                address: faker.internet.email(),
                status: faker.helpers.enumValue(EmailAddressStatus),
            };
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga);
                },
            });
            const kontexte: Array<KontextWithOrgaAndRolle> = [
                {
                    personenkontext: kontext,
                    organisation: orga,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ];
            personRepositoryMock.findByFullName.mockResolvedValueOnce([person]);
            userLockRepositoryMock.findByPersonId.mockResolvedValueOnce([]);
            emailResolverServiceMock.findEmailBySpshPerson.mockResolvedValueOnce(email);
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce(kontexte);

            const result: PersonLandesbediensteterSearchResponse[] = await sut.findLandesbediensteter(
                undefined,
                undefined,
                undefined,
                'Max',
                'Mustermann',
            );

            expect(result).toBeDefined();
            expect(emailResolverServiceMock.findEmailBySpshPerson).toHaveBeenCalledWith(person.id);
            expect(result[0]?.primaryEmailAddress).toEqual(email.address);
            expect(emailRepoMock.getEmailAddressAndStatusForPerson).not.toHaveBeenCalled();
            expect(result[0]?.personenkontexte.length).toEqual(1);
        });

        it('should return an empty array if email resolver service is enabled and spshPersonId is not found for given mail', async () => {
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);
            emailResolverServiceMock.findByPrimaryAddress.mockResolvedValueOnce(undefined);
            const person: Person<true> = DoFactory.createPerson(true);
            person.personalnummer = faker.string.alphanumeric(5);
            const email: PersonEmailResponse = {
                address: faker.internet.email(),
                status: faker.helpers.enumValue(EmailAddressStatus),
            };
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga);
                },
            });
            const kontexte: Array<KontextWithOrgaAndRolle> = [
                {
                    personenkontext: kontext,
                    organisation: orga,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ];
            personRepositoryMock.findByUsername.mockResolvedValueOnce([person]);
            userLockRepositoryMock.findByPersonId.mockResolvedValueOnce([]);
            emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(email);
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce(kontexte);

            const address: string = faker.internet.email();

            const result: PersonLandesbediensteterSearchResponse[] = await sut.findLandesbediensteter(
                undefined,
                address,
                undefined,
                undefined,
            );

            expect(result).toBeDefined();
            expect(emailResolverServiceMock.findByPrimaryAddress).toHaveBeenCalledWith(address);
            expect(result.length).toEqual(0);
        });

        it('should return an empty array if email resolver service is enabled and spshPersonId is found for given mail but person doesnt exists in spsh anymore', async () => {
            const mockedSpshPersonId: string = faker.string.uuid();
            emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(true);
            emailResolverServiceMock.findByPrimaryAddress.mockResolvedValueOnce({
                personId: mockedSpshPersonId,
            } as PersonIdWithEmailResponse);
            const person: Person<true> = DoFactory.createPerson(true);
            person.personalnummer = faker.string.alphanumeric(5);
            const email: PersonEmailResponse = {
                address: faker.internet.email(),
                status: faker.helpers.enumValue(EmailAddressStatus),
            };
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga);
                },
            });
            const kontexte: Array<KontextWithOrgaAndRolle> = [
                {
                    personenkontext: kontext,
                    organisation: orga,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ];
            personRepositoryMock.findById.mockResolvedValueOnce(undefined);
            userLockRepositoryMock.findByPersonId.mockResolvedValueOnce([]);
            emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(email);
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce(kontexte);

            const address: string = faker.internet.email();

            const result: PersonLandesbediensteterSearchResponse[] = await sut.findLandesbediensteter(
                undefined,
                address,
                undefined,
                undefined,
            );

            expect(result).toBeDefined();
            expect(emailResolverServiceMock.findByPrimaryAddress).toHaveBeenCalledWith(address);
            expect(result.length).toEqual(0);
        });

        it('should return valid response if person is found and valid by fullname', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            person.personalnummer = faker.string.alphanumeric(5);
            const email: PersonEmailResponse = {
                address: faker.internet.email(),
                status: faker.helpers.enumValue(EmailAddressStatus),
            };
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                loeschungZeitpunkt: new Date(),
                getRolle: () => Promise.resolve(rolle),
                getOrganisation() {
                    return Promise.resolve(orga);
                },
            });
            const kontexte: Array<KontextWithOrgaAndRolle> = [
                {
                    personenkontext: kontext,
                    organisation: orga,
                    rolle: rolle,
                } satisfies KontextWithOrgaAndRolle,
            ];
            personRepositoryMock.findByFullName.mockResolvedValueOnce([person]);
            userLockRepositoryMock.findByPersonId.mockResolvedValueOnce([]);
            emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(email);
            personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce(kontexte);

            const result: PersonLandesbediensteterSearchResponse[] = await sut.findLandesbediensteter(
                undefined,
                undefined,
                undefined,
                'Max',
                'Mustermann',
            );

            expect(result).toBeDefined();
            expect(personRepositoryMock.findByFullName).toHaveBeenCalledWith('Max', 'Mustermann');
            expect(result[0]?.primaryEmailAddress).toEqual(email.address);
            expect(result[0]?.personenkontexte.length).toEqual(1);
        });
    });
});
