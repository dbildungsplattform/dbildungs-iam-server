import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';

import { faker } from '@faker-js/faker';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { EmailRepo } from '../persistence/email.repo.js';
import { EmailFactory } from './email.factory.js';
import { EmailAddress, EmailAddressStatus } from './email-address.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { Person } from '../../person/domain/person.js';
import { EntityNotFoundError, InvalidNameError } from '../../../shared/error/index.js';
import { EmailGenerator } from './email-generator.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { EmailDomainNotFoundError } from '../error/email-domain-not-found.error.js';
import assert from 'assert';
import { DoFactory } from '../../../../test/utils/do-factory.js';

describe('EmailFactory', () => {
    let module: TestingModule;
    let sut: EmailFactory;
    let personRepositoryMock: DeepMocked<PersonRepository>;
    let organisationRepositoryMock: DeepMocked<OrganisationRepository>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                EmailFactory,
                {
                    provide: EmailRepo,
                    useValue: createMock(EmailRepo),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
            ],
        }).compile();
        personRepositoryMock = module.get(PersonRepository);
        organisationRepositoryMock = module.get(OrganisationRepository);

        sut = module.get(EmailFactory);
    });

    function getPerson(): Person<true> {
        return Person.construct(
            faker.string.uuid(),
            faker.date.past(),
            faker.date.recent(),
            faker.person.lastName(),
            faker.person.firstName(),
            '1',
            faker.lorem.word(),
            faker.lorem.word(),
            faker.string.uuid(),
        );
    }

    afterAll(async () => {
        await module.close();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('construct', () => {
        describe('when constructing', () => {
            it('should return Email', () => {
                const personId: string = faker.string.uuid();
                const emailAddressId: string = faker.string.uuid();
                const address: string = faker.internet.email();
                const email: EmailAddress<true> = sut.construct(
                    emailAddressId,
                    faker.date.past(),
                    faker.date.recent(),
                    personId,
                    address,
                    EmailAddressStatus.ENABLED,
                );

                expect(email.personId).toStrictEqual(personId);
                expect(email.currentAddress).toStrictEqual(address);
                expect(email.enabled).toBeTruthy();
            });
        });
    });

    describe('createNew', () => {
        describe('when person is found and address generation succeeds', () => {
            it('should return new Email', async () => {
                const person: Person<true> = getPerson();
                personRepositoryMock.findById.mockResolvedValueOnce(person);

                vi.spyOn(EmailGenerator.prototype, 'generateAvailableAddress').mockImplementationOnce(
                    async (vorname: string, familienname: string) => {
                        return Promise.resolve({
                            ok: true,
                            value: vorname + '.' + familienname + '@schule-sh.de',
                        });
                    },
                );

                organisationRepositoryMock.findById.mockResolvedValueOnce(
                    DoFactory.createOrganisation<true>(true, {
                        emailDomain: undefined,
                    }),
                );

                organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce('@schule-sh.de');

                const creationResult: Result<EmailAddress<false>> = await sut.createNew(person.id, faker.string.uuid());

                assert(creationResult.ok);
                expect(creationResult.value.personId).toStrictEqual(person.id);
                expect(creationResult.value.address).toStrictEqual(
                    `${person.vorname}.${person.familienname}@schule-sh.de`,
                );
            });
        });

        describe('when person CANNOT be found', () => {
            it('should return error', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(undefined);

                const creationResult: Result<EmailAddress<false>> = await sut.createNew(
                    faker.string.uuid(),
                    faker.string.uuid(),
                );

                expect(creationResult.ok).toBeFalsy();
            });
        });

        describe('when organisation is not found', () => {
            it('should return EntityNotFoundError', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(getPerson());
                organisationRepositoryMock.findById.mockResolvedValueOnce(undefined);

                const creationResult: Result<EmailAddress<false>> = await sut.createNew(
                    faker.string.uuid(),
                    faker.string.uuid(),
                );

                expect(creationResult.ok).toBeFalsy();
                assert(!creationResult.ok);
                expect(creationResult.error).toBeInstanceOf(EntityNotFoundError);
            });
        });

        describe('when neither organisation nor any parent has a valid email-domain', () => {
            it('should return EmailDomainNotFoundError', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(getPerson());
                organisationRepositoryMock.findById.mockResolvedValueOnce(
                    DoFactory.createOrganisation<true>(true, { emailDomain: undefined }),
                );
                organisationRepositoryMock.findParentOrgasForIdSortedByDepthAsc.mockResolvedValueOnce([
                    DoFactory.createOrganisation<true>(true, { emailDomain: undefined }),
                ]);
                organisationRepositoryMock.findParentOrgasForIdSortedByDepthAsc.mockResolvedValueOnce([
                    DoFactory.createOrganisation<true>(true, { emailDomain: undefined }),
                ]);
                organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce(undefined);

                const creationResult: Result<EmailAddress<false>> = await sut.createNew(
                    faker.string.uuid(),
                    faker.string.uuid(),
                );

                assert(!creationResult.ok);
                expect(creationResult.error).toBeInstanceOf(EmailDomainNotFoundError);
            });
        });

        describe('when address generation fails', () => {
            it('should return error', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(getPerson());
                organisationRepositoryMock.findById.mockResolvedValueOnce(
                    DoFactory.createOrganisation<true>(true, { emailDomain: undefined }),
                );
                organisationRepositoryMock.findUemLdapOuForOrganisation.mockResolvedValueOnce(faker.internet.email());

                vi.spyOn(EmailGenerator.prototype, 'generateAvailableAddress').mockImplementationOnce(
                    async (vorname: string, familienname: string) => {
                        return Promise.resolve({
                            ok: false,
                            error: new InvalidNameError(vorname + '.' + familienname),
                        });
                    },
                );

                const creationResult: Result<EmailAddress<false>> = await sut.createNew(
                    faker.string.uuid(),
                    faker.string.uuid(),
                );

                expect(creationResult.ok).toBeFalsy();
            });
        });
    });

    describe('createNewFromPersonIdAndDomain', () => {
        const domain: string = 'schule-sh.de';

        describe('when person is found and address generation succeeds', () => {
            it('should return new Email', async () => {
                const person: Person<true> = getPerson();
                personRepositoryMock.findById.mockResolvedValueOnce(person);

                vi.spyOn(EmailGenerator.prototype, 'generateAvailableAddress').mockImplementationOnce(
                    async (vorname: string, familienname: string) => {
                        return Promise.resolve({
                            ok: true,
                            value: vorname + '.' + familienname + '@schule-sh.de',
                        });
                    },
                );

                const creationResult: Result<EmailAddress<false>> = await sut.createNewFromPersonIdAndDomain(
                    person.id,
                    domain,
                );

                assert(creationResult.ok);
                expect(creationResult.value.personId).toStrictEqual(person.id);
                expect(creationResult.value.address).toStrictEqual(
                    `${person.vorname}.${person.familienname}@schule-sh.de`,
                );
            });
        });

        describe('when person CANNOT be found', () => {
            it('should return error', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(undefined);

                const creationResult: Result<EmailAddress<false>> = await sut.createNewFromPersonIdAndDomain(
                    faker.string.uuid(),
                    domain,
                );

                expect(creationResult.ok).toBeFalsy();
            });
        });

        describe('when address generation fails', () => {
            it('should return error', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(getPerson());

                vi.spyOn(EmailGenerator.prototype, 'generateAvailableAddress').mockImplementationOnce(
                    async (vorname: string, familienname: string) => {
                        return Promise.resolve({
                            ok: false,
                            error: new InvalidNameError(vorname + '.' + familienname),
                        });
                    },
                );

                const creationResult: Result<EmailAddress<false>> = await sut.createNewFromPersonIdAndDomain(
                    faker.string.uuid(),
                    domain,
                );

                expect(creationResult.ok).toBeFalsy();
            });
        });
    });
});
