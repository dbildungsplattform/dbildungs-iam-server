import { MikroORM } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Attribute, Change, Client } from 'ldapts';
import { MockInstance, vi } from 'vitest';
import { createMock, DeepMocked } from '../../../../../../test/utils/createMock.js';
import { DatabaseTestModule } from '../../../../../../test/utils/database-test.module.js';
import { EmailConfigTestModule } from '../../../../../../test/utils/email-config-test.module.js';
import { DEFAULT_TIMEOUT_FOR_TESTCONTAINERS } from '../../../../../../test/utils/timeouts.js';
import { ClassLogger } from '../../../../../core/logging/class-logger.js';
import { GlobalValidationPipe } from '../../../../../shared/validation/global-validation.pipe.js';
import { EmailLdapModule } from '../../email-ldap.module.js';
import { LdapUndiClient } from '../technical/ldap-undi-client.js';
import { LdapUndiEmailMicroserviceInstanceConfig } from '../technical/ldap-undi-email-microservice-instance-config.js';
import { GroupDataUndi, LdapUndiClientAdapter, PersonDataUndi } from './ldap-undi-client.adapter.js';
import { expectErrResult, expectOkResult } from '../../../../../../test/utils/test-types.js';
import { faker } from '@faker-js/faker';
import { LdapBindError } from './error/ldap-bind.error.js';
import { LdapDeleteGroupError } from './error/ldap-delete-group.error.js';
import { LdapModifyGroupError } from './error/ldap-modify-group.error.js';
import { LdapFindPersonError } from './error/ldap-find-person.error.js';
import { LdapModifyPersonError } from './error/ldap-modify-person.error.js';
import { LdapDeletePersonError } from './error/ldap-delete-person.error.js';
import { LdapEmailDomainError } from './error/ldap-email-domain.error.js';
import { LdapCreateGroupError } from './error/ldap-create-group.error.js';
import { LdapAddPersonToGroupError } from './error/ldap-add-person-to-group.error.js';
import { LdapRemovePersonFromGroupError } from './error/ldap-remove-person-from-group.error.js';
import { LdapSetPersonGroupsError } from './error/ldap-set-person-groups.error.js';
import { LdapCreatePersonError } from './error/ldap-create-person.error.js';

class PublicExecuteWithRetry {
    public async executeWithRetry<T>(
        _func: () => Promise<Result<T>>,
        _retries: number,
        _delay: number = 15000,
    ): Promise<Result<T>> {
        return _func();
    }
}

describe('LDAP UNDI Client Adapter', () => {
    let app: INestApplication;
    let module: TestingModule;
    let orm: MikroORM;
    let ldapClientAdapter: LdapUndiClientAdapter;
    let ldapClientMock: DeepMocked<LdapUndiClient>;
    let clientMock: DeepMocked<Client>;
    let loggerMock: DeepMocked<ClassLogger>;
    let instanceConfig: LdapUndiEmailMicroserviceInstanceConfig;

    const mockLdapInstanceConfig: LdapUndiEmailMicroserviceInstanceConfig = {
        ENABLED: true,
        BASE_DN: 'dc=example,dc=com',
        OEFFENTLICHE_SCHULEN_DOMAIN: 'schule-sh.de',
        ERSATZSCHULEN_DOMAIN: 'ersatzschule-sh.de',
        RETRY_WRAPPER_DEFAULT_RETRIES: 2,
        URL: '',
        BIND_DN: '',
        ADMIN_PASSWORD: '',
    };

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [EmailConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true }), EmailLdapModule],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
                {
                    provide: LdapUndiEmailMicroserviceInstanceConfig,
                    useValue: mockLdapInstanceConfig,
                },
            ],
        })
            .overrideProvider(LdapUndiClient)
            .useValue(createMock(LdapUndiClient))
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .overrideProvider(LdapUndiEmailMicroserviceInstanceConfig)
            .useValue(mockLdapInstanceConfig)
            .compile();

        orm = module.get(MikroORM);
        ldapClientAdapter = module.get(LdapUndiClientAdapter);
        ldapClientMock = module.get(LdapUndiClient);
        clientMock = createMock(Client);
        loggerMock = module.get(ClassLogger);
        instanceConfig = module.get(LdapUndiEmailMicroserviceInstanceConfig);

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

        mockLdapInstanceConfig.ENABLED = true;

        vi.spyOn(ldapClientAdapter as unknown as PublicExecuteWithRetry, 'executeWithRetry').mockImplementation(
            (...args: unknown[]) => {
                //Needed To globally mock the private executeWithRetry function (otherwise test run too long)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const func: () => Promise<Result<any>> = args[0] as () => Promise<Result<any>>;
                return func();
            },
        );
    });

    describe('executeWithRetry', () => {
        beforeEach(() => {
            vi.restoreAllMocks();
            vi.useFakeTimers({ toFake: ['setTimeout'] });
            ldapClientMock.getClient.mockReturnValue(clientMock);
        });

        afterEach(() => {
            vi.restoreAllMocks();
            vi.useRealTimers();
            instanceConfig.RETRY_WRAPPER_DEFAULT_RETRIES = 2;
        });

        it('when operation succeeds should return value', async () => {
            clientMock.bind.mockResolvedValue();
            clientMock.search.mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });

            const result: Result<void> = await ldapClientAdapter.deletePerson(faker.string.uuid());

            expectOkResult(result);
            expect(clientMock.bind).toHaveBeenCalledTimes(1);
            expect(loggerMock.logUnknownAsError).not.toHaveBeenCalled();
            expect(loggerMock.error).not.toHaveBeenCalled();
            expect(vi.getTimerCount()).toBe(0);
        });

        it('should handle a Result with ok=false and return its error after the final attempt', async () => {
            instanceConfig.RETRY_WRAPPER_DEFAULT_RETRIES = 1;
            clientMock.bind.mockRejectedValue(new Error('LDAP bind failed'));

            const result: Result<void> = await ldapClientAdapter.deletePerson(faker.string.uuid());

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapBindError);
            expect(clientMock.bind).toHaveBeenCalledTimes(1);
            expect(clientMock.search).not.toHaveBeenCalled();
            expect(clientMock.del).not.toHaveBeenCalled();
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                'Attempt 1 failed. Retrying in 15000ms... Remaining retries: 0',
                result.error,
            );
            expect(loggerMock.error).toHaveBeenCalledExactlyOnceWith('All 1 attempts failed. Exiting with failure.');
            expect(vi.getTimerCount()).toBe(0);
        });

        it('when operation fails it should automatically retry the operation with nr of fallback retries and log error', async () => {
            instanceConfig.RETRY_WRAPPER_DEFAULT_RETRIES = undefined;
            clientMock.bind.mockRejectedValue(new Error('LDAP bind failed'));
            const timeoutSpy: MockInstance<typeof setTimeout> = vi.spyOn(globalThis, 'setTimeout');

            const resultPromise: Promise<Result<void>> = ldapClientAdapter.deletePerson(faker.string.uuid());
            await vi.runAllTimersAsync();
            const result: Result<void> = await resultPromise;

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapBindError);
            expect(clientMock.bind).toHaveBeenCalledTimes(LdapUndiClientAdapter.FALLBACK_RETRIES);
            expect(clientMock.search).not.toHaveBeenCalled();
            expect(clientMock.del).not.toHaveBeenCalled();
            for (let attempt: number = 1; attempt <= LdapUndiClientAdapter.FALLBACK_RETRIES; attempt++) {
                expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                    `Attempt ${attempt} failed. Retrying in 15000ms... Remaining retries: ${LdapUndiClientAdapter.FALLBACK_RETRIES - attempt}`,
                    expect.any(LdapBindError),
                );
            }
            expect(timeoutSpy).toHaveBeenCalledTimes(LdapUndiClientAdapter.FALLBACK_RETRIES - 1);
            expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 15000);
            expect(loggerMock.error).toHaveBeenCalledExactlyOnceWith('All 3 attempts failed. Exiting with failure.');
            expect(vi.getTimerCount()).toBe(0);
        });

        it('when operation fails it should automatically retry the operation with nr of retries set via env', async () => {
            clientMock.bind.mockRejectedValue(new Error('LDAP bind failed'));
            const timeoutSpy: MockInstance<typeof setTimeout> = vi.spyOn(globalThis, 'setTimeout');

            const resultPromise: Promise<Result<void>> = ldapClientAdapter.deletePerson(faker.string.uuid());
            await vi.runAllTimersAsync();
            const result: Result<void> = await resultPromise;

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapBindError);
            expect(clientMock.bind).toHaveBeenCalledTimes(2);
            expect(clientMock.search).not.toHaveBeenCalled();
            expect(clientMock.del).not.toHaveBeenCalled();
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                'Attempt 1 failed. Retrying in 15000ms... Remaining retries: 1',
                expect.any(LdapBindError),
            );
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                'Attempt 2 failed. Retrying in 15000ms... Remaining retries: 0',
                expect.any(LdapBindError),
            );
            expect(timeoutSpy).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 15000);
            expect(loggerMock.error).toHaveBeenCalledExactlyOnceWith('All 2 attempts failed. Exiting with failure.');
            expect(vi.getTimerCount()).toBe(0);
        });
    });

    describe('useLdap', () => {
        it('should return false, if ENABLED is false', () => {
            mockLdapInstanceConfig.ENABLED = false;

            expect(ldapClientAdapter.useLdap()).toBe(false);
        });
    });

    describe('upsertPerson', () => {
        let person: PersonDataUndi;

        beforeEach(() => {
            person = {
                domain: 'schule-sh.de',
                uid: faker.string.uuid(),
                firstName: faker.person.firstName(),
                lastName: faker.person.lastName(),
                username: faker.internet.username(),
                mailPrimaryAddress: faker.internet.email(),
                mailSecondaryAddress: faker.internet.email(),
                deaktiviert: false,
                gesperrt: true,
            };
        });

        it("should search for user and create it if they don't exist", async () => {
            const dn: string = `uid=${person.uid},cn=users,ou=${LdapUndiClientAdapter.OEFFENTLICHE_SCHULEN_OU},${instanceConfig.BASE_DN}`;

            ldapClientMock.getClient.mockImplementation(() => clientMock);
            clientMock.bind.mockResolvedValue();
            clientMock.search
                .mockResolvedValueOnce({ searchEntries: [], searchReferences: [] })
                .mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] });
            clientMock.add.mockResolvedValueOnce();

            const result: Result<void> = await ldapClientAdapter.upsertPerson(person, []);

            expectOkResult(result);
            expect(clientMock.search).toHaveBeenNthCalledWith(1, dn, {
                filter: '(objectClass=*)',
                scope: 'base',
                attributes: [LdapUndiClientAdapter.MEMBER_OF],
            });
            expect(clientMock.search).toHaveBeenCalledTimes(2);
            expect(clientMock.add).toHaveBeenCalledExactlyOnceWith(dn, {
                [LdapUndiClientAdapter.OBJECT_CLASS]: ['inetOrgPerson', 'univentionMail', 'posixAccount'],
                [LdapUndiClientAdapter.UID]: person.uid,
                [LdapUndiClientAdapter.COMMON_NAME]: person.username,
                [LdapUndiClientAdapter.GIVEN_NAME]: person.firstName,
                [LdapUndiClientAdapter.SUR_NAME]: person.lastName,
                [LdapUndiClientAdapter.MAIL_PRIMARY_ADDRESS]: person.mailPrimaryAddress,
                [LdapUndiClientAdapter.MAIL_ALTERNATIVE_ADDRESS]: person.mailSecondaryAddress,
                [LdapUndiClientAdapter.DEAKTIVIERT]: 'FALSE',
                [LdapUndiClientAdapter.GESPERRT]: 'TRUE',
                mailBoxType: '1',
                hideFromAddressLists: 'FALSE',
            });
            expect(clientMock.modify).not.toHaveBeenCalled();
        });

        it('should search for user and update it if they exist', async () => {
            const dn: string = `uid=${person.uid},cn=users,ou=${LdapUndiClientAdapter.OEFFENTLICHE_SCHULEN_OU},${instanceConfig.BASE_DN}`;

            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockResolvedValue({ searchEntries: [{ dn }], searchReferences: [] });
                clientMock.modify.mockResolvedValueOnce();
                return clientMock;
            });

            const result: Result<void> = await ldapClientAdapter.upsertPerson(person, []);

            expectOkResult(result);
            expect(clientMock.search).toHaveBeenCalledWith(dn, {
                filter: '(objectClass=*)',
                scope: 'base',
                attributes: [LdapUndiClientAdapter.MEMBER_OF],
            });
            expect(clientMock.modify).toHaveBeenCalledExactlyOnceWith(dn, [
                new Change({
                    operation: 'replace',
                    modification: new Attribute({
                        type: LdapUndiClientAdapter.COMMON_NAME,
                        values: [person.username],
                    }),
                }),
                new Change({
                    operation: 'replace',
                    modification: new Attribute({
                        type: LdapUndiClientAdapter.GIVEN_NAME,
                        values: [person.firstName],
                    }),
                }),
                new Change({
                    operation: 'replace',
                    modification: new Attribute({
                        type: LdapUndiClientAdapter.SUR_NAME,
                        values: [person.lastName],
                    }),
                }),
                new Change({
                    operation: 'replace',
                    modification: new Attribute({
                        type: LdapUndiClientAdapter.MAIL_PRIMARY_ADDRESS,
                        values: [person.mailPrimaryAddress],
                    }),
                }),
                new Change({
                    operation: 'replace',
                    modification: new Attribute({
                        type: LdapUndiClientAdapter.MAIL_ALTERNATIVE_ADDRESS,
                        values: [person.mailSecondaryAddress].filter(Boolean),
                    }),
                }),
                new Change({
                    operation: 'replace',
                    modification: new Attribute({
                        type: LdapUndiClientAdapter.DEAKTIVIERT,
                        values: ['FALSE'],
                    }),
                }),
                new Change({
                    operation: 'replace',
                    modification: new Attribute({
                        type: LdapUndiClientAdapter.GESPERRT,
                        values: ['TRUE'],
                    }),
                }),
            ]);
            expect(clientMock.add).not.toHaveBeenCalled();
        });

        describe('getRootName', () => {
            it.each([
                ['schule-sh.de', 'oeffentlicheSchulen'],
                ['ersatzschule-sh.de', 'ersatzSchulen'],
            ])('should use the correct root name for domain %s', async (domain: string, rootName: string) => {
                person.domain = domain;
                const dn: string = `uid=${person.uid},cn=users,ou=${rootName},${instanceConfig.BASE_DN}`;

                ldapClientMock.getClient.mockReturnValue(clientMock);
                clientMock.bind.mockResolvedValue();
                clientMock.search
                    .mockResolvedValueOnce({ searchEntries: [], searchReferences: [] })
                    .mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] });
                clientMock.add.mockResolvedValueOnce();

                const result: Result<void> = await ldapClientAdapter.upsertPerson(person, []);

                expectOkResult(result);
                expect(clientMock.search).toHaveBeenNthCalledWith(1, dn, {
                    filter: '(objectClass=*)',
                    scope: 'base',
                    attributes: [LdapUndiClientAdapter.MEMBER_OF],
                });
                expect(clientMock.add).toHaveBeenCalledExactlyOnceWith(
                    dn,
                    expect.objectContaining({ [LdapUndiClientAdapter.UID]: person.uid }),
                );
                expect(clientMock.modify).not.toHaveBeenCalled();
            });

            it('should return error if root name could not be determined', async () => {
                person.domain = 'invalid.example';

                const result: Result<void> = await ldapClientAdapter.upsertPerson(person, []);

                expectErrResult(result);
                expect(result.error).toBeInstanceOf(LdapEmailDomainError);
                expect(ldapClientMock.getClient).not.toHaveBeenCalled();
                expect(clientMock.add).not.toHaveBeenCalled();
                expect(clientMock.modify).not.toHaveBeenCalled();
            });
        });

        it('should return error when creating user', async () => {
            const dn: string = `uid=${person.uid},cn=users,ou=${LdapUndiClientAdapter.OEFFENTLICHE_SCHULEN_OU},${instanceConfig.BASE_DN}`;
            const error: Error = new Error('LDAP add failed');

            ldapClientMock.getClient.mockReturnValue(clientMock);
            clientMock.bind.mockResolvedValue();
            clientMock.search.mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });
            clientMock.add.mockRejectedValueOnce(error);

            const result: Result<void> = await ldapClientAdapter.upsertPerson(person, []);

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapCreatePersonError);
            expect(result.error).toHaveProperty('details', [error]);
            expect(clientMock.add).toHaveBeenCalledExactlyOnceWith(
                dn,
                expect.objectContaining({ [LdapUndiClientAdapter.UID]: person.uid }),
            );
            expect(clientMock.search).toHaveBeenCalledTimes(1);
            expect(clientMock.modify).not.toHaveBeenCalled();
        });

        it('should return error when updating user', async () => {
            const dn: string = `uid=${person.uid},cn=users,ou=${LdapUndiClientAdapter.OEFFENTLICHE_SCHULEN_OU},${instanceConfig.BASE_DN}`;
            const error: Error = new Error('LDAP modify failed');

            ldapClientMock.getClient.mockReturnValue(clientMock);
            clientMock.bind.mockResolvedValue();
            clientMock.search.mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] });
            clientMock.modify.mockRejectedValueOnce(error);

            const result: Result<void> = await ldapClientAdapter.upsertPerson(person, []);

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapModifyPersonError);
            expect(result.error).toHaveProperty('details', [error]);
            expect(clientMock.modify).toHaveBeenCalledExactlyOnceWith(dn, expect.any(Array));
            expect(clientMock.search).toHaveBeenCalledTimes(1);
            expect(clientMock.add).not.toHaveBeenCalled();
        });

        it('should return bind error', async () => {
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockRejectedValueOnce(undefined);
                return clientMock;
            });

            const result: Result<void> = await ldapClientAdapter.upsertPerson(person, []);

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapBindError);
            expect(clientMock.search).not.toHaveBeenCalled();
            expect(clientMock.add).not.toHaveBeenCalled();
            expect(clientMock.modify).not.toHaveBeenCalled();
        });

        describe('setPersonGroupsInternal', () => {
            let dn: string;
            let group: GroupDataUndi;
            let groupDn: string;

            beforeEach(() => {
                dn = `uid=${person.uid},cn=users,ou=${LdapUndiClientAdapter.OEFFENTLICHE_SCHULEN_OU},${instanceConfig.BASE_DN}`;
                group = {
                    id: faker.string.uuid(),
                    kennung: faker.string.alphanumeric(),
                    name: faker.company.name(),
                };
                groupDn = `cn=${group.id},cn=groups,ou=${LdapUndiClientAdapter.OEFFENTLICHE_SCHULEN_OU},${instanceConfig.BASE_DN}`;

                ldapClientMock.getClient.mockImplementation(() => clientMock);
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] });
                clientMock.modify.mockResolvedValue();
                clientMock.add.mockResolvedValue();
            });

            describe('membership reconciliation', () => {
                it('should search for groups the person is a member of to find which groups need to be added and removed', async () => {
                    const retainedGroup: GroupDataUndi = { ...group, id: faker.string.uuid() };
                    const retainedDn: string = `cn=${retainedGroup.id},cn=groups,ou=${LdapUndiClientAdapter.OEFFENTLICHE_SCHULEN_OU},${instanceConfig.BASE_DN}`;
                    const removedDn: string = `cn=${faker.string.uuid()},cn=groups,ou=${LdapUndiClientAdapter.OEFFENTLICHE_SCHULEN_OU},${instanceConfig.BASE_DN}`;

                    clientMock.search
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn, memberOf: [retainedDn, removedDn] }],
                            searchReferences: [],
                        })
                        .mockResolvedValueOnce({ searchEntries: [{ dn: groupDn }], searchReferences: [] })
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn: removedDn, member: [dn] }],
                            searchReferences: [],
                        });

                    const result: Result<void> = await ldapClientAdapter.upsertPerson(person, [retainedGroup, group]);

                    expectOkResult(result);
                    expect(clientMock.search).toHaveBeenNthCalledWith(2, dn, {
                        filter: '(objectClass=*)',
                        scope: 'base',
                        attributes: [LdapUndiClientAdapter.MEMBER_OF],
                    });
                    expect(clientMock.search).toHaveBeenCalledTimes(4);
                    expect(clientMock.search).not.toHaveBeenCalledWith(retainedDn, expect.anything());
                    expect(clientMock.modify).toHaveBeenCalledTimes(3);
                    expect(clientMock.modify).toHaveBeenNthCalledWith(2, groupDn, [
                        new Change({
                            operation: 'add',
                            modification: new Attribute({
                                type: LdapUndiClientAdapter.MEMBER,
                                values: [dn],
                            }),
                        }),
                    ]);
                    expect(clientMock.modify).toHaveBeenNthCalledWith(3, removedDn, [
                        new Change({
                            operation: 'delete',
                            modification: new Attribute({
                                type: LdapUndiClientAdapter.MEMBER,
                                values: [dn],
                            }),
                        }),
                    ]);
                    expect(clientMock.add).not.toHaveBeenCalled();
                });
            });

            describe('adding groups', () => {
                it.each([true, false])(
                    "should add person to missing groups and create group if it doesn't exist (exists: %s)",
                    async (exists: boolean) => {
                        clientMock.search
                            .mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] })
                            .mockResolvedValueOnce({
                                searchEntries: exists ? [{ dn: groupDn }] : [],
                                searchReferences: [],
                            });

                        const result: Result<void> = await ldapClientAdapter.upsertPerson(person, [group]);

                        expectOkResult(result);
                        expect(clientMock.search).toHaveBeenNthCalledWith(3, groupDn, {
                            filter: '(objectClass=groupOfNames)',
                            scope: 'base',
                        });
                        if (exists) {
                            expect(clientMock.add).not.toHaveBeenCalled();
                        } else {
                            expect(clientMock.add).toHaveBeenCalledExactlyOnceWith(groupDn, {
                                [LdapUndiClientAdapter.OBJECT_CLASS]: ['groupOfNames'],
                                [LdapUndiClientAdapter.COMMON_NAME]: group.id,
                                [LdapUndiClientAdapter.DESCRIPTION]: `lehrer-${group.kennung}`,
                                [LdapUndiClientAdapter.ORGANISATION_NAME]: group.name,
                                [LdapUndiClientAdapter.ORGANISTAION_KENNUNG]: group.kennung,
                                [LdapUndiClientAdapter.MEMBER]: [dn],
                            });
                        }
                        expect(clientMock.modify).toHaveBeenCalledTimes(2);
                        expect(clientMock.modify).toHaveBeenLastCalledWith(groupDn, [
                            new Change({
                                operation: 'add',
                                modification: new Attribute({
                                    type: LdapUndiClientAdapter.MEMBER,
                                    values: [dn],
                                }),
                            }),
                        ]);
                    },
                );
            });

            describe('removing groups', () => {
                it('should not modify a group that no longer exists when removing a person', async () => {
                    clientMock.search
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn, memberOf: groupDn }],
                            searchReferences: [],
                        })
                        .mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });

                    const result: Result<void> = await ldapClientAdapter.upsertPerson(person, []);

                    expectOkResult(result);
                    expect(clientMock.search).toHaveBeenNthCalledWith(3, groupDn, {
                        scope: 'base',
                        filter: '(objectClass=groupOfNames)',
                        attributes: [LdapUndiClientAdapter.MEMBER],
                    });
                    expect(clientMock.modify).toHaveBeenCalledTimes(1);
                    expect(clientMock.add).not.toHaveBeenCalled();
                });

                it('should not modify a group with no member attribute when removing a person', async () => {
                    clientMock.search
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn, memberOf: groupDn }],
                            searchReferences: [],
                        })
                        .mockResolvedValueOnce({ searchEntries: [{ dn: groupDn }], searchReferences: [] });

                    const result: Result<void> = await ldapClientAdapter.upsertPerson(person, []);

                    expectOkResult(result);
                    expect(clientMock.search).toHaveBeenNthCalledWith(3, groupDn, {
                        scope: 'base',
                        filter: '(objectClass=groupOfNames)',
                        attributes: [LdapUndiClientAdapter.MEMBER],
                    });
                    expect(clientMock.modify).toHaveBeenCalledTimes(1);
                    expect(clientMock.add).not.toHaveBeenCalled();
                });

                it('should not modify a group the person is no longer a member of', async () => {
                    clientMock.search
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn, memberOf: groupDn }],
                            searchReferences: [],
                        })
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn: groupDn, member: [`uid=${faker.string.uuid()}`] }],
                            searchReferences: [],
                        });

                    const result: Result<void> = await ldapClientAdapter.upsertPerson(person, []);

                    expectOkResult(result);
                    expect(clientMock.search).toHaveBeenNthCalledWith(3, groupDn, {
                        scope: 'base',
                        filter: '(objectClass=groupOfNames)',
                        attributes: [LdapUndiClientAdapter.MEMBER],
                    });
                    expect(clientMock.modify).toHaveBeenCalledTimes(1);
                    expect(clientMock.add).not.toHaveBeenCalled();
                });

                it('should remove person from a group with a string member attribute', async () => {
                    clientMock.search
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn, memberOf: groupDn }],
                            searchReferences: [],
                        })
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn: groupDn, member: dn }],
                            searchReferences: [],
                        });

                    const result: Result<void> = await ldapClientAdapter.upsertPerson(person, []);

                    expectOkResult(result);
                    expect(clientMock.search).toHaveBeenNthCalledWith(3, groupDn, {
                        scope: 'base',
                        filter: '(objectClass=groupOfNames)',
                        attributes: [LdapUndiClientAdapter.MEMBER],
                    });
                    expect(clientMock.modify).toHaveBeenCalledTimes(2);
                    expect(clientMock.modify).toHaveBeenLastCalledWith(groupDn, [
                        new Change({
                            operation: 'delete',
                            modification: new Attribute({
                                type: LdapUndiClientAdapter.MEMBER,
                                values: [dn],
                            }),
                        }),
                    ]);
                    expect(clientMock.add).not.toHaveBeenCalled();
                });

                it('should remove person from a group with a buffer member attribute', async () => {
                    clientMock.search
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn, memberOf: groupDn }],
                            searchReferences: [],
                        })
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn: groupDn, member: Buffer.from(dn) }],
                            searchReferences: [],
                        });

                    const result: Result<void> = await ldapClientAdapter.upsertPerson(person, []);

                    expectOkResult(result);
                    expect(clientMock.search).toHaveBeenNthCalledWith(3, groupDn, {
                        scope: 'base',
                        filter: '(objectClass=groupOfNames)',
                        attributes: [LdapUndiClientAdapter.MEMBER],
                    });
                    expect(clientMock.modify).toHaveBeenCalledTimes(2);
                    expect(clientMock.modify).toHaveBeenLastCalledWith(groupDn, [
                        new Change({
                            operation: 'delete',
                            modification: new Attribute({
                                type: LdapUndiClientAdapter.MEMBER,
                                values: [dn],
                            }),
                        }),
                    ]);
                    expect(clientMock.add).not.toHaveBeenCalled();
                });

                it('should remove person from a group with a string array member attribute', async () => {
                    clientMock.search
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn, memberOf: groupDn }],
                            searchReferences: [],
                        })
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn: groupDn, member: [dn] }],
                            searchReferences: [],
                        });

                    const result: Result<void> = await ldapClientAdapter.upsertPerson(person, []);

                    expectOkResult(result);
                    expect(clientMock.search).toHaveBeenNthCalledWith(3, groupDn, {
                        scope: 'base',
                        filter: '(objectClass=groupOfNames)',
                        attributes: [LdapUndiClientAdapter.MEMBER],
                    });
                    expect(clientMock.modify).toHaveBeenCalledTimes(2);
                    expect(clientMock.modify).toHaveBeenLastCalledWith(groupDn, [
                        new Change({
                            operation: 'delete',
                            modification: new Attribute({
                                type: LdapUndiClientAdapter.MEMBER,
                                values: [dn],
                            }),
                        }),
                    ]);
                    expect(clientMock.add).not.toHaveBeenCalled();
                });

                it('should remove person from a group with a buffer array member attribute', async () => {
                    clientMock.search
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn, memberOf: groupDn }],
                            searchReferences: [],
                        })
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn: groupDn, member: [Buffer.from(dn)] }],
                            searchReferences: [],
                        });

                    const result: Result<void> = await ldapClientAdapter.upsertPerson(person, []);

                    expectOkResult(result);
                    expect(clientMock.search).toHaveBeenNthCalledWith(3, groupDn, {
                        scope: 'base',
                        filter: '(objectClass=groupOfNames)',
                        attributes: [LdapUndiClientAdapter.MEMBER],
                    });
                    expect(clientMock.modify).toHaveBeenCalledTimes(2);
                    expect(clientMock.modify).toHaveBeenLastCalledWith(groupDn, [
                        new Change({
                            operation: 'delete',
                            modification: new Attribute({
                                type: LdapUndiClientAdapter.MEMBER,
                                values: [dn],
                            }),
                        }),
                    ]);
                    expect(clientMock.add).not.toHaveBeenCalled();
                });
            });

            describe('error handling', () => {
                it('should return error if person can not be found', async () => {
                    clientMock.search.mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });

                    const result: Result<void> = await ldapClientAdapter.upsertPerson(person, [group]);

                    expectErrResult(result);
                    expect(result.error).toBeInstanceOf(LdapFindPersonError);
                    expect(clientMock.search).toHaveBeenCalledTimes(2);
                    expect(clientMock.modify).toHaveBeenCalledTimes(1);
                    expect(clientMock.add).not.toHaveBeenCalled();
                });

                it('should return an aggregated error if creating a missing group fails', async () => {
                    clientMock.search
                        .mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] })
                        .mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });
                    clientMock.add.mockRejectedValueOnce(undefined);

                    const result: Result<void> = await ldapClientAdapter.upsertPerson(person, [group]);

                    expectErrResult(result);
                    expect(result.error).toBeInstanceOf(LdapSetPersonGroupsError);
                    expect(result.error).toMatchObject({
                        details: [expect.any(LdapCreateGroupError)],
                    });
                    expect(clientMock.add).toHaveBeenCalledTimes(1);
                    expect(clientMock.modify).toHaveBeenCalledTimes(1);
                });

                it('should return an aggregated error if adding a person to a group fails', async () => {
                    clientMock.search
                        .mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] })
                        .mockResolvedValueOnce({ searchEntries: [{ dn: groupDn }], searchReferences: [] });
                    clientMock.modify.mockResolvedValueOnce().mockRejectedValueOnce(undefined);

                    const result: Result<void> = await ldapClientAdapter.upsertPerson(person, [group]);

                    expectErrResult(result);
                    expect(result.error).toBeInstanceOf(LdapSetPersonGroupsError);
                    expect(result.error).toMatchObject({
                        details: [expect.any(LdapAddPersonToGroupError)],
                    });
                    expect(clientMock.modify).toHaveBeenCalledTimes(2);
                    expect(clientMock.modify).toHaveBeenLastCalledWith(groupDn, [
                        new Change({
                            operation: 'add',
                            modification: new Attribute({
                                type: LdapUndiClientAdapter.MEMBER,
                                values: [dn],
                            }),
                        }),
                    ]);
                    expect(clientMock.add).not.toHaveBeenCalled();
                });

                it('should return an aggregated error if removing a person from a group fails', async () => {
                    clientMock.search
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn, memberOf: [groupDn] }],
                            searchReferences: [],
                        })
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn: groupDn, member: [dn] }],
                            searchReferences: [],
                        });
                    clientMock.modify.mockResolvedValueOnce().mockRejectedValueOnce(undefined);

                    const result: Result<void> = await ldapClientAdapter.upsertPerson(person, []);

                    expectErrResult(result);
                    expect(result.error).toBeInstanceOf(LdapSetPersonGroupsError);
                    expect(result.error).toMatchObject({
                        details: [expect.any(LdapRemovePersonFromGroupError)],
                    });
                    expect(clientMock.modify).toHaveBeenCalledTimes(2);
                    expect(clientMock.modify).toHaveBeenLastCalledWith(groupDn, [
                        new Change({
                            operation: 'delete',
                            modification: new Attribute({
                                type: LdapUndiClientAdapter.MEMBER,
                                values: [dn],
                            }),
                        }),
                    ]);
                    expect(clientMock.add).not.toHaveBeenCalled();
                });

                it('should aggregate both errors if adding and removing group memberships fail', async () => {
                    const removedDn: string = `cn=${faker.string.uuid()},cn=groups,ou=${LdapUndiClientAdapter.OEFFENTLICHE_SCHULEN_OU},${instanceConfig.BASE_DN}`;

                    clientMock.search
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn, memberOf: [removedDn] }],
                            searchReferences: [],
                        })
                        .mockResolvedValueOnce({ searchEntries: [{ dn: groupDn }], searchReferences: [] })
                        .mockResolvedValueOnce({
                            searchEntries: [{ dn: removedDn, member: [dn] }],
                            searchReferences: [],
                        });
                    clientMock.modify
                        .mockResolvedValueOnce()
                        .mockRejectedValueOnce(undefined)
                        .mockRejectedValueOnce(undefined);

                    const result: Result<void> = await ldapClientAdapter.upsertPerson(person, [group]);

                    expectErrResult(result);
                    expect(result.error).toBeInstanceOf(LdapSetPersonGroupsError);
                    expect(result.error).toMatchObject({
                        details: [expect.any(LdapAddPersonToGroupError), expect.any(LdapRemovePersonFromGroupError)],
                    });
                    expect(clientMock.modify).toHaveBeenCalledTimes(3);
                    expect(clientMock.add).not.toHaveBeenCalled();
                });

                it('should return an aggregated bind error when adding a person to a group', async () => {
                    clientMock.search.mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] });
                    clientMock.bind.mockResolvedValueOnce().mockResolvedValueOnce().mockRejectedValueOnce(undefined);

                    const result: Result<void> = await ldapClientAdapter.upsertPerson(person, [group]);

                    expectErrResult(result);
                    expect(result.error).toBeInstanceOf(LdapSetPersonGroupsError);
                    expect(result.error).toMatchObject({
                        details: [expect.any(LdapBindError)],
                    });
                    expect(clientMock.bind).toHaveBeenCalledTimes(3);
                    expect(clientMock.search).toHaveBeenCalledTimes(2);
                    expect(clientMock.modify).toHaveBeenCalledTimes(1);
                    expect(clientMock.add).not.toHaveBeenCalled();
                });

                it('should return an aggregated bind error when removing a person from a group', async () => {
                    clientMock.search.mockResolvedValueOnce({
                        searchEntries: [{ dn, memberOf: [groupDn] }],
                        searchReferences: [],
                    });
                    clientMock.bind.mockResolvedValueOnce().mockResolvedValueOnce().mockRejectedValueOnce(undefined);

                    const result: Result<void> = await ldapClientAdapter.upsertPerson(person, []);

                    expectErrResult(result);
                    expect(result.error).toBeInstanceOf(LdapSetPersonGroupsError);
                    expect(result.error).toMatchObject({
                        details: [expect.any(LdapBindError)],
                    });
                    expect(clientMock.bind).toHaveBeenCalledTimes(3);
                    expect(clientMock.search).toHaveBeenCalledTimes(2);
                    expect(clientMock.modify).toHaveBeenCalledTimes(1);
                    expect(clientMock.add).not.toHaveBeenCalled();
                });

                it('should return bind error', async () => {
                    clientMock.bind.mockResolvedValueOnce().mockRejectedValueOnce(undefined);

                    const result: Result<void> = await ldapClientAdapter.upsertPerson(person, [group]);

                    expectErrResult(result);
                    expect(result.error).toBeInstanceOf(LdapBindError);
                    expect(clientMock.search).toHaveBeenCalledTimes(1);
                    expect(clientMock.modify).toHaveBeenCalledTimes(1);
                    expect(clientMock.add).not.toHaveBeenCalled();
                });
            });
        });
    });

    describe('deletePerson', () => {
        it('should search for user and delete it', async () => {
            const id: string = faker.string.uuid();
            const dn: string = `uid=${id}`;

            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockResolvedValue({ searchEntries: [{ dn }], searchReferences: [] });
                clientMock.del.mockResolvedValueOnce();
                return clientMock;
            });

            const result: Result<void> = await ldapClientAdapter.deletePerson(id);

            expectOkResult(result);
            expect(clientMock.search).toHaveBeenNthCalledWith(1, instanceConfig.BASE_DN, {
                filter: `(uid=${id}&objectClass=*)`,
                attributes: [LdapUndiClientAdapter.MEMBER_OF],
            });
            expect(clientMock.search).toHaveBeenNthCalledWith(2, dn, {
                filter: '(objectClass=*)',
                scope: 'base',
                attributes: [LdapUndiClientAdapter.MEMBER_OF],
            });
            expect(clientMock.del).toHaveBeenCalledExactlyOnceWith(dn);
            expect(clientMock.modify).not.toHaveBeenCalled();
        });

        it('should remove user from all groups they are a member of', async () => {
            const id: string = faker.string.uuid();
            const dn: string = `uid=${id}`;
            const groupDns: string[] = [
                `cn=${faker.string.uuid()},cn=groups,${instanceConfig.BASE_DN}`,
                `cn=${faker.string.uuid()},cn=groups,${instanceConfig.BASE_DN}`,
            ];

            ldapClientMock.getClient.mockImplementation(() => clientMock);
            clientMock.bind.mockResolvedValue();
            clientMock.search.mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] });
            clientMock.search.mockResolvedValueOnce({
                searchEntries: [{ dn, memberOf: groupDns }],
                searchReferences: [],
            });
            clientMock.search.mockResolvedValueOnce({
                searchEntries: [{ dn: groupDns[0]!, member: [dn] }],
                searchReferences: [],
            });
            clientMock.search.mockResolvedValueOnce({
                searchEntries: [{ dn: groupDns[1]!, member: [dn] }],
                searchReferences: [],
            });
            clientMock.modify.mockResolvedValueOnce();
            clientMock.modify.mockResolvedValueOnce();
            clientMock.del.mockResolvedValueOnce();

            const result: Result<void> = await ldapClientAdapter.deletePerson(id);

            expectOkResult(result);
            expect(clientMock.modify).toHaveBeenCalledTimes(groupDns.length);
            groupDns.forEach((groupDn: string) => {
                expect(clientMock.search).toHaveBeenCalledWith(groupDn, {
                    scope: 'base',
                    filter: '(objectClass=groupOfNames)',
                    attributes: [LdapUndiClientAdapter.MEMBER],
                });
                expect(clientMock.modify).toHaveBeenCalledWith(groupDn, [
                    new Change({
                        operation: 'delete',
                        modification: new Attribute({
                            type: LdapUndiClientAdapter.MEMBER,
                            values: [dn],
                        }),
                    }),
                ]);
            });
            expect(clientMock.del).toHaveBeenCalledExactlyOnceWith(dn);
            expect(Math.max(...clientMock.modify.mock.invocationCallOrder)).toBeLessThan(
                Math.min(...clientMock.del.mock.invocationCallOrder),
            );
        });

        it('should return ok if the user can not be found', async () => {
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });
                return clientMock;
            });

            const result: Result<void> = await ldapClientAdapter.deletePerson(faker.string.uuid());

            expectOkResult(result);
            expect(clientMock.del).not.toHaveBeenCalled();
            expect(clientMock.modify).not.toHaveBeenCalled();
        });

        it('should return error when setPersonGroups fails', async () => {
            const id: string = faker.string.uuid();
            const dn: string = `uid=${id}`;
            const groupDn: string = `cn=${faker.string.uuid()},cn=groups,${instanceConfig.BASE_DN}`;
            const error: Error = new Error('LDAP group membership removal failed');

            ldapClientMock.getClient.mockReturnValue(clientMock);
            clientMock.bind.mockResolvedValue();
            clientMock.search
                .mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] })
                .mockResolvedValueOnce({
                    searchEntries: [{ dn, memberOf: [groupDn] }],
                    searchReferences: [],
                })
                .mockResolvedValueOnce({
                    searchEntries: [{ dn: groupDn, member: [dn] }],
                    searchReferences: [],
                });
            clientMock.modify.mockRejectedValueOnce(error);

            const result: Result<void> = await ldapClientAdapter.deletePerson(id);

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapSetPersonGroupsError);
            expect(result.error).toMatchObject({
                details: [expect.any(LdapRemovePersonFromGroupError)],
            });
            expect(result.error).toHaveProperty('details.0.details', [error]);
            expect(clientMock.modify).toHaveBeenCalledExactlyOnceWith(groupDn, [
                new Change({
                    operation: 'delete',
                    modification: new Attribute({
                        type: LdapUndiClientAdapter.MEMBER,
                        values: [dn],
                    }),
                }),
            ]);
            expect(clientMock.del).not.toHaveBeenCalled();
            expect(clientMock.add).not.toHaveBeenCalled();
        });

        it('should return delete error', async () => {
            const id: string = faker.string.uuid();
            const dn: string = `uid=${id}`;

            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockResolvedValue({ searchEntries: [{ dn }], searchReferences: [] });
                clientMock.del.mockRejectedValueOnce(undefined);
                return clientMock;
            });

            const result: Result<void> = await ldapClientAdapter.deletePerson(id);

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapDeletePersonError);
            expect(clientMock.del).toHaveBeenCalledExactlyOnceWith(dn);
        });

        it('should return bind error', async () => {
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockRejectedValueOnce(undefined);
                return clientMock;
            });

            const result: Result<void> = await ldapClientAdapter.deletePerson(faker.string.uuid());

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapBindError);
            expect(clientMock.search).not.toHaveBeenCalled();
            expect(clientMock.del).not.toHaveBeenCalled();
            expect(clientMock.modify).not.toHaveBeenCalled();
        });
    });

    describe('setPersonSuspendedById', () => {
        let id: string;
        let dn: string;

        beforeEach(() => {
            id = faker.string.uuid();
            dn = `uid=${id}`;
            ldapClientMock.getClient.mockReturnValue(clientMock);
            clientMock.bind.mockResolvedValue();
            clientMock.search.mockResolvedValue({ searchEntries: [{ dn }], searchReferences: [] });
            clientMock.modify.mockResolvedValue();
        });

        it('should search for user and update it', async () => {
            const groupDn: string = `cn=${faker.string.uuid()},cn=groups,${instanceConfig.BASE_DN}`;
            clientMock.search
                .mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] })
                .mockResolvedValueOnce({
                    searchEntries: [{ dn, memberOf: [groupDn] }],
                    searchReferences: [],
                })
                .mockResolvedValueOnce({
                    searchEntries: [{ dn: groupDn, member: [dn] }],
                    searchReferences: [],
                });

            const result: Result<void> = await ldapClientAdapter.setPersonSuspendedById(id, true);

            expectOkResult(result);
            expect(clientMock.search).toHaveBeenNthCalledWith(1, instanceConfig.BASE_DN, {
                filter: `(uid=${id}&objectClass=*)`,
                attributes: [LdapUndiClientAdapter.MEMBER_OF],
            });
            expect(clientMock.search).toHaveBeenNthCalledWith(2, dn, {
                filter: '(objectClass=*)',
                scope: 'base',
                attributes: [LdapUndiClientAdapter.MEMBER_OF],
            });
            expect(clientMock.search).toHaveBeenNthCalledWith(3, groupDn, {
                scope: 'base',
                filter: '(objectClass=groupOfNames)',
                attributes: [LdapUndiClientAdapter.MEMBER],
            });
            expect(clientMock.modify).toHaveBeenCalledTimes(2);
            expect(clientMock.modify).toHaveBeenNthCalledWith(1, groupDn, [
                new Change({
                    operation: 'delete',
                    modification: new Attribute({
                        type: LdapUndiClientAdapter.MEMBER,
                        values: [dn],
                    }),
                }),
            ]);
            expect(clientMock.modify).toHaveBeenNthCalledWith(2, dn, [
                new Change({
                    operation: 'replace',
                    modification: new Attribute({
                        type: LdapUndiClientAdapter.GESPERRT,
                        values: ['TRUE'],
                    }),
                }),
                new Change({
                    operation: 'replace',
                    modification: new Attribute({
                        type: LdapUndiClientAdapter.DEAKTIVIERT,
                        values: ['TRUE'],
                    }),
                }),
            ]);
            expect(clientMock.add).not.toHaveBeenCalled();
            expect(clientMock.del).not.toHaveBeenCalled();
        });

        it('should error if person can not be found', async () => {
            clientMock.search.mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });

            const result: Result<void> = await ldapClientAdapter.setPersonSuspendedById(id, true);

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapFindPersonError);
            expect(clientMock.search).toHaveBeenCalledTimes(1);
            expect(clientMock.modify).not.toHaveBeenCalled();
            expect(clientMock.add).not.toHaveBeenCalled();
            expect(clientMock.del).not.toHaveBeenCalled();
        });

        it.each([true, false])('should update gesperrt (%s)', async (gesperrt: boolean) => {
            const result: Result<void> = await ldapClientAdapter.setPersonSuspendedById(id, gesperrt);

            expectOkResult(result);
            expect(clientMock.modify).toHaveBeenCalledExactlyOnceWith(dn, [
                new Change({
                    operation: 'replace',
                    modification: new Attribute({
                        type: LdapUndiClientAdapter.GESPERRT,
                        values: [gesperrt ? 'TRUE' : 'FALSE'],
                    }),
                }),
                new Change({
                    operation: 'replace',
                    modification: new Attribute({
                        type: LdapUndiClientAdapter.DEAKTIVIERT,
                        values: ['TRUE'],
                    }),
                }),
            ]);
        });

        it('should return set groups error', async () => {
            const groupDn: string = `cn=${faker.string.uuid()},cn=groups,${instanceConfig.BASE_DN}`;
            const error: Error = new Error('LDAP group membership removal failed');
            clientMock.search
                .mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] })
                .mockResolvedValueOnce({
                    searchEntries: [{ dn, memberOf: [groupDn] }],
                    searchReferences: [],
                })
                .mockResolvedValueOnce({
                    searchEntries: [{ dn: groupDn, member: [dn] }],
                    searchReferences: [],
                });
            clientMock.modify.mockRejectedValueOnce(error);

            const result: Result<void> = await ldapClientAdapter.setPersonSuspendedById(id, true);

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapSetPersonGroupsError);
            expect(result.error).toMatchObject({
                details: [expect.any(LdapRemovePersonFromGroupError)],
            });
            expect(result.error).toHaveProperty('details.0.details', [error]);
            expect(clientMock.modify).toHaveBeenCalledExactlyOnceWith(groupDn, [
                new Change({
                    operation: 'delete',
                    modification: new Attribute({
                        type: LdapUndiClientAdapter.MEMBER,
                        values: [dn],
                    }),
                }),
            ]);
            expect(clientMock.add).not.toHaveBeenCalled();
            expect(clientMock.del).not.toHaveBeenCalled();
        });

        it('should return modify error', async () => {
            const error: Error = new Error('LDAP modify failed');
            clientMock.modify.mockRejectedValueOnce(error);

            const result: Result<void> = await ldapClientAdapter.setPersonSuspendedById(id, true);

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapModifyPersonError);
            expect(result.error).toHaveProperty('details', [error]);
            expect(clientMock.search).toHaveBeenCalledTimes(2);
            expect(clientMock.modify).toHaveBeenCalledExactlyOnceWith(dn, expect.any(Array));
            expect(clientMock.add).not.toHaveBeenCalled();
            expect(clientMock.del).not.toHaveBeenCalled();
        });

        it('should return bind error', async () => {
            clientMock.bind.mockRejectedValueOnce(new Error('LDAP bind failed'));

            const result: Result<void> = await ldapClientAdapter.setPersonSuspendedById(id, true);

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapBindError);
            expect(clientMock.bind).toHaveBeenCalledExactlyOnceWith(
                instanceConfig.BIND_DN,
                instanceConfig.ADMIN_PASSWORD,
            );
            expect(clientMock.search).not.toHaveBeenCalled();
            expect(clientMock.modify).not.toHaveBeenCalled();
            expect(clientMock.add).not.toHaveBeenCalled();
            expect(clientMock.del).not.toHaveBeenCalled();
        });
    });

    describe('updateGroup', () => {
        it('should search for group and update it', async () => {
            const id: string = faker.string.uuid();
            const name: string = faker.string.alphanumeric();
            const dn: string = `cn=${id}`;

            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] });
                clientMock.modify.mockResolvedValueOnce();
                return clientMock;
            });

            const result: Result<void> = await ldapClientAdapter.updateGroup(id, name);

            expectOkResult(result);
            expect(clientMock.modify).toHaveBeenCalled();
        });

        it('should not error if group can not be found', async () => {
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });
                return clientMock;
            });

            const result: Result<void> = await ldapClientAdapter.updateGroup(faker.string.uuid(), 'New Name');

            expectOkResult(result);
        });

        it('should return modify error', async () => {
            const id: string = faker.string.uuid();
            const name: string = faker.string.alphanumeric();
            const dn: string = `cn=${id}`;

            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] });
                clientMock.modify.mockRejectedValueOnce(undefined);
                return clientMock;
            });

            const result: Result<void> = await ldapClientAdapter.updateGroup(id, name);

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapModifyGroupError);
        });

        it('should return bind error', async () => {
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockRejectedValueOnce(undefined);
                return clientMock;
            });

            const result: Result<void> = await ldapClientAdapter.updateGroup(faker.string.uuid(), 'New Name');

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapBindError);
        });
    });

    describe('deleteGroup', () => {
        it('should search for group and delete it', async () => {
            const id: string = faker.string.uuid();
            const dn: string = `cn=${id}`;

            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] });
                clientMock.del.mockResolvedValueOnce();
                return clientMock;
            });

            const result: Result<void> = await ldapClientAdapter.deleteGroup(id);

            expectOkResult(result);
            expect(clientMock.del).toHaveBeenCalledWith(dn);
        });

        it('should not error if group can not be found', async () => {
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });
                return clientMock;
            });

            const result: Result<void> = await ldapClientAdapter.deleteGroup(faker.string.uuid());

            expectOkResult(result);
        });

        it('should return delete error', async () => {
            const id: string = faker.string.uuid();
            const dn: string = `cn=${id}`;

            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockResolvedValue();
                clientMock.search.mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] });
                clientMock.del.mockRejectedValueOnce(undefined);
                return clientMock;
            });

            const result: Result<void> = await ldapClientAdapter.deleteGroup(id);

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapDeleteGroupError);
        });

        it('should return bind error', async () => {
            ldapClientMock.getClient.mockImplementation(() => {
                clientMock.bind.mockRejectedValueOnce(undefined);
                return clientMock;
            });

            const result: Result<void> = await ldapClientAdapter.deleteGroup(faker.string.uuid());

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(LdapBindError);
        });
    });
});
