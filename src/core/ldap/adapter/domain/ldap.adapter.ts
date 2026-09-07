import { Injectable } from '@nestjs/common';
import { Mutex } from 'async-mutex';
import { Attribute, Change, Client, Entry, NoSuchObjectError, SearchResult } from 'ldapts';
import { UsernameRequiredError } from '../../../../modules/person/domain/username-required.error.js';
import { KafkaLdapPersonEntryChangedEvent } from '../../../../shared/events/ldap/kafka-ldap-person-entry-changed.event.js';
import { LdapPersonEntryChangedEvent } from '../../../../shared/events/ldap/ldap-person-entry-changed.event.js';
import { OrganisationKennung, PersonID, PersonUsername } from '../../../../shared/types/aggregate-ids.types.js';
import { generatePassword } from '../../../../shared/util/password-generator.js';
import { Err, Ok } from '../../../../shared/util/result.js';
import { EventRoutingLegacyKafkaService } from '../../../eventbus/services/event-routing-legacy-kafka.service.js';
import { ClassLogger } from '../../../logging/class-logger.js';
import { LdapAddPersonToGroupError } from './error/ldap-add-person-to-group.error.js';
import { LdapCreateLehrerError } from './error/ldap-create-lehrer.error.js';
import { LdapDeleteOrganisationError } from './error/ldap-delete-organisation.error.js';
import { LdapEmailAddressError } from './error/ldap-email-address.error.js';
import { LdapEmailDomainError } from './error/ldap-email-domain.error.js';
import { LdapFetchAttributeError } from './error/ldap-fetch-attribute.error.js';
import { LdapModifyEmailError } from './error/ldap-modify-email.error.js';
import { LdapModifyUserPasswordError } from './error/ldap-modify-user-password.error.js';
import { LdapRemovePersonFromGroupError } from './error/ldap-remove-person-from-group.error.js';
import { LdapSearchError } from './error/ldap-search.error.js';
import { LdapInstanceConfig } from '../technical/ldap-instance-config.js';
import { LdapClient } from '../technical/ldap-client.js';
import { LdapEntityType, LdapPersonEntry } from './ldap.types.js';
import { LdapBindError } from './error/ldap-bind.error.js';

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
    vorname: string;
    familienname: string;
    id: string;
    username?: string;
    ldapEntryUUID?: string;
};

@Injectable()
export class LdapAdapter {
    public static readonly FALLBACK_RETRIES: number = 3; // e.g. FALLBACK_RETRIES = 3 will produce retry sequence: 1sek, 8sek, 27sek (1000ms * retrycounter^3)

    public static readonly OEFFENTLICHE_SCHULEN_DOMAIN_DEFAULT: string = 'schule-sh.de';

    public static readonly ERSATZ_SCHULEN_DOMAIN_DEFAULT: string = 'ersatzschule-sh.de';

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

    public static readonly ENTRY_UUID: string = 'entryUUID';

    public static readonly DC_SCHULE_SH_DC_DE: string = 'dc=schule-sh,dc=de';

    public static readonly GID_NUMBER: string = '100'; //because 0 to 99 are used for statically allocated user groups on Unix-systems

    public static readonly UID_NUMBER: string = '100'; //to match the GID_NUMBER rule above and 0 is reserved for super-user

    public static readonly HOME_DIRECTORY: string = 'none'; //highlight it's a dummy value

    public static readonly ATTRIBUTE_VALUE_EMPTY: string = 'empty';

    private static readonly GROUPS: string = 'groups';

    private mutex: Mutex;

    private addPersonToGroupMutex: Mutex;

    private deletePersonFromGroupMutex: Mutex;

    public constructor(
        private readonly ldapClient: LdapClient,
        private readonly ldapInstanceConfig: LdapInstanceConfig,
        private readonly logger: ClassLogger,
        private readonly eventService: EventRoutingLegacyKafkaService,
    ) {
        this.mutex = new Mutex();
        this.addPersonToGroupMutex = new Mutex();
        this.deletePersonFromGroupMutex = new Mutex();
    }

    //** BELOW ONLY PUBLIC FUNCTIONS - MUST USE THE 'executeWithRetry' WRAPPER TO HAVE STRONG FAULT TOLERANCE*/

    public async createLehrer(
        person: PersonData,
        domain: string,
        schulId: string,
        mail?: string,
    ): Promise<Result<PersonData>> {
        return this.executeWithRetry(
            () => this.createLehrerInternal(person, domain, schulId, mail),
            this.getNrOfRetries(),
        );
    }

    public async isLehrerExisting(username: PersonUsername, domain: string): Promise<Result<boolean>> {
        return this.executeWithRetry(() => this.isLehrerExistingInternal(username, domain), this.getNrOfRetries());
    }

    public async modifyPersonAttributes(
        oldUsername: PersonUsername,
        newGivenName?: string,
        newSn?: string,
        newUsername?: PersonUsername,
    ): Promise<Result<PersonUsername>> {
        return this.executeWithRetry(
            () => this.modifyPersonAttributesInternal(oldUsername, newGivenName, newSn, newUsername),
            this.getNrOfRetries(),
        );
    }

    public async getPersonAttributes(
        personId: PersonID,
        username: PersonUsername,
        domain: string,
    ): Promise<Result<LdapPersonAttributes>> {
        return this.executeWithRetry(
            () => this.getPersonAttributesInternal(personId, username, domain),
            this.getNrOfRetries(),
        );
    }

    public async setMailAlternativeAddress(
        personId: PersonID,
        username: PersonUsername,
        newMailAlternativeAddress: string,
    ): Promise<Result<PersonID>> {
        return this.executeWithRetry(
            () => this.setMailAlternativeAddressInternal(personId, username, newMailAlternativeAddress),
            this.getNrOfRetries(),
        );
    }

    public async getGroupsForPerson(personId: PersonID, username: PersonUsername): Promise<Result<string[]>> {
        return this.executeWithRetry(() => this.getGroupsForPersonInternal(personId, username), this.getNrOfRetries());
    }

    public async updateMemberDnInGroups(
        oldUsername: PersonUsername,
        newUsername: PersonUsername,
        oldUid: string,
        client: Client,
    ): Promise<Result<string>> {
        return this.executeWithRetry(
            () => this.updateMemberDnInGroupsInternal(oldUsername, newUsername, oldUid, client),
            this.getNrOfRetries(),
        );
    }

    public async deleteLehrerByUsername(
        username: PersonUsername,
        failIfUserNotFound: boolean = false,
    ): Promise<Result<string | null>> {
        return this.executeWithRetry(
            () => this.deleteLehrerByUsernameInternal(username, failIfUserNotFound),
            this.getNrOfRetries(),
        );
    }

    public async deleteLehrer(
        person: PersonData,
        orgaKennung: OrganisationKennung,
        domain: string,
    ): Promise<Result<PersonData>> {
        return this.executeWithRetry(
            () => this.deleteLehrerInternal(person, orgaKennung, domain),
            this.getNrOfRetries(),
        );
    }

    public async addPersonToGroup(
        personUid: string,
        orgaKennung: OrganisationKennung,
        lehrerUid: string,
    ): Promise<Result<boolean>> {
        return this.executeWithRetry(
            () => this.addPersonToGroupInternal(personUid, orgaKennung, lehrerUid),
            this.getNrOfRetries(),
        );
    }

    public async removeMailAlternativeAddress(
        personId: PersonID | undefined,
        username: PersonUsername,
        address: string,
    ): Promise<Result<boolean>> {
        return this.executeWithRetry(
            () => this.removeMailAlternativeAddressInternal(personId, username, address),
            this.getNrOfRetries(),
        );
    }

    public async changeEmailAddressByPersonId(
        personId: PersonID,
        username: PersonUsername,
        newEmailAddress: string,
        alternativeEmailAddress?: string,
    ): Promise<Result<PersonID>> {
        return this.executeWithRetry(
            () =>
                this.changeEmailAddressByPersonIdInternal(personId, username, newEmailAddress, alternativeEmailAddress),
            this.getNrOfRetries(),
        );
    }

    public async removePersonFromGroup(
        username: PersonUsername,
        orgaKennung: OrganisationKennung,
        lehrerUid: string,
    ): Promise<Result<boolean>> {
        return this.executeWithRetry(
            () => this.removePersonFromGroupInternal(username, orgaKennung, lehrerUid),
            this.getNrOfRetries(),
        );
    }

    public async removePersonFromGroupByUsernameAndKennung(
        username: PersonUsername,
        orgaKennung: OrganisationKennung,
        domain: string,
    ): Promise<Result<boolean>> {
        const rootName: Result<string> = this.getRootNameOrError(domain);
        if (!rootName.ok) {
            return rootName;
        }

        const lehrerUid: string = this.getLehrerUid(username, rootName.value);

        return this.removePersonFromGroup(username, orgaKennung, lehrerUid);
    }

    public async changeUserPasswordByPersonId(personId: PersonID, username: PersonUsername): Promise<Result<PersonID>> {
        return this.executeWithRetry(
            () => this.changeUserPasswordByPersonIdInternal(personId, username),
            this.getNrOfRetries(),
        );
    }

    public async deleteOrganisation(kennung: string): Promise<Result<string>> {
        return this.executeWithRetry(() => this.deleteOrganisationInternal(kennung), this.getNrOfRetries());
    }

    //** BELOW ONLY PUBLIC HELPER FUNCTIONS THAT NOT OPERATE ON LDAP - MUST NOT USE THE 'executeWithRetry'/

    public createNewLehrerUidFromOldUid(oldUid: string, newUsername: PersonUsername): string {
        const splitted: string[] = oldUid.split(',');
        splitted[0] = `uid=${newUsername}`;
        return splitted.join(',');
    }

    //** BELOW ONLY PRIVATE HELPER FUNCTIONS THAT NOT OPERATE ON LDAP - MUST NOT USE THE 'executeWithRetry'/

    private getNrOfRetries(): number {
        return this.ldapInstanceConfig.RETRY_WRAPPER_DEFAULT_RETRIES != null
            ? this.ldapInstanceConfig.RETRY_WRAPPER_DEFAULT_RETRIES
            : LdapAdapter.FALLBACK_RETRIES;
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
        if (
            emailDomain === this.ldapInstanceConfig.ERSATZSCHULEN_DOMAIN ||
            emailDomain === LdapAdapter.ERSATZ_SCHULEN_DOMAIN_DEFAULT
        ) {
            return {
                ok: true,
                value: LdapAdapter.ERSATZ_SCHULEN_OU,
            };
        }
        if (
            emailDomain === this.ldapInstanceConfig.OEFFENTLICHE_SCHULEN_DOMAIN ||
            emailDomain === LdapAdapter.OEFFENTLICHE_SCHULEN_DOMAIN_DEFAULT
        ) {
            return {
                ok: true,
                value: LdapAdapter.OEFFENTLICHE_SCHULEN_OU,
            };
        }

        return {
            ok: false,
            error: new LdapEmailDomainError(),
        };
    }

    private getLehrerUid(username: PersonUsername, rootName: string): string {
        return `uid=${username},ou=${rootName},${this.ldapInstanceConfig.BASE_DN}`;
    }

    private getRootNameOrError(domain: string): Result<string> {
        const rootName: Result<string> = this.getRootName(domain);
        if (!rootName.ok) {
            this.logger.error(`Could not get root-name because email-domain is invalid, domain:${domain}`);
        }
        return rootName;
    }

    private async createLehrerInternal(
        person: PersonData,
        domain: string,
        schulId: string,
        mail?: string, //Wird hier erstmal seperat mit reingegeben bis die Umstellung auf primary/alternative erfolgt
    ): Promise<Result<PersonData>> {
        const username: PersonUsername | undefined = person.username;
        if (!username) {
            return {
                ok: false,
                error: new UsernameRequiredError(
                    `Lehrer ${person.vorname} ${person.familienname} does not have a username`,
                ),
            };
        }
        const rootName: Result<string> = this.getRootNameOrError(domain);
        if (!rootName.ok) {
            return rootName;
        }

        const lehrerUid: string = this.getLehrerUid(username, rootName.value);
        return this.mutex.runExclusive(async () => {
            this.logger.info('LDAP: createLehrer');
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }

            const groupResult: Result<boolean, Error> = await this.addPersonToGroup(username, schulId, lehrerUid);
            if (!groupResult.ok) {
                this.logger.error(`LDAP: Failed to add lehrer ${username} to group lehrer-${schulId}`);
                return groupResult;
            }

            const searchResultLehrer: SearchResult = await client.search(
                `ou=${rootName.value},${this.ldapInstanceConfig.BASE_DN}`,
                {
                    filter: `(uid=${person.username})`,
                },
            );
            if (searchResultLehrer.searchEntries.length > 0) {
                this.logger.info(`LDAP: Lehrer ${lehrerUid} exists, nothing to create`);

                return { ok: true, value: person };
            }
            const entry: LdapPersonEntry = {
                uid: username,
                uidNumber: LdapAdapter.UID_NUMBER,
                gidNumber: LdapAdapter.GID_NUMBER,
                homeDirectory: LdapAdapter.HOME_DIRECTORY,
                cn: username,
                givenName: person.vorname,
                sn: person.familienname,
                objectclass: ['inetOrgPerson', 'univentionMail', 'posixAccount'],
                mailPrimaryAddress: mail ?? ``,
                mailAlternativeAddress: mail ?? ``,
            };

            try {
                await client.add(lehrerUid, entry);

                const entryUUIDResult: Result<string> = await this.getEntryUUID(client, person.id, username);
                if (!entryUUIDResult.ok) {
                    return entryUUIDResult;
                }
                person.ldapEntryUUID = entryUUIDResult.value;

                this.logger.info(`LDAP: Successfully created lehrer ${lehrerUid}`);

                return { ok: true, value: person };
            } catch (err) {
                this.logger.logUnknownAsError(`LDAP: Creating lehrer FAILED, uid:${lehrerUid}`, err);

                return { ok: false, error: new LdapCreateLehrerError() };
            }
        });
    }

    private async isLehrerExistingInternal(username: PersonUsername, domain: string): Promise<Result<boolean>> {
        const rootName: Result<string> = this.getRootNameOrError(domain);
        if (!rootName.ok) {
            return rootName;
        }

        return this.mutex.runExclusive(async () => {
            this.logger.info('LDAP: isLehrerExisting');
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }

            const searchResultLehrer: SearchResult = await client.search(
                `ou=${rootName.value},${this.ldapInstanceConfig.BASE_DN}`,
                {
                    filter: `(uid=${username})`,
                },
            );
            if (searchResultLehrer.searchEntries.length > 0) {
                return { ok: true, value: true };
            }
            return { ok: true, value: false };
        });
    }

    private async modifyPersonAttributesInternal(
        oldUsername: PersonUsername,
        newGivenName?: string,
        newSn?: string,
        newUsername?: PersonUsername,
    ): Promise<Result<PersonUsername>> {
        return this.mutex.runExclusive(async () => {
            this.logger.info('LDAP: modifyPersonAttributes');
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }

            const searchResult: SearchResult = await client.search(`${this.ldapInstanceConfig.BASE_DN}`, {
                scope: 'sub',
                filter: `(uid=${oldUsername})`,
                attributes: [LdapAdapter.GIVEN_NAME, LdapAdapter.SUR_NAME, LdapAdapter.UID, LdapAdapter.DN],
                returnAttributeValues: true,
            });
            if (!searchResult.searchEntries[0]) {
                this.logger.error(`Modifying person-attributes FAILED, no entry for person:${oldUsername}`);
                return {
                    ok: false,
                    error: new LdapSearchError(LdapEntityType.LEHRER),
                };
            }

            const entryDn: string = searchResult.searchEntries[0].dn;
            const modifications: Change[] = [];

            if (newUsername) {
                modifications.push(
                    new Change({
                        operation: 'replace',
                        modification: new Attribute({
                            type: LdapAdapter.COMMON_NAME,
                            values: [newUsername],
                        }),
                    }),
                );
            }
            if (newGivenName) {
                modifications.push(
                    new Change({
                        operation: 'replace',
                        modification: new Attribute({
                            type: LdapAdapter.GIVEN_NAME,
                            values: [newGivenName],
                        }),
                    }),
                );
            }
            if (newSn) {
                modifications.push(
                    new Change({
                        operation: 'replace',
                        modification: new Attribute({
                            type: LdapAdapter.SUR_NAME,
                            values: [newSn],
                        }),
                    }),
                );
            }
            if (modifications.length > 0) {
                await client.modify(entryDn, modifications);
                this.logger.info(`LDAP: Successfully modified givenName/sn attributes for person:${oldUsername}`);
            } else {
                this.logger.info(`No givenName/sn attributes provided to modify for person:${oldUsername}`);
            }

            if (newUsername && searchResult.searchEntries[0][LdapAdapter.UID] !== newUsername) {
                const newDn: string = `uid=${newUsername}`;
                await client.modifyDN(entryDn, newDn);
                this.logger.info(`LDAP: Successfully updated uid for person:${oldUsername} to ${newUsername}`);
            }

            if (newUsername) {
                const groupUpdateResult: Result<string> = await this.updateMemberDnInGroups(
                    oldUsername,
                    newUsername,
                    entryDn,
                    client,
                );
                if (!groupUpdateResult.ok) {
                    this.logger.error(`LDAP: Failed to update groups for person: ${oldUsername}`);
                    return groupUpdateResult;
                }
            }

            return { ok: true, value: oldUsername };
        });
    }

    /**
     * Fetches the following attributes for a person: givenName, sn, cn, mailPrimaryAddress, mailAlternativeAddress.
     * If no entry can be found for the username, a new empty entry will be implicitly created via createEmptyPersonEntry
     * and the entryUUID attribute of the result will be set accordingly.
     * If creation of entry was not necessary because it already existed, entryUUID will NOT be set in the result.
     * Failures during fetch of single attributes result in logging warnings but not as an error as result.
     * An error as method result is intended when both, fetching entry for username and necessary creation of missing entry fail.
     */
    private async getPersonAttributesInternal(
        personId: PersonID,
        username: PersonUsername,
        emailDomain: string,
    ): Promise<Result<LdapPersonAttributes>> {
        return this.mutex.runExclusive(async () => {
            this.logger.info('LDAP: getPersonAttributes');
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }

            const searchResult: SearchResult = await client.search(`${this.ldapInstanceConfig.BASE_DN}`, {
                scope: 'sub',
                filter: `(uid=${username})`,
                attributes: [
                    LdapAdapter.DN,
                    LdapAdapter.UID,
                    LdapAdapter.GIVEN_NAME,
                    LdapAdapter.SUR_NAME,
                    LdapAdapter.COMMON_NAME,
                    LdapAdapter.MAIL_PRIMARY_ADDRESS,
                    LdapAdapter.MAIL_ALTERNATIVE_ADDRESS,
                ],
                returnAttributeValues: true,
            });
            if (!searchResult.searchEntries[0]) {
                this.logger.warning(
                    `Fetching person-attributes FAILED, no entry for username:${username}, personId:${personId}`,
                );
                const creationResult: Result<string> = await this.createEmptyPersonEntry(username, emailDomain);
                if (!creationResult.ok) {
                    return creationResult;
                }

                const entryUUIDResult: Result<string> = await this.getEntryUUID(client, personId, username);
                if (!entryUUIDResult.ok) {
                    this.logger.error(
                        `Could not fetch entryUUID after creation of empty PersonEntry, personId:${personId}, username:${username}`,
                    );
                }

                return {
                    ok: true,
                    value: {
                        entryUUID: entryUUIDResult.ok ? entryUUIDResult.value : undefined,
                        dn: creationResult.value,
                    },
                };
            }

            const givenName: Result<string> = this.getAttributeAsStringOrError(
                searchResult.searchEntries[0],
                LdapAdapter.GIVEN_NAME,
                username,
                personId,
            );
            if (!givenName.ok) {
                this.logger.warning(`GivenName was undefined, username:${username}, personId:${personId}`);
            }
            const surName: Result<string> = this.getAttributeAsStringOrError(
                searchResult.searchEntries[0],
                LdapAdapter.SUR_NAME,
                username,
                personId,
            );
            if (!surName.ok) {
                this.logger.warning(`Surname was undefined, username:${username}, personId:${personId}`);
            }
            const cn: Result<string> = this.getAttributeAsStringOrError(
                searchResult.searchEntries[0],
                LdapAdapter.COMMON_NAME,
                username,
                personId,
            );
            if (!cn.ok) {
                this.logger.warning(`CN was undefined, username:${username}, personId:${personId}`);
            }
            const mailPrimaryAddress: Result<string> = this.getAttributeAsStringOrError(
                searchResult.searchEntries[0],
                LdapAdapter.MAIL_PRIMARY_ADDRESS,
                username,
                personId,
            );
            if (!mailPrimaryAddress.ok) {
                this.logger.warning(`MailPrimaryAddress was undefined, username:${username}, personId:${personId}`);
            }
            const mailAlternativeAddress: Result<string> = this.getAttributeAsStringOrError(
                searchResult.searchEntries[0],
                LdapAdapter.MAIL_ALTERNATIVE_ADDRESS,
                username,
                personId,
            );

            const personAttributes: LdapPersonAttributes = {
                dn: searchResult.searchEntries[0].dn,
                givenName: givenName.ok ? givenName.value : undefined,
                cn: cn.ok ? cn.value : undefined,
                surName: surName.ok ? surName.value : undefined,
                mailPrimaryAddress: mailPrimaryAddress.ok ? mailPrimaryAddress.value : undefined,
                mailAlternativeAddress: mailAlternativeAddress.ok ? mailAlternativeAddress.value : undefined,
            };

            return { ok: true, value: personAttributes };
        });
    }

    private getAttributeAsStringOrError(
        entry: Entry,
        attributeName: string,
        username: PersonUsername,
        personId: PersonID | undefined,
    ): Result<string> {
        const attributeValue: unknown = entry[attributeName];
        if (typeof attributeValue === 'string') {
            return {
                ok: true,
                value: attributeValue,
            };
        }
        this.logger.error(`Could not fetch attribute:${attributeName}, personId:${personId}, username:${username}`);

        return {
            ok: false,
            error: new LdapFetchAttributeError(attributeName, username, personId),
        };
    }

    /**
     * Creates a new PersonEntry and sets uid and cn to username value. Other person related attributes are set to 'empty'.
     * Returns the DN of the created PersonEntry or an Error.
     * For fetching the EntryUUID of an Entry use getEntryUUID.
     */
    private async createEmptyPersonEntry(username: PersonUsername, domain: string): Promise<Result<string>> {
        this.logger.info('LDAP: createEmptyPersonEntry');
        const client: Client = this.ldapClient.getClient();
        const bindResult: Result<boolean> = await this.bind();
        if (!bindResult.ok) {
            return bindResult;
        }

        const rootName: Result<string> = this.getRootNameOrError(domain);
        if (!rootName.ok) {
            return rootName;
        }

        const lehrerUid: string = this.getLehrerUid(username, rootName.value);

        const entry: LdapPersonEntry = {
            uid: username,
            uidNumber: LdapAdapter.UID_NUMBER,
            gidNumber: LdapAdapter.GID_NUMBER,
            homeDirectory: LdapAdapter.HOME_DIRECTORY,
            cn: username,
            givenName: LdapAdapter.ATTRIBUTE_VALUE_EMPTY,
            sn: LdapAdapter.ATTRIBUTE_VALUE_EMPTY,
            objectclass: ['inetOrgPerson', 'univentionMail', 'posixAccount'],
            mailPrimaryAddress: LdapAdapter.ATTRIBUTE_VALUE_EMPTY,
            mailAlternativeAddress: LdapAdapter.ATTRIBUTE_VALUE_EMPTY,
        };

        try {
            await client.add(lehrerUid, entry);
            this.logger.info(`LDAP: Successfully created empty PersonEntry, DN:${lehrerUid}`);

            return { ok: true, value: lehrerUid };
        } catch (err) {
            this.logger.logUnknownAsError(`LDAP: Creating empty PersonEntry FAILED, DN:${lehrerUid}`, err);

            return { ok: false, error: new LdapCreateLehrerError() };
        }
    }

    private async getEntryUUID(client: Client, personId: PersonID, username: PersonUsername): Promise<Result<string>> {
        const searchResult: SearchResult = await client.search(`${this.ldapInstanceConfig.BASE_DN}`, {
            scope: 'sub',
            filter: `(uid=${username})`,
            attributes: [LdapAdapter.ENTRY_UUID],
            returnAttributeValues: true,
        });

        const entryUUID: unknown = searchResult.searchEntries[0]?.[LdapAdapter.ENTRY_UUID];

        if (typeof entryUUID !== 'string') {
            this.logger.error(`Could not get EntryUUID for username:${username}, personId:${personId}`);
            return {
                ok: false,
                error: new LdapCreateLehrerError(),
            };
        }

        return {
            ok: true,
            value: entryUUID,
        };
    }

    private async setMailAlternativeAddressInternal(
        personId: PersonID,
        username: PersonUsername,
        newMailAlternativeAddress: string,
    ): Promise<Result<PersonID>> {
        return this.mutex.runExclusive(async () => {
            this.logger.info('LDAP: setMailAlternativeAddress');
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }

            const searchResult: SearchResult = await client.search(`${this.ldapInstanceConfig.BASE_DN}`, {
                scope: 'sub',
                filter: `(uid=${username})`,
                attributes: [LdapAdapter.DN, LdapAdapter.MAIL_ALTERNATIVE_ADDRESS],
                returnAttributeValues: true,
            });
            if (!searchResult.searchEntries[0]) {
                this.logger.error(`Fetching person FAILED, no entry for username:${username}, personId:${personId}`);
                return { ok: false, error: new LdapModifyEmailError() };
            }

            try {
                await client.modify(searchResult.searchEntries[0].dn, [
                    new Change({
                        operation: 'replace',
                        modification: new Attribute({
                            type: LdapAdapter.MAIL_ALTERNATIVE_ADDRESS,
                            values: [newMailAlternativeAddress],
                        }),
                    }),
                ]);
                this.logger.info(
                    `LDAP: Successfully modified mailPrimaryAddress and mailAlternativeAddress for personId:${personId}, username:${username}`,
                );

                return { ok: true, value: personId };
            } catch (err) {
                this.logger.logUnknownAsError(
                    `LDAP: Modifying mailPrimaryAddress and mailAlternativeAddress FAILED`,
                    err,
                );

                return { ok: false, error: new LdapModifyEmailError() };
            }
        });
    }

    private async getGroupsForPersonInternal(personId: PersonID, username: PersonUsername): Promise<Result<string[]>> {
        return this.mutex.runExclusive(async () => {
            this.logger.info('LDAP: getGroupsForPerson');
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }

            const personSearchResult: SearchResult = await client.search(`${this.ldapInstanceConfig.BASE_DN}`, {
                scope: 'sub',
                filter: `(uid=${username})`,
            });
            if (!personSearchResult.searchEntries[0]) {
                this.logger.error(`LDAP: No entry for uid:${username}, username:${username}, personId:${personId}`);
                return {
                    ok: false,
                    error: new LdapSearchError(LdapEntityType.LEHRER),
                };
            }

            const searchResult: SearchResult = await client.search(`${this.ldapInstanceConfig.BASE_DN}`, {
                scope: 'sub',
                filter: `(member=${personSearchResult.searchEntries[0].dn})`,
                attributes: [LdapAdapter.DN, LdapAdapter.MEMBER],
                returnAttributeValues: true,
            });

            const groupEntries: Entry[] | undefined = searchResult.searchEntries;

            if (!groupEntries) {
                const errMsg: string = `LDAP: Fetching groups failed, personId:${personId}, username:${username}`;
                this.logger.error(errMsg);
                return { ok: false, error: new Error(errMsg) };
            }

            if (groupEntries.length === 0) {
                this.logger.info(`LDAP: No groups found for person, personId:${personId}, username:${username}`);
                return { ok: true, value: [] };
            }

            const groupNames: string[] = groupEntries.map((entry: Entry) => entry.dn);

            return {
                ok: true,
                value: groupNames,
            };
        });
    }

    private async updateMemberDnInGroupsInternal(
        oldUsername: PersonUsername,
        newUsername: PersonUsername,
        oldUid: string,
        client: Client,
    ): Promise<Result<string>> {
        const oldLehrerUid: string = oldUid;
        const newLehrerUid: string = this.createNewLehrerUidFromOldUid(oldUid, newUsername);

        const searchResult: SearchResult = await client.search(`${this.ldapInstanceConfig.BASE_DN}`, {
            scope: 'sub',
            filter: `(member=${oldLehrerUid})`,
            attributes: [LdapAdapter.DN, LdapAdapter.MEMBER],
            returnAttributeValues: true,
        });

        const groupEntries: Entry[] | undefined = searchResult.searchEntries;

        if (!groupEntries) {
            const errMsg: string = `LDAP: Error while searching for groups for person: ${oldUsername}`;
            this.logger.error(errMsg);
            return { ok: false, error: new Error(errMsg) };
        }

        if (groupEntries.length === 0) {
            this.logger.info(`LDAP: No groups found for person:${oldUsername}`);
            return { ok: true, value: `No groups found for person:${oldUsername}` };
        }

        await Promise.allSettled(
            groupEntries.map(async (entry: Entry) => {
                const groupDn: string = entry.dn;
                const members: string | string[] | Buffer | Buffer[] | undefined = entry[LdapAdapter.MEMBER];
                let existingMembers: string[] = [];

                if (Array.isArray(members)) {
                    existingMembers = members.map((member: string | Buffer) => {
                        if (Buffer.isBuffer(member)) {
                            return member.toString('utf-8');
                        } else {
                            return member;
                        }
                    });
                } else if (typeof members === 'string') {
                    existingMembers = [members];
                } else if (Buffer.isBuffer(members)) {
                    existingMembers = [members.toString('utf-8')];
                } else {
                    existingMembers = [];
                }

                const updatedMembers: (string | Buffer)[] = existingMembers.map((member: string | Buffer) =>
                    member === oldLehrerUid ? newLehrerUid : member,
                );

                await client
                    .modify(groupDn, [
                        new Change({
                            operation: 'replace',
                            modification: new Attribute({
                                type: LdapAdapter.MEMBER,
                                values: updatedMembers.map((member: string | Buffer) => member.toString()),
                            }),
                        }),
                    ])
                    .catch((err: Error) => {
                        const errMsg: string = `LDAP: Error while updating member data for group: ${groupDn}, errMsg: ${String(err)}`;
                        this.logger.error(errMsg);
                        return { ok: false, error: new Error(errMsg) };
                    });
                this.logger.info(`LDAP: Updated member data for group: ${groupDn}`);
            }),
        );
        return { ok: true, value: `Updated member data for ${groupEntries.length} groups.` };
    }

    private async deleteLehrerByUsernameInternal(
        username: PersonUsername,
        failIfUserNotFound: boolean,
    ): Promise<Result<string | null>> {
        return this.mutex.runExclusive(async () => {
            this.logger.info('LDAP: deleteLehrerByUsernameInternal');
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }

            const searchResultLehrer: SearchResult = await client.search(`${this.ldapInstanceConfig.BASE_DN}`, {
                scope: 'sub',
                filter: `(uid=${username})`,
            });
            if (!searchResultLehrer.searchEntries[0]) {
                if (failIfUserNotFound) {
                    return {
                        ok: false,
                        error: new Error(`User not found: ${username}`),
                    };
                }
                this.logger.info(`LDAP: user to delete not found: ${username}`);
                return {
                    ok: true,
                    value: null,
                };
            }
            await client.del(searchResultLehrer.searchEntries[0].dn);
            this.logger.info(`LDAP: Successfully deleted lehrer by username:${username}`);

            return { ok: true, value: username };
        });
    }

    private async deleteLehrerInternal(
        person: PersonData,
        orgaKennung: OrganisationKennung,
        domain: string,
    ): Promise<Result<PersonData>> {
        const rootName: Result<string> = this.getRootNameOrError(domain);
        if (!rootName.ok) {
            return rootName;
        }

        return this.mutex.runExclusive(async () => {
            this.logger.info('LDAP: deleteLehrer by person');
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }
            if (!person.username) {
                return {
                    ok: false,
                    error: new UsernameRequiredError(
                        `Lehrer ${person.vorname} ${person.familienname} does not have a username`,
                    ),
                };
            }
            const lehrerUid: string = this.getLehrerUid(person.username, rootName.value);
            await this.removePersonFromGroup(person.username, orgaKennung, lehrerUid);
            try {
                const searchResultLehrer: SearchResult = await client.search(
                    `ou=${rootName.value},${this.ldapInstanceConfig.BASE_DN}`,
                    {
                        filter: `(uid=${person.username})`,
                    },
                );
                if (!searchResultLehrer.searchEntries[0]) {
                    this.logger.info(`LDAP: Lehrer ${lehrerUid} does not exist, nothing to delete`);

                    return { ok: true, value: person };
                }
                await client.del(lehrerUid);
                this.logger.info(`LDAP: Successfully deleted lehrer ${lehrerUid}`);

                return { ok: true, value: person };
            } catch (err) {
                this.logger.logUnknownAsError(`LDAP: Deleting lehrer FAILED, uid:${lehrerUid}`, err);

                return { ok: false, error: new LdapCreateLehrerError() };
            }
        });
    }

    private async changeEmailAddressByPersonIdInternal(
        personId: PersonID,
        username: PersonUsername,
        newEmailAddress: string,
        alternativEmailAddress?: string,
    ): Promise<Result<PersonID>> {
        // Converted to avoid PersonRepository-ref, UEM-password-generation
        return this.mutex.runExclusive(async () => {
            this.logger.info('LDAP: changeEmailAddress');
            const splitted: string[] = newEmailAddress.split('@');
            if (!splitted || !splitted[1]) {
                this.logger.error(`LDAP: Invalid email-address:${newEmailAddress}`);

                return {
                    ok: false,
                    error: new LdapEmailAddressError(),
                };
            }
            const domain: string = splitted[1];
            const rootName: Result<string> = this.getRootNameOrError(domain);
            if (!rootName.ok) {
                return rootName;
            }
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }
            const searchResult: SearchResult = await client.search(
                `ou=${rootName.value},${this.ldapInstanceConfig.BASE_DN}`,
                {
                    scope: 'sub',
                    filter: `(uid=${username})`,
                    attributes: [LdapAdapter.MAIL_PRIMARY_ADDRESS, LdapAdapter.MAIL_ALTERNATIVE_ADDRESS],
                    returnAttributeValues: true,
                },
            );
            if (!searchResult.searchEntries[0]) {
                this.logger.error(
                    `Changing email-address in LDAP FAILED, no entry for personId:${personId}, username:${username}`,
                );
                return {
                    ok: false,
                    error: new LdapSearchError(LdapEntityType.LEHRER),
                };
            }

            try {
                await client.modify(searchResult.searchEntries[0].dn, [
                    new Change({
                        operation: 'replace',
                        modification: new Attribute({
                            type: LdapAdapter.MAIL_PRIMARY_ADDRESS,
                            values: [newEmailAddress],
                        }),
                    }),
                ]);
                await client.modify(searchResult.searchEntries[0].dn, [
                    new Change({
                        operation: 'replace',
                        modification: new Attribute({
                            type: LdapAdapter.MAIL_ALTERNATIVE_ADDRESS,
                            values: [alternativEmailAddress ?? ''],
                        }),
                    }),
                ]);
                this.logger.info(
                    `LDAP: Successfully modified mailPrimaryAddress and mailAlternativeAddress for personId:${personId}, username:${username}`,
                );
                this.eventService.publish(
                    new LdapPersonEntryChangedEvent(personId, username, newEmailAddress, alternativEmailAddress),
                    new KafkaLdapPersonEntryChangedEvent(personId, username, newEmailAddress, alternativEmailAddress),
                );

                return { ok: true, value: personId };
            } catch (err) {
                this.logger.logUnknownAsError(
                    `LDAP: Modifying mailPrimaryAddress and mailAlternativeAddress FAILED`,
                    err,
                );

                return { ok: false, error: new LdapModifyEmailError() };
            }
        });
    }

    private async removeMailAlternativeAddressInternal(
        personId: PersonID | undefined,
        username: PersonUsername,
        address: string,
    ): Promise<Result<boolean>> {
        return this.mutex.runExclusive(async () => {
            this.logger.info('LDAP: removeMailAlternativeAddress');
            const splitted: string[] = address.split('@');
            if (!splitted || !splitted[1]) {
                this.logger.error(`LDAP: Invalid email-address:${address}`);

                return {
                    ok: false,
                    error: new LdapEmailAddressError(),
                };
            }
            const domain: string = splitted[1];
            const rootName: Result<string> = this.getRootNameOrError(domain);
            if (!rootName.ok) {
                return rootName;
            }
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }

            const searchResult: SearchResult = await client.search(`${this.ldapInstanceConfig.BASE_DN}`, {
                scope: 'sub',
                filter: `(uid=${username})`,
                attributes: [
                    LdapAdapter.DN,
                    LdapAdapter.UID,
                    LdapAdapter.MAIL_PRIMARY_ADDRESS,
                    LdapAdapter.MAIL_ALTERNATIVE_ADDRESS,
                ],
                returnAttributeValues: true,
            });
            if (!searchResult.searchEntries[0]) {
                this.logger.error(
                    `Fetching person-attributes FAILED, no entry for username:${username}, personId:${personId}`,
                );
                return {
                    ok: false,
                    error: new LdapSearchError(LdapEntityType.LEHRER),
                };
            }

            const mailAlternativeAddress: Result<string> = this.getAttributeAsStringOrError(
                searchResult.searchEntries[0],
                LdapAdapter.MAIL_ALTERNATIVE_ADDRESS,
                username,
                personId,
            );
            if (!mailAlternativeAddress.ok) {
                this.logger.error(`MailAlternativeAddress was undefined, username:${username}, personId:${personId}`);
                return { ok: false, error: new LdapModifyEmailError() };
            }
            if (mailAlternativeAddress.value !== address) {
                this.logger.info(
                    `MailAlternativeAddress:${mailAlternativeAddress.value} deletion not necessary, address:${address}, username:${username}, personId:${personId}`,
                );
                return { ok: true, value: false };
            }
            try {
                await client.modify(searchResult.searchEntries[0].dn, [
                    new Change({
                        operation: 'replace',
                        modification: new Attribute({
                            type: LdapAdapter.MAIL_ALTERNATIVE_ADDRESS,
                            values: [''],
                        }),
                    }),
                ]);
                this.logger.info(
                    `LDAP: Successfully deleted mailPrimaryAddress:${address} for personId:${personId}, username:${username}`,
                );
                this.eventService.publish(
                    new LdapPersonEntryChangedEvent(personId, username),
                    new KafkaLdapPersonEntryChangedEvent(personId, username),
                );

                return { ok: true, value: true };
            } catch (err) {
                this.logger.logUnknownAsError(`LDAP: Deletion of mailAlternativeAddress FAILED`, err);
                return { ok: false, error: new LdapModifyEmailError() };
            }
        });
    }

    private async addPersonToGroupInternal(
        personUid: string,
        orgaKennung: OrganisationKennung,
        lehrerUid: string,
    ): Promise<Result<boolean>> {
        return this.addPersonToGroupMutex.runExclusive(async () => {
            const groupId: string = 'lehrer-' + orgaKennung;
            this.logger.info(`LDAP: Adding person ${personUid} to group ${groupId}`);
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }

            const orgUnitDn: string = `ou=${orgaKennung},${this.ldapInstanceConfig.BASE_DN}`;
            const searchResultOrgUnit: SearchResult = await client.search(`${this.ldapInstanceConfig.BASE_DN}`, {
                filter: `(ou=${orgaKennung})`,
            });

            if (!searchResultOrgUnit.searchEntries[0]) {
                this.logger.info(`LDAP: organizationalUnit ${orgaKennung} not found, creating organizationalUnit`);

                const newOrgUnit: { ou: string; objectClass: string } = {
                    ou: orgaKennung,
                    objectClass: 'organizationalUnit',
                };
                await client.add(orgUnitDn, newOrgUnit);
            }

            const orgRoleDn: string = `cn=${LdapAdapter.GROUPS},${orgUnitDn}`;
            const searchResultOrgRole: SearchResult = await client.search(orgUnitDn, {
                filter: `(cn=${LdapAdapter.GROUPS})`,
            });
            if (!searchResultOrgRole.searchEntries[0]) {
                const newOrgRole: { cn: string; objectClass: string } = {
                    cn: LdapAdapter.GROUPS,
                    objectClass: 'organizationalRole',
                };
                await client.add(orgRoleDn, newOrgRole);
            }

            const lehrerDn: string = `cn=${groupId},${orgRoleDn}`;
            const searchResultGroupOfNames: SearchResult = await client.search(orgRoleDn, {
                filter: `(cn=${groupId})`,
            });
            if (!searchResultGroupOfNames.searchEntries[0]) {
                const newLehrerGroup: { cn: string; objectclass: string[]; member: string[] } = {
                    cn: groupId,
                    objectclass: ['groupOfNames'],
                    member: [lehrerUid],
                };
                try {
                    await client.add(lehrerDn, newLehrerGroup);
                    this.logger.info(`LDAP: Successfully created group ${groupId} and added person ${personUid}`);
                    return { ok: true, value: true };
                } catch (err) {
                    const errMsg: string = `LDAP: Failed to create group ${groupId}, errMsg: ${String(err)}`;
                    this.logger.error(errMsg);
                    return { ok: false, error: new LdapAddPersonToGroupError() };
                }
            }
            if (this.isPersonInSearchResult(searchResultGroupOfNames.searchEntries[0], lehrerUid)) {
                this.logger.info(`LDAP: Person ${personUid} is already in group ${groupId}`);
                return { ok: true, value: false };
            }

            try {
                await client.modify(searchResultGroupOfNames.searchEntries[0].dn, [
                    new Change({
                        operation: 'add',
                        modification: new Attribute({
                            type: LdapAdapter.MEMBER,
                            values: [lehrerUid],
                        }),
                    }),
                ]);
                this.logger.info(`LDAP: Successfully added person ${personUid} to group ${groupId}`);
                return { ok: true, value: true };
            } catch (err) {
                const errMsg: string = `LDAP: Failed to add person to group ${groupId}, errMsg: ${String(err)}`;
                this.logger.error(errMsg);
                return { ok: false, error: new LdapAddPersonToGroupError() };
            }
        });
    }

    private async removePersonFromGroupInternal(
        username: PersonUsername,
        orgaKennung: OrganisationKennung,
        lehrerUid: string,
    ): Promise<Result<boolean>> {
        return this.deletePersonFromGroupMutex.runExclusive(async () => {
            const groupId: string = 'lehrer-' + orgaKennung;
            this.logger.info(`LDAP: Removing person ${username} from group ${groupId}`);
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }
            const searchResultOrgUnit: SearchResult = await client.search(
                `cn=${LdapAdapter.GROUPS},ou=${orgaKennung},${this.ldapInstanceConfig.BASE_DN}`,
                {
                    filter: `(cn=${groupId})`,
                },
            );

            if (!searchResultOrgUnit.searchEntries[0]) {
                const errMsg: string = `LDAP: Group ${groupId} not found`;
                this.logger.error(errMsg);
                return { ok: false, error: new Error(errMsg) };
            }

            if (!this.isPersonInSearchResult(searchResultOrgUnit.searchEntries[0], lehrerUid)) {
                this.logger.info(`LDAP: Person ${username} is not in group ${groupId}`);
                return { ok: true, value: false };
            }
            const groupDn: string = searchResultOrgUnit.searchEntries[0].dn;
            try {
                if (typeof searchResultOrgUnit.searchEntries[0][LdapAdapter.MEMBER] === 'string') {
                    await client.del(groupDn);
                    this.logger.info(`LDAP: Successfully removed person ${username} from group ${groupId}`);
                    this.logger.info(`LDAP: Successfully deleted group ${groupId}`);
                    return { ok: true, value: true };
                }
                await client.modify(groupDn, [
                    new Change({
                        operation: 'delete',
                        modification: new Attribute({
                            type: LdapAdapter.MEMBER,
                            values: [lehrerUid],
                        }),
                    }),
                ]);
                this.logger.info(`LDAP: Successfully removed person ${username} from group ${groupId}`);
                return { ok: true, value: true };
            } catch (err) {
                const errMsg: string = `LDAP: Failed to remove person from group ${groupId}, errMsg: ${String(err)}`;
                this.logger.error(errMsg);
                return { ok: false, error: new LdapRemovePersonFromGroupError() };
            }
        });
    }

    private isPersonInSearchResult(searchEntry: Entry, lehrerUid: string): boolean | undefined {
        const member: string | string[] | Buffer | Buffer[] | undefined = searchEntry[LdapAdapter.MEMBER];

        if (typeof member === 'string') {
            return member === lehrerUid;
        }

        if (Buffer.isBuffer(member)) {
            return member.toString() === lehrerUid;
        }

        if (Array.isArray(member)) {
            return member.some((entry: string | Buffer) => {
                if (typeof entry === 'string') {
                    return entry === lehrerUid;
                }
                return entry.toString() === lehrerUid;
            });
        }

        return false;
    }

    private async changeUserPasswordByPersonIdInternal(
        personId: PersonID,
        username: PersonUsername,
    ): Promise<Result<PersonID>> {
        // Converted to avoid PersonRepository-ref, UEM-password-generation
        const userPassword: string = generatePassword();

        return this.mutex.runExclusive(async () => {
            this.logger.info('LDAP: changeUserPassword');
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }

            const searchResult: SearchResult = await client.search(`${LdapAdapter.DC_SCHULE_SH_DC_DE}`, {
                scope: 'sub',
                filter: `(uid=${username})`,
                attributes: [LdapAdapter.USER_PASSWORD],
                returnAttributeValues: true,
            });
            if (!searchResult.searchEntries[0]) {
                this.logger.error(
                    `Modifying user-password FAILED, no entry for personId:${personId}, username:${username}`,
                );
                return {
                    ok: false,
                    error: new LdapSearchError(LdapEntityType.LEHRER),
                };
            }

            try {
                await client.modify(searchResult.searchEntries[0].dn, [
                    new Change({
                        operation: 'replace',
                        modification: new Attribute({
                            type: LdapAdapter.USER_PASSWORD,
                            values: [userPassword],
                        }),
                    }),
                ]);
                this.logger.info(
                    `LDAP: Successfully modified userPassword (UEM) for personId:${personId}, username:${username}`,
                );
                this.eventService.publish(
                    new LdapPersonEntryChangedEvent(personId, username, undefined, undefined, true),
                    new KafkaLdapPersonEntryChangedEvent(personId, username, undefined, undefined, true),
                );

                return { ok: true, value: userPassword };
            } catch (err) {
                this.logger.logUnknownAsError(
                    `LDAP: Modifying userPassword (UEM) FAILED for personId:${personId}, username:${username}`,
                    err,
                );

                return { ok: false, error: new LdapModifyUserPasswordError() };
            }
        });
    }

    private async deleteOrganisationInternal(kennung: string): Promise<Result<string>> {
        return this.mutex.runExclusive(async () => {
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }

            const orgUnitDn: string = `ou=${kennung},${this.ldapInstanceConfig.BASE_DN}`;
            const groupDn: string = `cn=${LdapAdapter.GROUPS},${orgUnitDn}`;

            try {
                await client.del(groupDn);
            } catch (err) {
                if (!(err instanceof NoSuchObjectError)) {
                    this.logger.logUnknownAsError(`LDAP: Deleting group FAILED for kennung:${kennung}`, err);
                    return Err(new LdapDeleteOrganisationError({ kennung }));
                }
            }

            try {
                await client.del(orgUnitDn);
            } catch (err) {
                if (!(err instanceof NoSuchObjectError)) {
                    this.logger.logUnknownAsError(`LDAP: Deleting orgUnit FAILED for kennung:${kennung}`, err);
                    return Err(new LdapDeleteOrganisationError({ kennung }));
                }
            }

            this.logger.info(`LDAP: Successfully deleted organisation with kennung:${kennung}.`);

            return Ok<string, Error>(kennung);
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
            error: new Error('executeWithRetry default fallback'),
        };

        while (currentAttempt <= retries) {
            try {
                // eslint-disable-next-line no-await-in-loop
                result = await func();
                if (result.ok) {
                    return result;
                } else {
                    throw new Error(`Function returned error: ${result.error.message}`);
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

    private async sleep(ms: number): Promise<void> {
        // eslint-disable-next-line no-promise-executor-return
        return new Promise<void>((resolve: () => void) => setTimeout(resolve, ms));
    }
}
