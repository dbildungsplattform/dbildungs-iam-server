import { faker } from '@faker-js/faker';
import { Client } from 'ldapts';
import { createMock, type DeepMocked } from '../../../../../../test/utils/createMock.js';
import { expectErrResult, expectOkResult } from '../../../../../../test/utils/test-types.js';
import { ClassLogger } from '../../../../../core/logging/class-logger.js';
import { createPersonDataUndi } from '../../../../test/person-data-undi.factory.js';
import { LdapUndiClient } from '../technical/ldap-undi-client.js';
import type { LdapUndiEmailMicroserviceInstanceConfig } from '../technical/ldap-undi-email-microservice-instance-config.js';
import { type GroupDataUndi, LdapUndiClientAdapter, type PersonDataUndi } from './ldap-undi-client.adapter.js';
import { LdapCreatePersonError } from './error/ldap-create-person.error.js';
import { LdapSetPersonGroupsError } from './error/ldap-set-person-groups.error.js';

describe('ldap-undi-client.adapter', () => {
    function createSetup(): {
        adapter: LdapUndiClientAdapter;
        clientMock: DeepMocked<Client>;
        loggerMock: DeepMocked<ClassLogger>;
        config: LdapUndiEmailMicroserviceInstanceConfig;
        person: PersonDataUndi;
    } {
        const clientMock: DeepMocked<Client> = createMock(Client);
        const loggerMock: DeepMocked<ClassLogger> = createMock(ClassLogger);
        const config: LdapUndiEmailMicroserviceInstanceConfig = {
            ENABLED: true,
            BASE_DN: 'dc=example,dc=com',
            OEFFENTLICHE_SCHULEN_DOMAIN: 'schule-sh.de',
            ERSATZSCHULEN_DOMAIN: 'ersatzschule-sh.de',
            RETRY_WRAPPER_NUMBER_OF_RETRIES: 1,
            RETRY_WRAPPER_DELAY_IN_MS: 1,
            URL: '',
            BIND_DN: '',
            ADMIN_PASSWORD: '',
        };
        const ldapClientMock: DeepMocked<LdapUndiClient> = createMock(LdapUndiClient);
        ldapClientMock.getClient.mockReturnValue(clientMock);
        const adapter: LdapUndiClientAdapter = new LdapUndiClientAdapter(ldapClientMock, config, loggerMock);
        const person: PersonDataUndi = createPersonDataUndi({
            domain: config.OEFFENTLICHE_SCHULEN_DOMAIN,
        });
        return { adapter, clientMock, loggerMock, config, person };
    }

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('upsertPerson', () => {
        describe.each([false, true])('when persistence succeeds (existing person: %s)', (existingPerson: boolean) => {
            function setup(): ReturnType<typeof createSetup> {
                const context: ReturnType<typeof createSetup> = createSetup();
                const { clientMock, loggerMock, config, person }: ReturnType<typeof createSetup> = context;
                const dn: string = `uid=${person.uid},cn=users,ou=oeffentlich,${config.BASE_DN}`;
                clientMock.bind.mockResolvedValueOnce().mockResolvedValueOnce();
                if (existingPerson) {
                    clientMock.modify.mockResolvedValueOnce();
                } else {
                    clientMock.add.mockResolvedValueOnce();
                }
                clientMock.search
                    .mockResolvedValueOnce({
                        searchEntries: existingPerson ? [{ dn }] : [],
                        searchReferences: [],
                    })
                    .mockImplementationOnce(() => {
                        expect(loggerMock.info).not.toHaveBeenCalledWith(
                            `LDAP UNDI: Successfully completed upsertPerson - spshPersonId=${person.uid}`,
                        );
                        return Promise.resolve({ searchEntries: [], searchReferences: [] });
                    });

                return context;
            }

            it('should log start before persistence and success only after group reconciliation', async () => {
                const { adapter, clientMock, loggerMock, person }: ReturnType<typeof setup> = setup();

                const resultPromise: Promise<Result<void>> = adapter.upsertPerson(person, []);

                expect(loggerMock.info).toHaveBeenCalledExactlyOnceWith(
                    `LDAP UNDI: Started upsertPerson - spshPersonId=${person.uid}`,
                );
                expect(clientMock.bind).not.toHaveBeenCalled();

                const result: Result<void> = await resultPromise;

                expectOkResult(result);
                expect(clientMock.search).toHaveBeenCalledTimes(2);
                expect(loggerMock.info).toHaveBeenLastCalledWith(
                    `LDAP UNDI: Successfully completed upsertPerson - spshPersonId=${person.uid}`,
                );
            });
        });

        describe.each(['person', 'groups'])('when persisting %s fails', (failure: string) => {
            function setup(): ReturnType<typeof createSetup> & { groups: GroupDataUndi[] } {
                const context: ReturnType<typeof createSetup> = createSetup();
                const { clientMock }: ReturnType<typeof createSetup> = context;
                const error: Error = new Error('LDAP add failed');
                const groups: GroupDataUndi[] = [];
                clientMock.bind.mockResolvedValueOnce();
                clientMock.search.mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });
                if (failure === 'person') {
                    clientMock.add.mockRejectedValueOnce(error);
                } else {
                    groups.push({ id: faker.string.uuid(), kennung: '123456', name: 'School' });
                    clientMock.bind.mockResolvedValueOnce().mockResolvedValueOnce();
                    clientMock.search
                        .mockResolvedValueOnce({ searchEntries: [], searchReferences: [] })
                        .mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });
                    clientMock.add.mockResolvedValueOnce().mockRejectedValueOnce(error);
                }

                return { ...context, groups };
            }

            it('should retain error logging without logging success', async () => {
                const { adapter, loggerMock, person, groups }: ReturnType<typeof setup> = setup();

                const result: Result<void> = await adapter.upsertPerson(person, groups);

                expectErrResult(result);
                expect(result.error).toBeInstanceOf(
                    failure === 'person' ? LdapCreatePersonError : LdapSetPersonGroupsError,
                );
                expect(loggerMock.info).toHaveBeenCalledWith(
                    `LDAP UNDI: Started upsertPerson - spshPersonId=${person.uid}`,
                );
                expect(loggerMock.info).not.toHaveBeenCalledWith(
                    `LDAP UNDI: Successfully completed upsertPerson - spshPersonId=${person.uid}`,
                );
                expect(loggerMock.logUnknownAsError).toHaveBeenCalled();
                expect(loggerMock.error).toHaveBeenCalledExactlyOnceWith(
                    'All 1 attempts failed. Exiting with failure.',
                );
            });
        });

        describe('when persistence succeeds after a retry', () => {
            function setup(): ReturnType<typeof createSetup> {
                const context: ReturnType<typeof createSetup> = createSetup();
                const { clientMock, config }: ReturnType<typeof createSetup> = context;
                vi.useFakeTimers({ toFake: ['setTimeout'] });
                config.RETRY_WRAPPER_NUMBER_OF_RETRIES = 2;
                clientMock.bind
                    .mockRejectedValueOnce(new Error('LDAP bind failed'))
                    .mockResolvedValueOnce()
                    .mockResolvedValueOnce();
                clientMock.search
                    .mockResolvedValueOnce({ searchEntries: [], searchReferences: [] })
                    .mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });
                clientMock.add.mockResolvedValueOnce();

                return context;
            }

            it('should log start and success only once', async () => {
                const { adapter, clientMock, loggerMock, person }: ReturnType<typeof setup> = setup();

                const resultPromise: Promise<Result<void>> = adapter.upsertPerson(person, []);
                await vi.runAllTimersAsync();
                const result: Result<void> = await resultPromise;

                expectOkResult(result);
                expect(clientMock.bind).toHaveBeenCalledTimes(3);
                expect(
                    loggerMock.info.mock.calls.filter(([message]: Parameters<ClassLogger['info']>) =>
                        message.includes('upsertPerson'),
                    ),
                ).toEqual([
                    [`LDAP UNDI: Started upsertPerson - spshPersonId=${person.uid}`],
                    [`LDAP UNDI: Successfully completed upsertPerson - spshPersonId=${person.uid}`],
                ]);
            });
        });

        describe('deletePerson', () => {
            function setup(): ReturnType<typeof createSetup> {
                const context: ReturnType<typeof createSetup> = createSetup();
                const { clientMock, config, person }: ReturnType<typeof createSetup> = context;
                const dn: string = `uid=${person.uid},cn=users,ou=oeffentlich,${config.BASE_DN}`;
                clientMock.bind.mockResolvedValueOnce().mockResolvedValueOnce();
                clientMock.search
                    .mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] })
                    .mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });
                clientMock.del.mockResolvedValueOnce();

                return context;
            }

            it('should log start and success with the person ID', async () => {
                const { adapter, clientMock, loggerMock, person }: ReturnType<typeof setup> = setup();

                const resultPromise: Promise<Result<void>> = adapter.deletePerson(person.uid);

                expect(loggerMock.info).toHaveBeenCalledExactlyOnceWith(
                    `LDAP UNDI: Started deletePerson - spshPersonId=${person.uid}`,
                );
                expect(clientMock.bind).not.toHaveBeenCalled();

                const result: Result<void> = await resultPromise;

                expectOkResult(result);
                expect(clientMock.del).toHaveBeenCalledTimes(1);
                expect(loggerMock.info).toHaveBeenLastCalledWith(
                    `LDAP UNDI: Successfully completed deletePerson - spshPersonId=${person.uid}`,
                );
            });
        });

        describe('setPersonSuspendedById', () => {
            function setup(): ReturnType<typeof createSetup> {
                const context: ReturnType<typeof createSetup> = createSetup();
                const { clientMock, config, person }: ReturnType<typeof createSetup> = context;
                const dn: string = `uid=${person.uid},cn=users,ou=oeffentlich,${config.BASE_DN}`;
                clientMock.bind.mockResolvedValueOnce().mockResolvedValueOnce();
                clientMock.search
                    .mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] })
                    .mockResolvedValueOnce({ searchEntries: [], searchReferences: [] });
                clientMock.modify.mockResolvedValueOnce();

                return context;
            }

            it('should log start and success with the person ID', async () => {
                const { adapter, clientMock, loggerMock, person }: ReturnType<typeof setup> = setup();

                const resultPromise: Promise<Result<void>> = adapter.setPersonSuspendedById(person.uid, true);

                expect(loggerMock.info).toHaveBeenCalledExactlyOnceWith(
                    `LDAP UNDI: Started setPersonSuspendedById - spshPersonId=${person.uid}`,
                );
                expect(clientMock.bind).not.toHaveBeenCalled();

                const result: Result<void> = await resultPromise;

                expectOkResult(result);
                expect(clientMock.modify).toHaveBeenCalledTimes(1);
                expect(loggerMock.info).toHaveBeenLastCalledWith(
                    `LDAP UNDI: Successfully completed setPersonSuspendedById - spshPersonId=${person.uid}`,
                );
            });
        });

        describe('updateGroup', () => {
            function setup(): ReturnType<typeof createSetup> & { group: GroupDataUndi } {
                const context: ReturnType<typeof createSetup> = createSetup();
                const { clientMock, config }: ReturnType<typeof createSetup> = context;
                const group: GroupDataUndi = { id: faker.string.uuid(), kennung: '123456', name: 'School' };
                const dn: string = `cn=${group.id},cn=groups,ou=oeffentlich,${config.BASE_DN}`;
                clientMock.bind.mockResolvedValueOnce();
                clientMock.search.mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] });
                clientMock.modify.mockResolvedValueOnce();

                return { ...context, group };
            }

            it('should log start and success with the organisation ID', async () => {
                const { adapter, clientMock, loggerMock, group }: ReturnType<typeof setup> = setup();

                const resultPromise: Promise<Result<void>> = adapter.updateGroup(group.id, group.name);

                expect(loggerMock.info).toHaveBeenCalledExactlyOnceWith(
                    `LDAP UNDI: Started updateGroup - organisationId=${group.id}`,
                );
                expect(clientMock.bind).not.toHaveBeenCalled();

                const result: Result<void> = await resultPromise;

                expectOkResult(result);
                expect(clientMock.modify).toHaveBeenCalledTimes(1);
                expect(loggerMock.info).toHaveBeenLastCalledWith(
                    `LDAP UNDI: Successfully completed updateGroup - organisationId=${group.id}`,
                );
            });
        });

        describe('deleteGroup', () => {
            function setup(): ReturnType<typeof createSetup> & { groupId: string } {
                const context: ReturnType<typeof createSetup> = createSetup();
                const { clientMock, config }: ReturnType<typeof createSetup> = context;
                const groupId: string = faker.string.uuid();
                const dn: string = `cn=${groupId},cn=groups,ou=oeffentlich,${config.BASE_DN}`;
                clientMock.bind.mockResolvedValueOnce();
                clientMock.search.mockResolvedValueOnce({ searchEntries: [{ dn }], searchReferences: [] });
                clientMock.del.mockResolvedValueOnce();

                return { ...context, groupId };
            }

            it('should log start and success with the organisation ID', async () => {
                const { adapter, clientMock, loggerMock, groupId }: ReturnType<typeof setup> = setup();

                const resultPromise: Promise<Result<void>> = adapter.deleteGroup(groupId);

                expect(loggerMock.info).toHaveBeenCalledExactlyOnceWith(
                    `LDAP UNDI: Started deleteGroup - organisationId=${groupId}`,
                );
                expect(clientMock.bind).not.toHaveBeenCalled();

                const result: Result<void> = await resultPromise;

                expectOkResult(result);
                expect(clientMock.del).toHaveBeenCalledTimes(1);
                expect(loggerMock.info).toHaveBeenLastCalledWith(
                    `LDAP UNDI: Successfully completed deleteGroup - organisationId=${groupId}`,
                );
            });
        });
    });
});
