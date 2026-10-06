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
import { LdapCreatePersonError } from './error/ldap-create-person.error.js';
import { LdapModifyPersonError } from './error/ldap-modify-person.error.js';
import { LdapDeletePersonError } from './error/ldap-delete-person.error.js';
import { LdapFindPersonError } from './error/ldap-find-person.error.js';
import { LdapSetPersonGroupsError } from './error/ldap-set-person-groups.error.js';
import { LdapCreateGroupError } from './error/ldap-create-group.error.js';
import { LdapAddPersonToGroupError } from './error/ldap-add-person-to-group.error.js';
import { LdapModifyGroupError } from './error/ldap-modify-group.error.js';

export type PersonDataUndi = {
    domain: string;
    uid: PersonID;
    firstName: string;
    lastName: string;
    username: PersonUsername;
    mailPrimaryAddress: string;
    mailSecondaryAddress?: string;
    deaktiviert: boolean;
    gesperrt: boolean;
};

export type GroupDataUndi = {
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

    public static readonly OBJECT_CLASS: string = 'objectClass';

    public static readonly UID: string = 'uid';

    public static readonly GIVEN_NAME: string = 'givenName';

    public static readonly SUR_NAME: string = 'sn';

    public static readonly COMMON_NAME: string = 'cn';

    public static readonly MAIL_PRIMARY_ADDRESS: string = 'mailPrimaryAddress';

    public static readonly MAIL_ALTERNATIVE_ADDRESS: string = 'mailAlternativeAddress';

    public static readonly DEAKTIVIERT: string = 'deaktiviert';

    public static readonly GESPERRT: string = 'gesperrt';

    public static readonly DESCRIPTION: string = 'description';

    public static readonly ORGANISATION_NAME: string = 'o';

    public static readonly ORGANISTAION_KENNUNG: string = 'ou';

    public static readonly MEMBER: string = 'member';

    public static readonly MEMBER_OF: string = 'memberOf';

    public static readonly USERS_CN: string = 'users';

    public static readonly GROUP_CN: string = 'groups';

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

    public async upsertPerson(person: PersonDataUndi, groups: GroupDataUndi[]): Promise<Result<void>> {
        return this.executeWithRetry(() => this.upsertPersonInternal(person, groups), this.getNrOfRetries());
    }

    public async deletePerson(personID: string): Promise<Result<void>> {
        return this.executeWithRetry(() => this.deletePersonInternal(personID), this.getNrOfRetries());
    }

    public async setPersonSuspendedById(personID: string, gesperrt: boolean): Promise<Result<void>> {
        return this.executeWithRetry(
            () => this.setPersonSuspendedByIdInternal(personID, gesperrt),
            this.getNrOfRetries(),
        );
    }

    /**
     * Updates the group *IF* it exists
     */
    public async updateGroup(id: string, name: string): Promise<Result<void>> {
        return this.executeWithRetry(() => this.updateGroupInternal(id, name), this.getNrOfRetries());
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

    private async upsertPersonInternal(person: PersonDataUndi, groups: GroupDataUndi[]): Promise<Result<void>> {
        const rootNameResult: Result<string> = this.getRootName(person.domain);
        if (!rootNameResult.ok) {
            return rootNameResult;
        }

        const client: Client = this.ldapClient.getClient();
        const bindResult: Result<boolean> = await this.bind();
        if (!bindResult.ok) {
            return bindResult;
        }

        const searchBaseDn: string = `cn=${LdapUndiClientAdapter.USERS_CN},ou=${rootNameResult.value},${this.ldapInstanceConfig.BASE_DN}`;
        const personDN: string = `uid=${person.uid},cn=${LdapUndiClientAdapter.USERS_CN},ou=${rootNameResult.value},${this.ldapInstanceConfig.BASE_DN}`;

        const searchResultPerson: SearchResult = await client.search(searchBaseDn, {
            filter: `(uid=${person.uid})`,
            scope: 'one',
            attributes: [LdapUndiClientAdapter.MEMBER_OF],
        });

        if (!searchResultPerson.searchEntries[0]) {
            // Create new person
            try {
                await client.add(personDN, {
                    [LdapUndiClientAdapter.OBJECT_CLASS]: ['inetOrgPerson', 'univentionMail', 'posixAccount'],
                    [LdapUndiClientAdapter.UID]: person.uid,
                    [LdapUndiClientAdapter.COMMON_NAME]: person.username,
                    [LdapUndiClientAdapter.GIVEN_NAME]: person.firstName,
                    [LdapUndiClientAdapter.SUR_NAME]: person.lastName,
                    [LdapUndiClientAdapter.MAIL_PRIMARY_ADDRESS]: person.mailPrimaryAddress,
                    [LdapUndiClientAdapter.MAIL_ALTERNATIVE_ADDRESS]: person.mailSecondaryAddress ?? '',
                    [LdapUndiClientAdapter.DEAKTIVIERT]: person.deaktiviert ? 'TRUE' : 'FALSE',
                    [LdapUndiClientAdapter.GESPERRT]: person.gesperrt ? 'TRUE' : 'FALSE',

                    mailBoxType: '1',
                    hideFromAddressLists: 'FALSE',
                });
            } catch (e) {
                this.logger.logUnknownAsError(`Could not create person!`, e);
                return Err(new LdapCreatePersonError([e]));
            }
        } else {
            try {
                const changes: Change[] = [
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
                            values: [person.deaktiviert ? 'TRUE' : 'FALSE'],
                        }),
                    }),

                    new Change({
                        operation: 'replace',
                        modification: new Attribute({
                            type: LdapUndiClientAdapter.GESPERRT,
                            values: [person.gesperrt ? 'TRUE' : 'FALSE'],
                        }),
                    }),
                ];

                await client.modify(personDN, changes);
            } catch (e) {
                this.logger.logUnknownAsError(`Could not modify person ${personDN}`, e);
                return Err(new LdapModifyPersonError([e]));
            }
        }

        const setGroupsResult: Result<void> = await this.setPersonGroupsInternal(
            personDN,
            rootNameResult.value,
            groups,
        );
        if (!setGroupsResult.ok) {
            return setGroupsResult;
        }

        return Ok();
    }

    private async setPersonSuspendedByIdInternal(personId: string, gesperrt: boolean): Promise<Result<void>> {
        const client: Client = this.ldapClient.getClient();
        const bindResult: Result<boolean> = await this.bind();
        if (!bindResult.ok) {
            return bindResult;
        }

        const searchResultPerson: SearchResult = await client.search(this.ldapInstanceConfig.BASE_DN, {
            filter: `(uid=${personId})`,
            attributes: [LdapUndiClientAdapter.MEMBER_OF],
        });

        if (!searchResultPerson.searchEntries[0]) {
            this.logger.error(`Could not find person uid=${personId} to suspend`);
            return Err(new LdapFindPersonError());
        }

        const personDN: string = searchResultPerson.searchEntries[0].dn;

        const setGroupsResult: Result<void> = await this.setPersonGroupsInternal(
            personDN,
            '', // empty Base-OU is valid here, because we're only removing groups
            [],
        );
        if (!setGroupsResult.ok) {
            return setGroupsResult;
        }

        try {
            const changes: Change[] = [
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
            ];

            await client.modify(personDN, changes);
        } catch (e) {
            this.logger.logUnknownAsError(`Could not suspend person uid=${personId}`, e);
            return Err(new LdapModifyPersonError([e]));
        }

        return Ok();
    }

    private async deletePersonInternal(personUid: string): Promise<Result<void>> {
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
            this.logger.info(`Person uid=${personUid} does not exist, no need to delete them`);
            return Ok();
        }

        const personDN: string = searchResultPerson.searchEntries[0].dn;

        const setGroupsResult: Result<void> = await this.setPersonGroupsInternal(
            personDN,
            '', // empty Base-OU is valid here, because we're only removing groups
            [],
        );
        if (!setGroupsResult.ok) {
            return setGroupsResult;
        }

        try {
            await client.del(personDN);
        } catch (e) {
            this.logger.logUnknownAsError(`Could not delete person ${personDN}`, e);
            return Err(new LdapDeletePersonError([e]));
        }

        return Ok();
    }

    private async setPersonGroupsInternal(
        personDN: string,
        baseOu: string,
        groups: GroupDataUndi[],
    ): Promise<Result<void>> {
        const client: Client = this.ldapClient.getClient();
        const bindResult: Result<boolean> = await this.bind();
        if (!bindResult.ok) {
            return bindResult;
        }

        const searchResultPerson: SearchResult = await client.search(personDN, {
            filter: `(objectClass=*)`,
            scope: 'base',
            attributes: [LdapUndiClientAdapter.MEMBER_OF],
        });

        if (!searchResultPerson.searchEntries[0]) {
            this.logger.error(`Could not find person ${personDN} for setting groups`);
            return Err(new LdapFindPersonError());
        }

        const personGroups: string[] = this.getEntryAttributeAsStringArray(
            searchResultPerson.searchEntries[0],
            LdapUndiClientAdapter.MEMBER_OF,
        );

        // Find additional/missing groups
        const groupsToAdd: GroupDataUndi[] = differenceWith(
            groups,
            personGroups,
            (group: GroupDataUndi, dn: string) =>
                `cn=${group.id},cn=${LdapUndiClientAdapter.GROUP_CN},ou=${baseOu},${this.ldapInstanceConfig.BASE_DN}` ===
                dn,
        );

        const groupsToRemove: string[] = differenceWith(
            personGroups,
            groups,
            (groupDN: string, group: GroupDataUndi) =>
                `cn=${group.id},cn=${LdapUndiClientAdapter.GROUP_CN},ou=${baseOu},${this.ldapInstanceConfig.BASE_DN}` ===
                groupDN,
        );

        const addResult: Result<void>[] = await Promise.all(
            groupsToAdd.map((group: GroupDataUndi) => this.addPersonToGroupInternal(personDN, baseOu, group)),
        );

        const removeResult: Result<void>[] = await Promise.all(
            groupsToRemove.map((groupDN: string) => this.removePersonFromGroupInternal(personDN, groupDN)),
        );

        const errors: Error[] = addResult
            .concat(removeResult)
            .filter((r: Result<void>) => !r.ok)
            .map((r: { ok: false; error: Error }) => r.error);

        if (errors.length > 0) {
            return Err(new LdapSetPersonGroupsError(personDN, errors));
        }

        return Ok();
    }

    private async addPersonToGroupInternal(
        personDN: string,
        baseOu: string,
        groupData: GroupDataUndi,
    ): Promise<Result<void>> {
        const searchBaseDn: string = `cn=${LdapUndiClientAdapter.GROUP_CN},ou=${baseOu},${this.ldapInstanceConfig.BASE_DN}`;
        const groupDn: string = `cn=${groupData.id},cn=${LdapUndiClientAdapter.GROUP_CN},ou=${baseOu},${this.ldapInstanceConfig.BASE_DN}`;
        const groupName: string = `lehrer-${groupData.kennung}`;

        const client: Client = this.ldapClient.getClient();
        const bindResult: Result<boolean> = await this.bind();
        if (!bindResult.ok) {
            return bindResult;
        }

        const searchResultOrgUnit: SearchResult = await client.search(searchBaseDn, {
            filter: `(cn=${groupData.id}&objectClass=groupOfNames)`,
            scope: 'one',
        });

        if (!searchResultOrgUnit.searchEntries[0]) {
            // GroupOfNames doesnt exist
            const newOrgUnit: Record<string, string | string[]> = {
                [LdapUndiClientAdapter.OBJECT_CLASS]: ['groupOfNames'],
                [LdapUndiClientAdapter.COMMON_NAME]: groupData.id,
                [LdapUndiClientAdapter.DESCRIPTION]: groupName,
                [LdapUndiClientAdapter.ORGANISATION_NAME]: groupData.name,
                [LdapUndiClientAdapter.ORGANISTAION_KENNUNG]: groupData.kennung,
                [LdapUndiClientAdapter.MEMBER]: [personDN],
            };
            try {
                await client.add(groupDn, newOrgUnit);
            } catch (e) {
                this.logger.logUnknownAsError(`Could create group ${groupDn}`, e);
                return Err(new LdapCreateGroupError(groupData.id, [e]));
            }
        } else {
            // GroupOfNames already exists, modify members
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
            } catch (e) {
                this.logger.logUnknownAsError(`Could not add person ${personDN} to group ${groupDn}`, e);
                return Err(new LdapAddPersonToGroupError([e]));
            }
        }

        return Ok();
    }

    private async removePersonFromGroupInternal(personDN: string, groupDN: string): Promise<Result<void>> {
        const client: Client = this.ldapClient.getClient();
        const bindResult: Result<boolean> = await this.bind();
        if (!bindResult.ok) {
            return bindResult;
        }

        const searchResultOrgUnit: SearchResult = await client.search(groupDN, {
            scope: 'base',
            filter: `(objectClass=groupOfNames)`,
            attributes: [LdapUndiClientAdapter.MEMBER],
        });

        if (!searchResultOrgUnit.searchEntries[0]) {
            // Group doesn't exist, no need to remove person
            this.logger.info(`Group ${groupDN} does not exist, no need to remove person ${personDN}`);
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
            this.logger.info(`Person ${personDN} is not a member of group ${groupDN}, no need to remove them.`);
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
        } catch (e) {
            this.logger.logUnknownAsError(`Could not remove person ${personDN} from group ${groupDN}`, e);
            return { ok: false, error: new LdapRemovePersonFromGroupError([e]) };
        }

        return Ok();
    }

    private async updateGroupInternal(id: string, name: string): Promise<Result<void>> {
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
                // No group exists
                this.logger.info(`Group id=${id} does not exist, no need to rename`);
                return Ok();
            }

            const dn: string = searchResultOrgUnit.searchEntries[0].dn;

            try {
                const change: Change = new Change({
                    operation: 'replace',
                    modification: new Attribute({
                        type: LdapUndiClientAdapter.ORGANISATION_NAME,
                        values: [name],
                    }),
                });

                await client.modify(dn, change);
            } catch (e) {
                this.logger.logUnknownAsError(`Could not rename group id=${id} to new name "${name}"`, e);
                return Err(new LdapModifyGroupError(id, [e]));
            }

            return Ok();
        });
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
                this.logger.info(`Group id=${id} does not exist, no need to delete it.`);
                return Ok();
            }

            const dn: string = searchResultOrgUnit.searchEntries[0].dn;

            try {
                await client.del(dn);
            } catch (e) {
                this.logger.logUnknownAsError(`Could not delete group id=${id}`, e);
                return Err(new LdapDeleteGroupError(id, [e]));
            }

            return Ok();
        });
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
