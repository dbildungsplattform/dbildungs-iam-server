import { faker } from '@faker-js/faker';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';

import { DoFactory } from '../../../../test/utils/do-factory.js';
import {
    EmailResolverService,
    type PersonIdWithEmailResponse,
} from '../../email-microservice/domain/email-resolver.service.js';
import { EmailAddressStatus } from '../../email/domain/email-address.js';
import { type UserLock } from '../../keycloak-administration/domain/user-lock.js';
import { UserLockRepository } from '../../keycloak-administration/repository/user-lock.repository.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { type Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import {
    DBiamPersonenkontextRepo,
    type KontextWithOrgaAndRolle,
} from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { type PersonEmailResponse } from '../api/person-email-response.js';
import { type PersonLandesbediensteterSearchResponse } from '../api/person-landesbediensteter-search.response.js';
import { LandesbediensteterSearchMultiplePersonsFoundError } from '../domain/landesbediensteter-search-multiple-persons-found.error.js';
import { LandesbediensteterSearchNoPersonFoundError } from '../domain/landesbediensteter-search-no-person-found.error.js';
import { PersonLockOccasion } from '../domain/person.enums.js';
import { type Person } from '../domain/person.js';
import { PersonRepository } from '../persistence/person.repository.js';
import { PersonLandesbediensteterSearchService } from './person-landesbediensteter-search.service.js';

describe('PersonLandesbediensteterSearchService', () => {
    let module: TestingModule;
    let sut: PersonLandesbediensteterSearchService;

    let personRepositoryMock: DeepMocked<PersonRepository>;
    let personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let userLockRepositoryMock: DeepMocked<UserLockRepository>;
    let emailResolverServiceMock: DeepMocked<EmailResolverService>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                PersonLandesbediensteterSearchService,
                { provide: PersonRepository, useValue: createMock(PersonRepository) },
                { provide: DBiamPersonenkontextRepo, useValue: createMock(DBiamPersonenkontextRepo) },
                { provide: UserLockRepository, useValue: createMock(UserLockRepository) },
                { provide: EmailResolverService, useValue: createMock(EmailResolverService) },
            ],
        }).compile();

        sut = module.get(PersonLandesbediensteterSearchService);
        personRepositoryMock = module.get(PersonRepository);
        personenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        userLockRepositoryMock = module.get(UserLockRepository);
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

        it('should return an empty array without a lookup if username is empty', async () => {
            const result: PersonLandesbediensteterSearchResponse[] = await sut.findLandesbediensteter(
                undefined,
                undefined,
                '',
            );

            expect(result).toEqual([]);
            expect(personRepositoryMock.findByUsername).not.toHaveBeenCalled();
            expect(emailResolverServiceMock.findEmailBySpshPerson).not.toHaveBeenCalled();
            expect(personenkontextRepoMock.findByPersonWithOrgaAndRolle).not.toHaveBeenCalled();
        });

        it('should trim personalnummer before looking up persons', async () => {
            personRepositoryMock.findByPersonalnummer.mockResolvedValueOnce([]);

            const result: PersonLandesbediensteterSearchResponse[] = await sut.findLandesbediensteter(' 12345 ');

            expect(result).toEqual([]);
            expect(personRepositoryMock.findByPersonalnummer).toHaveBeenCalledWith('12345');
        });

        it('should trim username before looking up persons', async () => {
            personRepositoryMock.findByUsername.mockResolvedValueOnce([]);

            const result: PersonLandesbediensteterSearchResponse[] = await sut.findLandesbediensteter(
                undefined,
                undefined,
                ' username ',
            );

            expect(result).toEqual([]);
            expect(personRepositoryMock.findByUsername).toHaveBeenCalledWith('username');
        });

        it('should trim email address before resolving the person', async () => {
            emailResolverServiceMock.findByPrimaryAddress.mockResolvedValueOnce(undefined);

            const result: PersonLandesbediensteterSearchResponse[] = await sut.findLandesbediensteter(
                undefined,
                ' person@example.com ',
            );

            expect(result).toEqual([]);
            expect(emailResolverServiceMock.findByPrimaryAddress).toHaveBeenCalledWith('person@example.com');
            expect(personRepositoryMock.findById).not.toHaveBeenCalled();
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
            emailResolverServiceMock.findEmailBySpshPerson.mockResolvedValueOnce(email);
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
            emailResolverServiceMock.findEmailBySpshPerson.mockResolvedValueOnce(email);
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
            emailResolverServiceMock.findEmailBySpshPerson.mockResolvedValueOnce(email);
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
            emailResolverServiceMock.findEmailBySpshPerson.mockResolvedValueOnce(undefined);
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
            emailResolverServiceMock.findEmailBySpshPerson.mockResolvedValueOnce(email);
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

        it('should return valid response if person is found and valid by emailaddress', async () => {
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
            emailResolverServiceMock.findByPrimaryAddress.mockResolvedValueOnce({
                personId: person.id,
                personEmailResponse: email,
            } satisfies PersonIdWithEmailResponse);
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            userLockRepositoryMock.findByPersonId.mockResolvedValueOnce([]);
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

        it('should reuse the resolved email if spshPersonId is found', async () => {
            const email: PersonEmailResponse = {
                address: faker.internet.email(),
                status: faker.helpers.enumValue(EmailAddressStatus),
            };
            const mockedSpshPersonId: string = faker.string.uuid();
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
            expect(personRepositoryMock.findById).toHaveBeenCalledWith(mockedSpshPersonId);
            expect(result[0]?.primaryEmailAddress).toEqual(email.address);
            expect(emailResolverServiceMock.findEmailBySpshPerson).not.toHaveBeenCalled();
            expect(result[0]?.personenkontexte.length).toEqual(1);
        });

        it('should return valid response with email from email resolver service if person is found by personalnummer', async () => {
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
            expect(result[0]?.personenkontexte.length).toEqual(1);
        });

        it('should return valid response with email from email resolver service if person is found by username', async () => {
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
            expect(result[0]?.personenkontexte.length).toEqual(1);
        });

        it('should return valid response with email from email resolver service if person is found by fullname', async () => {
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
            expect(result[0]?.personenkontexte.length).toEqual(1);
        });

        it('should return an empty array if spshPersonId is not found for given mail', async () => {
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
            emailResolverServiceMock.findEmailBySpshPerson.mockResolvedValueOnce(email);
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

        it('should return an empty array if spshPersonId is found for given mail but person does not exist in spsh anymore', async () => {
            const mockedSpshPersonId: string = faker.string.uuid();
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
            emailResolverServiceMock.findEmailBySpshPerson.mockResolvedValueOnce(email);
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
            expect(personRepositoryMock.findByFullName).toHaveBeenCalledWith('Max', 'Mustermann');
            expect(result[0]?.primaryEmailAddress).toEqual(email.address);
            expect(result[0]?.personenkontexte.length).toEqual(1);
        });
    });
});
