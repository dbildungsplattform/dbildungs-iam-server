import { Injectable } from '@nestjs/common';
import { Mutex } from 'async-mutex';
import { Attribute, Change, Client, Entry, SearchResult } from 'ldapts';
import { differenceWith } from 'lodash-es';
import { ClassLogger } from '../../../../../core/logging/class-logger.js';
import { OrganisationID, PersonID, PersonUsername } from '../../../../../shared/types/aggregate-ids.types.js';
import { Err, Ok } from '../../../../../shared/util/result.js';
import { LdapUndiClient } from '../technical/ldap-undi-client.js';
import { LdapUndiEmailMicroserviceInstanceConfig } from '../technical/ldap-undi-email-microservice-instance-config.js';
import { LdapBindError } from './error/ldap-bind.error.js';
import { LdapDeleteGroupError } from './error/ldap-delete-group.error.js';
import { LdapEmailDomainError } from './error/ldap-email-domain.error.js';
import { LdapExecuteWithRetryFallbackError } from './error/ldap-execute-with-retry-fallback.error.js';
import { LdapRemovePersonFromGroupError } from './error/ldap-remove-person-from-group.error.js';

export type LdapPersonAttributes = {
    entryUUID?: string;
    dn: string;
    givenName?: string;
    surName?: string;
    cn?: string;
    mailPrimaryAddress?: string;
    mailAlternativeAddress?: string;
};

export type PersonData = {
    uid: PersonID;
    firstName: string;
    lastName: string;
    username: PersonUsername;
    mailPrimaryAddress: string;
    mailSecondaryAddress?: string;
    deaktiviert: boolean;
    gesperrt: boolean;
};

export type GroupData = {
    id: OrganisationID;
    kennung: string;
    name: string;
};

@Injectable()
export class LdapUndiClientAdapter {
    public static readonly FALLBACK_RETRIES: number = 3; // e.g. FALLBACK_RETRIES = 3 will produce retry sequence: 1sek, 8sek, 27sek (1000ms * retrycounter^3)

    public static readonly OEFFENTLICHE_SCHULEN_OU: string = 'oeffentlicheSchulen';

    public static readonly ERSATZ_SCHULEN_OU: string = 'ersatzSchulen';

    public static readonly DN: string = 'dn';

    public static readonly UID: string = 'uid';

    public static readonly GIVEN_NAME: string = 'givenName';

    public static readonly SUR_NAME: string = 'sn';

    public static readonly COMMON_NAME: string = 'cn';

    public static readonly MAIL_PRIMARY_ADDRESS: string = 'mailPrimaryAddress';

    public static readonly MAIL_ALTERNATIVE_ADDRESS: string = 'mailAlternativeAddress';

    public static readonly USER_PASSWORD: string = 'userPassword';

    public static readonly MEMBER: string = 'member';

    public static readonly MEMBER_OF: string = 'memberOf';

    public static readonly ENTRY_UUID: string = 'entryUUID';

    public static readonly DC_SCHULE_SH_DC_DE: string = 'dc=schule-sh,dc=de';

    public static readonly ATTRIBUTE_VALUE_EMPTY: string = 'empty';

    private mutex: Mutex;

    public constructor(
        private readonly ldapClient: LdapUndiClient,
        private readonly ldapInstanceConfig: LdapUndiEmailMicroserviceInstanceConfig,
        private readonly logger: ClassLogger,
    ) {
        this.mutex = new Mutex();
    }

    //** BELOW ONLY PUBLIC FUNCTIONS - MUST USE THE 'executeWithRetry' WRAPPER TO HAVE STRONG FAULT TOLERANCE*/

    // TODO: SPSH-4220 create public retry-wrapped functions for the internal functions
    // Public API:
    // UpsertPerson (takes in person and group data)
    // DeletePerson
    // UpdateGroup (for renamed events)

    public async upsertPerson(person: PersonData, groups: GroupData[]): Promise<Result<void>> {
        return this.executeWithRetry(() => this.upsertPersonInternal(person, groups), this.getNrOfRetries());
    }

    public updateGroup(
        id: string,
        name: string | undefined,
        kennung: string | undefined,
    ): Promise<Result<void>> {
        // TODO
        this.logger.info(`Updating group with id: ${id}, name: ${name}, kennung: ${kennung}`);
        return Promise.resolve(Ok());
    }

    public async deleteGroup(id: string): Promise<Result<void>> {
        return this.executeWithRetry(() => this.deleteGroupInternal(id), this.getNrOfRetries());
    }

    public useLdap(): boolean {
        return this.ldapInstanceConfig.ENABLED;
    }
    //** BELOW ONLY PRIVATE HELPER FUNCTIONS THAT NOT OPERATE ON LDAP - MUST NOT USE THE 'executeWithRetry'/

    private getNrOfRetries(): number {
        return this.ldapInstanceConfig.RETRY_WRAPPER_DEFAULT_RETRIES != null
            ? this.ldapInstanceConfig.RETRY_WRAPPER_DEFAULT_RETRIES
            : LdapUndiClientAdapter.FALLBACK_RETRIES;
    }

    //** BELOW ONLY PRIVATE FUNCTIONS - MUST USE THE 'executeWithRetry' WRAPPER TO HAVE STRONG FAULT TOLERANCE*/

    private async bind(): Promise<Result<boolean>> {
        this.logger.info('LDAP: bind');
        try {
            await this.ldapClient
                .getClient()
                .bind(this.ldapInstanceConfig.BIND_DN, this.ldapInstanceConfig.ADMIN_PASSWORD);
            this.logger.info('LDAP: Successfully connected');
            return {
                ok: true,
                value: true,
            };
        } catch (err) {
            this.logger.logUnknownAsError(`Could not connect to LDAP`, err);

            return { ok: false, error: new LdapBindError() };
        }
    }

    private getRootName(emailDomain: string): Result<string, LdapEmailDomainError> {
        if (emailDomain === this.ldapInstanceConfig.ERSATZSCHULEN_DOMAIN) {
            return {
                ok: true,
                value: LdapUndiClientAdapter.ERSATZ_SCHULEN_OU,
            };
        }
        if (emailDomain === this.ldapInstanceConfig.OEFFENTLICHE_SCHULEN_DOMAIN) {
            return {
                ok: true,
                value: LdapUndiClientAdapter.OEFFENTLICHE_SCHULEN_OU,
            };
        }

        return {
            ok: false,
            error: new LdapEmailDomainError(),
        };
    }

    private getPersonUid(personId: PersonID, rootName: string): string {
        return `uid=${personId},ou=${rootName},${this.ldapInstanceConfig.BASE_DN}`;
    }

    private getRootNameOrError(domain: string): Result<string> {
        const rootName: Result<string> = this.getRootName(domain);
        if (!rootName.ok) {
            this.logger.error(`Could not get root-name because email-domain is invalid, domain:${domain}`);
        }
        return rootName;
    }

    private async upsertPersonInternal(person: PersonData, groups: GroupData[]): Promise<Result<void>> {
        // TODO: SPSH-4220
        // Search for person
        // person doesn't exist?
        // - create person
        // person exists?
        // - update person attributes
        // call setPersonGroupsInternal

        const client: Client = this.ldapClient.getClient();
        const bindResult: Result<boolean> = await this.bind();
        if (!bindResult.ok) {
            return bindResult;
        }

        const personDN: string = `uid=${person.uid},DETERMINE_BRANCH,${this.ldapInstanceConfig.BASE_DN}`;

        const searchResultPerson: SearchResult = await client.search(this.ldapInstanceConfig.BASE_DN, {
            filter: `(${personDN})`,
            attributes: [LdapUndiClientAdapter.MEMBER_OF],
        });

        if (!searchResultPerson.searchEntries[0]) {
            // Create

            try {
                await client.add(personDN, {
                    uid: person.uid,
                    cn: person.username,
                    givenName: person.firstName,
                    sn: person.lastName,
                    mailPrimaryAddress: person.mailPrimaryAddress,
                    mailAlternativeAddress: person.mailSecondaryAddress ?? '',
                    deaktiviert: person.deaktiviert ? 'TRUE' : 'FALSE',
                    gesperrt: person.gesperrt ? 'TRUE' : 'FALSE',

                    mailBoxType: '1',
                    hideFromAddressLists: 'FALSE',
                });
            } catch (_e) {
                // TODO
            }
        } else {
            try {
                const changes: Change[] = [
                    new Change({
                        operation: 'replace',
                        modification: new Attribute({ type: 'cn', values: [person.username] }),
                    }),
                    new Change({
                        operation: 'replace',
                        modification: new Attribute({ type: 'givenName', values: [person.firstName] }),
                    }),
                    new Change({
                        operation: 'replace',
                        modification: new Attribute({ type: 'sn', values: [person.lastName] }),
                    }),
                    new Change({
                        operation: 'replace',
                        modification: new Attribute({
                            type: 'mailPrimaryAddress',
                            values: [person.mailPrimaryAddress],
                        }),
                    }),
                    new Change({
                        operation: 'replace',
                        modification: new Attribute({
                            type: 'mailAlternativeAddress',
                            values: [person.mailSecondaryAddress].filter(Boolean),
                        }),
                    }),

                    new Change({
                        operation: 'replace',
                        modification: new Attribute({
                            type: 'deaktiviert',
                            values: [person.deaktiviert ? 'TRUE' : 'FALSE'],
                        }),
                    }),

                    new Change({
                        operation: 'replace',
                        modification: new Attribute({ type: 'gesperrt', values: [person.gesperrt ? 'TRUE' : 'FALSE'] }),
                    }),
                ];

                await client.modify(personDN, changes);
            } catch (_e) {
                // TODO
            }
        }

        const setGroupsResult: Result<void> = await this.setPersonGroupsInternal(personDN, groups);
        if (!setGroupsResult.ok) {
            // TODO
            return setGroupsResult;
        }

        return Ok();
    }

    private async deletePersonInternal(personUid: string) {
        // TODO: SPSH-4220
        // Search for person
        // person doesn't exist?
        // - done, nothing to do
        // person exists?
        // - delete person

        const client: Client = this.ldapClient.getClient();
        const bindResult: Result<boolean> = await this.bind();
        if (!bindResult.ok) {
            return bindResult;
        }

        const searchResultPerson: SearchResult = await client.search(this.ldapInstanceConfig.BASE_DN, {
            filter: `(uid=${personUid})`,
            attributes: [LdapUndiClientAdapter.MEMBER_OF],
        });

        if (!searchResultPerson.searchEntries[0]) {
            // Person does not exist
            return Ok();
        }

        const personDN: string = searchResultPerson.searchEntries[0].dn;

        const setGroupsResult = await this.setPersonGroupsInternal(personDN, []);
        if (!setGroupsResult.ok) {
            // ? Ask if LDAP is configured to automatically remove dangling references
        }

        try {
            await client.del(personDN);
        } catch (_e) {
            return Err(new Error('TODO'));
        }

        return Ok();
    }

    private async setPersonGroupsInternal(personDN: string, groups: GroupData[]): Promise<Result<void>> {
        // TODO: SPSH-4220
        // Search for groups of person
        // call addPersonToGroupInternal for missing groups
        // call removePersonFromGroupInternal for superfluous groups

        const client: Client = this.ldapClient.getClient();
        const bindResult: Result<boolean> = await this.bind();
        if (!bindResult.ok) {
            return bindResult;
        }

        const searchResultPerson: SearchResult = await client.search(this.ldapInstanceConfig.BASE_DN, {
            filter: `(dn=${personDN})`,
            attributes: [LdapUndiClientAdapter.MEMBER_OF],
        });

        if (!searchResultPerson.searchEntries[0]) {
            return Err(new Error('TODO!'));
        }

        const personGroups: string[] = this.getEntryAttributeAsStringArray(
            searchResultPerson.searchEntries[0],
            LdapUndiClientAdapter.MEMBER_OF,
        );

        // Find additional/missing groups
        const groupsToAdd: GroupData[] = differenceWith(
            groups,
            personGroups,
            (group: GroupData, dn: string) => `cn=${group.id},${this.ldapInstanceConfig.BASE_DN}` === dn,
        );
        const groupsToRemove: string[] = differenceWith(
            personGroups,
            groups,
            (groupDN: string, group: GroupData) => `cn=${group.id},${this.ldapInstanceConfig.BASE_DN}` === groupDN,
        );

        const addResult: Result<void>[] = await Promise.all(
            groupsToAdd.map((group: GroupData) => this.addPersonToGroupInternal(personDN, group)),
        );

        const removeResult: Result<void>[] = await Promise.all(
            groupsToRemove.map((groupDN: string) => this.removePersonFromGroupInternal(personDN, groupDN)),
        );

        const errors: Error[] = addResult
            .concat(removeResult)
            .filter((r: Result<void>) => !r.ok)
            .map((r: { ok: false; error: Error }) => r.error);

        if (errors.length > 0) {
            // TODO
            return Err(new Error('TODO'));
        }

        return Ok();
    }

    private async addPersonToGroupInternal(personDN: string, groupData: GroupData): Promise<Result<void>> {
        // TODO: SPSH-4220
        // Search for group
        // create or update group?
        // - create with person
        // - update group then add person

        const groupDn: string = `cn=${groupData.id},${this.ldapInstanceConfig.BASE_DN}`;
        const groupName: string = `lehrer-${groupData.kennung}`;

        const client: Client = this.ldapClient.getClient();
        const bindResult: Result<boolean> = await this.bind();
        if (!bindResult.ok) {
            return bindResult;
        }

        const searchResultOrgUnit: SearchResult = await client.search(this.ldapInstanceConfig.BASE_DN, {
            filter: `(${groupDn}&objectClass=groupOfNames)`,
        });

        if (!searchResultOrgUnit.searchEntries[0]) {
            // GroupOfNames doesnt exist
            const newOrgUnit: Record<string, string | string[]> = {
                objectclass: ['groupOfNames'],
                cn: groupData.id,
                description: groupName,
                o: groupData.name,
                ou: groupData.kennung,
                member: [personDN],
            };
            try {
                await client.add(groupDn, newOrgUnit);
            } catch (_e) {
                // TODO
                return Err(new Error('TODO'));
            }
        }

        try {
            await client.modify(groupDn, [
                new Change({
                    operation: 'add',
                    modification: new Attribute({
                        type: LdapUndiClientAdapter.MEMBER,
                        values: [personDN],
                    }),
                }),
            ]);
        } catch (_e) {
            // TODO
            return Err(new Error('TODO'));
        }

        return Ok();
    }

    private async removePersonFromGroupInternal(personDN: string, groupDN: string): Promise<Result<void>> {
        const client: Client = this.ldapClient.getClient();
        const bindResult: Result<boolean> = await this.bind();
        if (!bindResult.ok) {
            return bindResult;
        }

        const searchResultOrgUnit: SearchResult = await client.search(this.ldapInstanceConfig.BASE_DN, {
            filter: `(${groupDN}&objectClass=groupOfNames)`,
        });

        if (!searchResultOrgUnit.searchEntries[0]) {
            // Group doesn't exist, no need to remove person
            return Ok();
        }

        if (
            !this.entryAttributeContainsValue(
                searchResultOrgUnit.searchEntries[0],
                LdapUndiClientAdapter.MEMBER,
                personDN,
            )
        ) {
            // Person is not member of group, no need to remove
            return Ok();
        }

        try {
            await client.modify(groupDN, [
                new Change({
                    operation: 'delete',
                    modification: new Attribute({
                        type: LdapUndiClientAdapter.MEMBER,
                        values: [personDN],
                    }),
                }),
            ]);
        } catch (err) {
            return { ok: false, error: new LdapRemovePersonFromGroupError() };
        }

        return Ok();
    }

    private getEntryAttributeAsStringArray(entry: Entry, attribute: string): string[] {
        const attributeValue: string | string[] | Buffer | Buffer[] | undefined = entry[attribute];

        if (typeof attributeValue === 'string') {
            return [attributeValue];
        }

        if (Buffer.isBuffer(attributeValue)) {
            return [attributeValue.toString()];
        }

        if (Array.isArray(attributeValue)) {
            return attributeValue.map((entry: string | Buffer) => {
                if (typeof entry === 'string') {
                    return entry;
                } else {
                    return entry.toString();
                }
            });
        }

        return [];
    }

    private entryAttributeContainsValue(entry: Entry, attribute: string, value: string): boolean {
        return this.getEntryAttributeAsStringArray(entry, attribute).includes(value);
    }

    private async deleteGroupInternal(id: string): Promise<Result<void>> {
        return this.mutex.runExclusive(async () => {
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }

            const searchResultOrgUnit: SearchResult = await client.search(this.ldapInstanceConfig.BASE_DN, {
                filter: `(cn=${id}&objectClass=groupOfNames)`,
            });

            if (!searchResultOrgUnit.searchEntries[0]) {
                // No group exists, no need to delete
                return Ok();
            }

            const dn: string = searchResultOrgUnit.searchEntries[0].dn;

            try {
                await client.del(dn);
            } catch (err) {
                return Err(new LdapDeleteGroupError(id, [err]));
            }

            return Ok();
        });
    }

    private async executeWithRetry<T>(
        func: () => Promise<Result<T>>,
        retries: number,
        delay: number = 15000,
    ): Promise<Result<T>> {
        let currentAttempt: number = 1;
        let result: Result<T, Error> = {
            ok: false,
            error: new LdapExecuteWithRetryFallbackError(),
        };

        while (currentAttempt <= retries) {
            try {
                // eslint-disable-next-line no-await-in-loop
                result = await func();
                if (result.ok) {
                    return result;
                } else {
                    throw result.error;
                }
            } catch (error) {
                this.logger.logUnknownAsError(
                    `Attempt ${currentAttempt} failed. Retrying in ${delay}ms... Remaining retries: ${retries - currentAttempt}`,
                    error,
                );

                if (currentAttempt < retries) {
                    // eslint-disable-next-line no-await-in-loop
                    await this.sleep(delay);
                }
            }
            currentAttempt++;
        }
        this.logger.error(`All ${retries} attempts failed. Exiting with failure.`);
        return result;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise<void>((resolve: () => void) => {
            setTimeout(resolve, ms);
        });
    }
}
