import { faker } from '@faker-js/faker';
import { EntityManager, MikroORM } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Client, SearchResult } from 'ldapts';
import assert from 'node:assert';
import { vi } from 'vitest';
import { createMock, DeepMocked } from '../../../../../../test/utils/createMock.js';
import { DatabaseTestModule } from '../../../../../../test/utils/database-test.module.js';
import {
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    EmailConfigTestModule,
    expectErrResult,
    expectOkResult,
} from '../../../../../../test/utils/index.js';
import { ClassLogger } from '../../../../../core/logging/class-logger.js';
import { GlobalValidationPipe } from '../../../../../shared/validation/index.js';
import { EmailLdapModule } from '../../email-ldap.module.js';
import { LdapClient } from '../technical/ldap-client.js';
import { LdapEmailMicroserviceInstanceConfig } from '../technical/ldap-email-microservice-instance-config.js';
import { LdapCreatePersonError } from './error/ldap-create-person.error.js';
import { LdapEmailDomainError } from './error/ldap-email-domain.error.js';
import { LdapModifyPersonError } from './error/ldap-modify-person.error.js';
import { LdapClientAdapter, PersonData } from './ldap-client.adapter.js';

class PublicExecuteWithRetry {
    public async executeWithRetry<T>(
        _func: () => Promise<Result<T>>,
        _retries: number,
        _delay: number = 15000,
    ): Promise<Result<T>> {
        return _func();
    }
}

describe('LDAP Client Adapter', () => {
    let app: INestApplication;
    let module: TestingModule;
    let orm: MikroORM;
    let em: EntityManager;
    let ldapClientAdapter: LdapClientAdapter;
    let ldapClientMock: DeepMocked<LdapClient>;
    let loggerMock: DeepMocked<ClassLogger>;
    let clientMock: DeepMocked<Client>;
    let instanceConfig: LdapEmailMicroserviceInstanceConfig;

    const mockLdapInstanceConfig: LdapEmailMicroserviceInstanceConfig = {
        ENABLED: true,
        BASE_DN: 'dc=example,dc=com',
        OEFFENTLICHE_SCHULEN_DOMAIN: 'schule-sh.de',
        ERSATZSCHULEN_DOMAIN: 'ersatzschule-sh.de',
        RETRY_WRAPPER_DEFAULT_RETRIES: 2,
        URL: '',
        BIND_DN: '',
        ADMIN_PASSWORD: '',
    };

    /**
     * Returns a PersonData-object, id, vorname, familienname, username, ldapEntryUUID will be filled with faker-values when not defined.
     * The ldapEntryUUID has no default!
     */
    function getPersonData(firstName?: string, lastName?: string, uid?: string, username?: string): PersonData {
        return {
            firstName: firstName ?? faker.person.firstName(),
            lastName: lastName ?? faker.person.lastName(),
            uid: uid ?? faker.string.uuid(),
            username: username ?? faker.internet.username(),
        };
    }

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [EmailConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true }), EmailLdapModule],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
                {
                    provide: LdapEmailMicroserviceInstanceConfig,
                    useValue: mockLdapInstanceConfig,
                },
            ],
        })
            .overrideProvider(LdapClient)
            .useValue(createMock(LdapClient))
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .overrideProvider(LdapEmailMicroserviceInstanceConfig)
            .useValue(mockLdapInstanceConfig)
            .compile();

        orm = module.get(MikroORM);
        em = module.get(EntityManager);
        ldapClientAdapter = module.get(LdapClientAdapter);
        ldapClientMock = module.get(LdapClient);
        loggerMock = module.get(ClassLogger);
        clientMock = createMock(Client);
        instanceConfig = module.get(LdapEmailMicroserviceInstanceConfig);

        //currently only used to wait for the LDAP container, because setupDatabase() is blocking
        await DatabaseTestModule.setupDatabase(module.get(MikroORM));
        app = module.createNestApplication();
        await app.init();
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await DatabaseTestModule.clearDatabase(orm);
        await app.close();
        vi.clearAllTimers();
    });

    beforeEach(async () => {
        vi.resetAllMocks();
        vi.restoreAllMocks();
        clientMock = createMock(Client);
        await DatabaseTestModule.clearDatabase(orm);

        vi.spyOn(ldapClientAdapter as unknown as PublicExecuteWithRetry, 'executeWithRetry').mockImplementation(
            (...args: unknown[]) => {
                //Needed To globally mock the private executeWithRetry function (otherwise test run too long)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const func: () => Promise<Result<any>> = args[0] as () => Promise<Result<any>>;
                return func();
            },
        );
    });

    it('should be defined', () => {
        expect(em).toBeDefined();
    });

    describe('getRootName', () => {
        it('when emailDomain is neither schule-sh.de nor ersatzschule-sh.de should return LdapEmailDomainError', async () => {
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.add.mockResolvedValueOnce();
                clientMock.search.mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });
                return clientMock;
            });
            const result: Result<boolean> = await ldapClientAdapter.isPersonExisting('user123', 'wrong-domain.de');

            assert(!result.ok);
            expect(result.error).toBeInstanceOf(LdapEmailDomainError);
        });

        it('when emailDomain is one that is explicitly set in config but neither schule-sh.de nor ersatzschule-sh.de it should go through', async () => {
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.add.mockResolvedValueOnce();
                clientMock.search.mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });
                return clientMock;
            });

            instanceConfig.OEFFENTLICHE_SCHULEN_DOMAIN = 'weird-domain.ina.foreign.country.co.uk';
            instanceConfig.ERSATZSCHULEN_DOMAIN = 'normaldomain.co.jp';

            const resultOeffentlich: Result<boolean> = await ldapClientAdapter.isPersonExisting(
                'user123',
                'weird-domain.ina.foreign.country.co.uk',
            );

            const resultErsatz: Result<boolean> = await ldapClientAdapter.isPersonExisting(
                'user123',
                'normaldomain.co.jp',
            );
            const resultOldDefault: Result<boolean> = await ldapClientAdapter.isPersonExisting(
                'user123',
                'schule-sh.de',
            );

            instanceConfig.OEFFENTLICHE_SCHULEN_DOMAIN = undefined;
            instanceConfig.ERSATZSCHULEN_DOMAIN = undefined;

            expect(resultOeffentlich.ok).toBeTruthy();
            expect(resultErsatz.ok).toBeTruthy();
            expect(resultOldDefault.ok).toBeTruthy();
        });
    });

    describe('isPersonExisting', () => {
        it('should return true when the person exists', async () => {
            const uid: string = faker.string.uuid();
            const domain: string = 'schule-sh.de';
            const rootName: string = 'oeffentlicheSchulen';
            const baseDn: string = mockLdapInstanceConfig.BASE_DN;

            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockResolvedValueOnce({
                    searchEntries: [{ dn: `uid=${uid},ou=${rootName},${baseDn}` }],
                } as SearchResult);
                return clientMock;
            });

            const result: Result<boolean> = await ldapClientAdapter.isPersonExisting(uid, domain);

            expect(result.ok).toBeTruthy();
            if (result.ok) {
                expect(result.value).toBe(true);
            }
            expect(clientMock.search).toHaveBeenCalledWith(`ou=${rootName},${baseDn}`, { filter: `(uid=${uid})` });
        });

        it('should return false when the person exists', async () => {
            const uid: string = faker.string.uuid();
            const domain: string = 'schule-sh.de';
            const rootName: string = 'oeffentlicheSchulen';
            const baseDn: string = mockLdapInstanceConfig.BASE_DN;

            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockResolvedValueOnce({
                    searchEntries: [],
                } as unknown as SearchResult);
                return clientMock;
            });

            const result: Result<boolean> = await ldapClientAdapter.isPersonExisting(uid, domain);

            expect(result.ok).toBeTruthy();
            if (result.ok) {
                expect(result.value).toBe(false);
            }
            expect(clientMock.search).toHaveBeenCalledWith(`ou=${rootName},${baseDn}`, { filter: `(uid=${uid})` });
        });

        it('should return error result when bind fails', async () => {
            const uid: string = faker.string.uuid();
            const domain: string = 'schule-sh.de';

            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockRejectedValueOnce(undefined);
                return clientMock;
            });

            vi.restoreAllMocks();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vi.spyOn(ldapClientAdapter as any, 'bind').mockResolvedValue({
                ok: false,
                error: new Error('bind failed'),
            });

            const result: Result<boolean> = await ldapClientAdapter.isPersonExisting(uid, domain);

            expect(result.ok).toBeFalsy();
            if (!result.ok) {
                expect(result.error).toEqual(new Error('bind failed'));
            }
        });
    });

    describe('executeWithRetry', () => {
        beforeEach(() => {
            vi.restoreAllMocks(); //Needed To Reset the global executeWithRetry Mock
        });

        it('when operation succeeds should return value', async () => {
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockResolvedValue({ searchEntries: [] } as unknown as SearchResult);

                return clientMock;
            });
            const result: Result<boolean> = await ldapClientAdapter.isPersonExisting(
                faker.lorem.word(),
                'schule-sh.de',
            );

            expect(result.ok).toBeTruthy();
            expect(clientMock.bind).toHaveBeenCalledTimes(1);
            expect(loggerMock.logUnknownAsError).not.toHaveBeenCalledWith(expect.stringContaining('Attempt 1 failed'));
        });

        it('should throw an error when the function returns a Result with ok=false and handle it with retry', async () => {
            vi.restoreAllMocks();
            ldapClientMock.getClient.mockReturnValue(clientMock);
            clientMock.bind.mockResolvedValue(undefined);
            const customError: Error = new Error('custom error');

            const failingFunc: () => Promise<Result<unknown, Error>> = vi
                .fn()
                .mockResolvedValue({ ok: false, error: customError });

            await expect(ldapClientAdapter['executeWithRetry'](failingFunc, 1)).resolves.toEqual({
                ok: false,
                error: customError,
            });
        });

        it('when operation fails it should automatically retry the operation with nr of fallback retries and log error', async () => {
            instanceConfig.RETRY_WRAPPER_DEFAULT_RETRIES = undefined;
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockRejectedValue(new Error('testerror'));

                return clientMock;
            });
            const result: Result<boolean> = await ldapClientAdapter.isPersonExisting(
                faker.lorem.word(),
                'schule-sh.de',
            );

            expect(result.ok).toBeFalsy();
            expect(clientMock.bind).toHaveBeenCalledTimes(3);
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                expect.stringContaining('Attempt 1 failed'),
                expect.objectContaining({ message: 'testerror' }),
            );
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                expect.stringContaining('Attempt 2 failed'),
                expect.objectContaining({ message: 'testerror' }),
            );
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                expect.stringContaining('Attempt 3 failed'),
                expect.objectContaining({ message: 'testerror' }),
            );
            instanceConfig.RETRY_WRAPPER_DEFAULT_RETRIES = 2;
        });

        it('when operation fails and throws Error it should automatically retry the operation with nr of retries set via env', async () => {
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockRejectedValue(new Error());

                return clientMock;
            });
            const result: Result<boolean> = await ldapClientAdapter.isPersonExisting(
                faker.lorem.word(),
                'schule-sh.de',
            );

            expect(result.ok).toBeFalsy();
            expect(clientMock.bind).toHaveBeenCalledTimes(2);
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                expect.stringContaining('Attempt 1 failed'),
                expect.any(Error),
            );
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                expect.stringContaining('Attempt 2 failed'),
                expect.any(Error),
            );
        });
    });

    describe('creation', () => {
        const fakeEmailDomain: string = 'schule-sh.de';
        const fakeOrgaKennung: string = '123';
        const fakeEmailAddress: string = 'uteste@ersatzschule-sh.de';

        describe('lehrer', () => {
            it('when called with extra entryUUID should return truthy result', async () => {
                ldapClientMock.getClient.mockImplementation(() => {
                    clientMock.bind.mockResolvedValue();

                    // exists check
                    clientMock.search.mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });

                    // Add
                    clientMock.add.mockResolvedValueOnce();

                    // Get EntryUUID
                    clientMock.search.mockResolvedValueOnce({
                        searchEntries: [
                            {
                                entryUUID: faker.string.uuid(),
                                dn: '',
                            },
                        ],
                        searchReferences: [],
                    });
                    return clientMock;
                });

                const testLehrer: PersonData = getPersonData();
                const lehrerUid: string =
                    'uid=' + testLehrer.uid + ',ou=oeffentlicheSchulen,' + mockLdapInstanceConfig.BASE_DN;
                const result: Result<PersonData> = await ldapClientAdapter.createPerson(
                    testLehrer,
                    fakeEmailDomain,
                    fakeOrgaKennung,
                    undefined,
                );

                expect(result.ok).toBeTruthy();
                expect(loggerMock.info).toHaveBeenLastCalledWith(`LDAP: Creating person succeeded, uid:${lehrerUid}`);
            });

            it('when called WITHOUT entryUUID should use person.id and return truthy result', async () => {
                ldapClientMock.getClient.mockImplementation(() => {
                    clientMock.bind.mockResolvedValue();

                    // exists check
                    clientMock.search.mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });

                    // Add
                    clientMock.add.mockResolvedValueOnce();

                    // Get EntryUUID
                    clientMock.search.mockResolvedValueOnce({
                        searchEntries: [
                            {
                                entryUUID: faker.string.uuid(),
                                dn: '',
                            },
                        ],
                        searchReferences: [],
                    });
                    return clientMock;
                });

                const testLehrer: PersonData = getPersonData();
                const lehrerUid: string =
                    'uid=' + testLehrer.uid + ',ou=oeffentlicheSchulen,' + mockLdapInstanceConfig.BASE_DN;
                const result: Result<PersonData> = await ldapClientAdapter.createPerson(
                    testLehrer,
                    fakeEmailDomain,
                    fakeOrgaKennung,
                    undefined,
                );

                expect(result.ok).toBeTruthy();
                expect(loggerMock.info).toHaveBeenLastCalledWith(`LDAP: Creating person succeeded, uid:${lehrerUid}`);
            });

            it('when adding fails should log error', async () => {
                const error: Error = new Error('LDAP-Error');
                ldapClientMock.getClient.mockImplementation(() => {
                    clientMock.bind.mockResolvedValue();
                    clientMock.bind.mockResolvedValue();
                    clientMock.search.mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });
                    clientMock.search.mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });
                    clientMock.search.mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });
                    clientMock.add.mockRejectedValueOnce(error);

                    return clientMock;
                });
                const testLehrer: PersonData = getPersonData();
                const lehrerUid: string =
                    'uid=' + testLehrer.uid + ',ou=oeffentlicheSchulen,' + mockLdapInstanceConfig.BASE_DN;
                const result: Result<PersonData> = await ldapClientAdapter.createPerson(
                    testLehrer,
                    fakeEmailDomain,
                    fakeOrgaKennung,
                    undefined,
                );

                assert(!result.ok);
                expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                    `LDAP: Creating person FAILED, uid:${lehrerUid}`,
                    error,
                );
                expect(result.error).toEqual(new LdapCreatePersonError());
            });

            it('when called with explicit domain "ersatzschule-sh.de" should return truthy result', async () => {
                ldapClientMock.getClient.mockImplementation(() => {
                    // exists check
                    clientMock.search.mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });

                    // Add
                    clientMock.add.mockResolvedValueOnce();

                    // Get EntryUUID
                    clientMock.search.mockResolvedValueOnce({
                        searchEntries: [
                            {
                                entryUUID: faker.string.uuid(),
                                dn: '',
                            },
                        ],
                        searchReferences: [],
                    });
                    return clientMock;
                });

                const testLehrer: PersonData = getPersonData();
                const fakeErsatzSchuleAddressDomain: string = 'ersatzschule-sh.de';
                const lehrerUid: string =
                    'uid=' + testLehrer.uid + ',ou=ersatzSchulen,' + mockLdapInstanceConfig.BASE_DN;
                const result: Result<PersonData> = await ldapClientAdapter.createPerson(
                    testLehrer,
                    fakeErsatzSchuleAddressDomain,
                    fakeEmailAddress,
                    undefined,
                );

                expect(result.ok).toBeTruthy();
                expect(loggerMock.info).toHaveBeenLastCalledWith(`LDAP: Creating person succeeded, uid:${lehrerUid}`);
            });

            it('when lehrer already exists', async () => {
                const personData: PersonData = getPersonData();
                const lehrerUid: string =
                    'uid=' + personData.uid + ',ou=oeffentlicheSchulen,' + mockLdapInstanceConfig.BASE_DN;
                ldapClientMock.getClient.mockImplementation(() => {
                    clientMock.bind.mockResolvedValue();
                    clientMock.add.mockResolvedValueOnce();
                    clientMock.search.mockResolvedValueOnce({
                        searchEntries: [
                            {
                                dn: lehrerUid,
                            },
                        ],
                        searchReferences: [],
                    }); //mock: lehrer already exists

                    return clientMock;
                });
                const result: Result<PersonData> = await ldapClientAdapter.createPerson(
                    personData,
                    fakeEmailDomain,
                    fakeOrgaKennung,
                    undefined,
                );

                expect(loggerMock.info).toHaveBeenLastCalledWith(`LDAP: Person ${lehrerUid} exists, nothing to create`);
                expect(result.ok).toBeTruthy();
            });

            it('when bind returns error', async () => {
                ldapClientMock.getClient.mockImplementationOnce(() => {
                    clientMock.bind.mockRejectedValue(new Error());
                    clientMock.add.mockResolvedValueOnce();
                    return clientMock;
                });
                const testLehrer: PersonData = getPersonData();
                const result: Result<PersonData> = await ldapClientAdapter.createPerson(
                    testLehrer,
                    fakeEmailDomain,
                    fakeOrgaKennung,
                    undefined,
                );

                expect(result.ok).toBeFalsy();
            });

            it('when called with invalid emailDomain returns LdapEmailDomainError', async () => {
                const testLehrer: PersonData = getPersonData();
                const result: Result<PersonData> = await ldapClientAdapter.createPerson(
                    testLehrer,
                    'wrong-email-domain.de',
                    fakeOrgaKennung,
                    undefined,
                );

                assert(!result.ok);
                expect(result.error).toBeInstanceOf(LdapEmailDomainError);
            });
        });
    });

    describe('updatePersonEmails', () => {
        const fakeEmailDomain: string = 'schule-sh.de';
        it('should modify person emails in ldap', async () => {
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.modify.mockResolvedValueOnce();
                return clientMock;
            });

            const primaryMail: string = faker.internet.email();
            const alternativeEmail: string = faker.internet.email();

            const result: Result<string> = await ldapClientAdapter.updatePersonEmails(
                faker.string.uuid(),
                fakeEmailDomain,
                primaryMail,
                alternativeEmail,
            );

            expectOkResult(result);
            expect(result.ok).toBeTruthy();
        });

        it('should return error if domain is invalid', async () => {
            const primaryMail: string = faker.internet.email();

            const result: Result<string> = await ldapClientAdapter.updatePersonEmails(
                faker.string.uuid(),
                'invalid@domain',
                primaryMail,
                undefined,
            );

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapEmailDomainError);
        });

        it('should return error if bind fails', async () => {
            const bindError: Error = new Error('LDAP bind FAILED');
            ldapClientMock.getClient.mockImplementation(() => {
                // Mock multiple times to exhaust the retries
                clientMock.bind.mockRejectedValueOnce(bindError);
                clientMock.bind.mockRejectedValueOnce(bindError);
                return clientMock;
            });

            const primaryMail: string = faker.internet.email();

            const result: Result<string> = await ldapClientAdapter.updatePersonEmails(
                faker.string.uuid(),
                fakeEmailDomain,
                primaryMail,
                undefined,
            );

            expectErrResult(result);
            expect(result.error).toEqual(bindError);
        });

        it('should return error if modify fails', async () => {
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.modify.mockRejectedValueOnce(new Error('Modify failed'));
                return clientMock;
            });

            const primaryMail: string = faker.internet.email();

            const result: Result<string> = await ldapClientAdapter.updatePersonEmails(
                faker.string.uuid(),
                fakeEmailDomain,
                primaryMail,
                undefined,
            );

            expectErrResult(result);
            expect(result.error).toEqual(new LdapModifyPersonError());
        });
    });

    describe('updatePerson', () => {
        const fakeEmailDomain: string = 'schule-sh.de';

        it('should modify person in ldap', async () => {
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.modify.mockResolvedValueOnce();
                return clientMock;
            });

            const personData: PersonData = getPersonData();
            const primaryMail: string = faker.internet.email();
            const alternativeEmail: string = faker.internet.email();

            const result: Result<PersonData> = await ldapClientAdapter.updatePerson(
                personData,
                fakeEmailDomain,
                primaryMail,
                alternativeEmail,
            );

            expectOkResult(result);
            expect(result.value).toBe(personData);

            expect(loggerMock.infoWithDetails).toHaveBeenLastCalledWith(
                'LDAP: Modify person succeeded',
                expect.objectContaining({
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    uid: expect.stringContaining(personData.uid),
                    username: personData.username,
                    firstname: personData.firstName,
                    lastname: personData.lastName,
                }),
            );
        });

        it('should return error if domain is invalid', async () => {
            const personData: PersonData = getPersonData();
            const primaryMail: string = faker.internet.email();

            const result: Result<PersonData> = await ldapClientAdapter.updatePerson(
                personData,
                'invalid@domain',
                primaryMail,
                undefined,
            );

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapEmailDomainError);
        });

        it('should return error if bind fails', async () => {
            const bindError: Error = new Error('LDAP bind FAILED');
            ldapClientMock.getClient.mockImplementation(() => {
                // Mock multiple times to exhaust the retries
                clientMock.bind.mockRejectedValueOnce(bindError);
                clientMock.bind.mockRejectedValueOnce(bindError);
                return clientMock;
            });

            const personData: PersonData = getPersonData();
            const primaryMail: string = faker.internet.email();

            const result: Result<PersonData> = await ldapClientAdapter.updatePerson(
                personData,
                fakeEmailDomain,
                primaryMail,
                undefined,
            );

            expectErrResult(result);
            expect(result.error).toEqual(bindError);
        });

        it('should return error if modify fails', async () => {
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.modify.mockRejectedValueOnce(new Error('Modify failed'));
                return clientMock;
            });

            const personData: PersonData = getPersonData();
            const primaryMail: string = faker.internet.email();

            const result: Result<PersonData> = await ldapClientAdapter.updatePerson(
                personData,
                fakeEmailDomain,
                primaryMail,
                undefined,
            );

            expectErrResult(result);
            expect(result.error).toEqual(new LdapModifyPersonError());
        });
    });

    describe('deletePerson', () => {
        const domain: string = 'schule-sh.de';
        const rootName: string = 'oeffentlicheSchulen';
        const baseDn: string = mockLdapInstanceConfig.BASE_DN;

        it('should return ok if person does not exist', async () => {
            const externalId: string = faker.string.uuid();
            const personUid: string = `uid=${externalId},ou=${rootName},${baseDn}`;
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockResolvedValueOnce({
                    searchEntries: [],
                } as unknown as SearchResult);
                clientMock.del.mockResolvedValue();
                return clientMock;
            });
            const result: Result<void, Error> = await ldapClientAdapter.deletePerson(externalId, domain);
            expectOkResult(result);
            expect(loggerMock.info).toHaveBeenCalledWith(`LDAP: Person ${personUid} does not exist, nothing to delete`);
        });

        it('should delete person if exists and return ok', async () => {
            const externalId: string = faker.string.uuid();
            const personUid: string = `uid=${externalId},ou=${rootName},${baseDn}`;
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockResolvedValueOnce({
                    searchEntries: [{ dn: personUid }],
                } as SearchResult);
                clientMock.del.mockResolvedValue();
                return clientMock;
            });
            const result: Result<void, Error> = await ldapClientAdapter.deletePerson(externalId, domain);
            expectOkResult(result);
            expect(loggerMock.info).toHaveBeenCalledWith(`LDAP: Successfully deleted person ${personUid}`);
        });

        it('should return error if bind fails', async () => {
            const externalId: string = faker.string.uuid();
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockRejectedValueOnce(new Error('bind failed'));
                return clientMock;
            });
            const result: Result<void, Error> = await ldapClientAdapter.deletePerson(externalId, domain);
            expectErrResult(result);
            expect(result.error).toEqual(new Error('LDAP bind FAILED'));
        });

        it('should return error if search throws', async () => {
            const externalId: string = faker.string.uuid();
            const personUid: string = `uid=${externalId},ou=${rootName},${baseDn}`;
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockRejectedValueOnce(new Error('search failed'));
                return clientMock;
            });
            const result: Result<void, Error> = await ldapClientAdapter.deletePerson(externalId, domain);
            expectErrResult(result);
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `LDAP: Deleting person FAILED, uid:${personUid}`,
                expect.any(Error),
            );
        });

        it('should return error if delete throws', async () => {
            const externalId: string = faker.string.uuid();
            const personUid: string = `uid=${externalId},ou=${rootName},${baseDn}`;
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockResolvedValueOnce({
                    searchEntries: [{ dn: personUid }],
                } as SearchResult);
                clientMock.del.mockRejectedValueOnce(new Error('delete failed'));
                return clientMock;
            });
            const result: Result<void, Error> = await ldapClientAdapter.deletePerson(externalId, domain);
            expectErrResult(result);
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `LDAP: Deleting person FAILED, uid:${personUid}`,
                expect.any(Error),
            );
        });

        it('should return error if domain is invalid', async () => {
            const externalId: string = faker.string.uuid();
            const result: Result<void, Error> = await ldapClientAdapter.deletePerson(externalId, 'invalid');
            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapEmailDomainError);
            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining('Could not get root-name because email-domain is invalid'),
            );
        });
    });

    describe('useLdap should return correct value based on config', () => {
        it('should return false when LDAP.ENABLED is false', () => {
            instanceConfig.ENABLED = false;
            expect(ldapClientAdapter.useLdap()).toBe(false);
        });

        it('should return true when LDAP.ENABLED is true', () => {
            instanceConfig.ENABLED = true;
            expect(ldapClientAdapter.useLdap()).toBe(true);
        });
    });
});
