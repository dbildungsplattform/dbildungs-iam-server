import { Injectable } from '@nestjs/common';
import { Mutex } from 'async-mutex';
import { Attribute, Change, Client, SearchResult } from 'ldapts';
import { ClassLogger } from '../../../../../core/logging/class-logger.js';
import { PersonExternalID, PersonUsername } from '../../../../../shared/types/aggregate-ids.types.js';
import { LdapClient } from '../technical/ldap-client.js';
import { LdapEmailMicroserviceInstanceConfig } from '../technical/ldap-email-microservice-instance-config.js';
import { LdapCreatePersonError } from './error/ldap-create-person.error.js';
import { LdapEmailDomainError } from './error/ldap-email-domain.error.js';
import { LdapModifyPersonError } from './error/ldap-modify-person.error.js';
import { LdapRenamePersonError } from './error/ldap-rename-person.error.js';
import { LdapPersonEntry } from './ldap.types.js';

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
    firstName: string;
    lastName: string;
    username: PersonUsername;
    uid: PersonExternalID;
};

@Injectable()
export class LdapClientAdapter {
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

    private mutex: Mutex;

    public constructor(
        private readonly ldapClient: LdapClient,
        private readonly ldapInstanceConfig: LdapEmailMicroserviceInstanceConfig,
        private readonly logger: ClassLogger,
    ) {
        this.mutex = new Mutex();
    }

    //** BELOW ONLY PUBLIC FUNCTIONS - MUST USE THE 'executeWithRetry' WRAPPER TO HAVE STRONG FAULT TOLERANCE*/

    public async createPerson(
        person: PersonData,
        domain: string,
        primaryMail: string,
        alternativeEmail: string | undefined,
    ): Promise<Result<PersonData>> {
        return this.executeWithRetry(
            () => this.createPersonInternal(person, domain, primaryMail, alternativeEmail),
            this.getNrOfRetries(),
        );
    }

    public async updatePerson(
        person: PersonData,
        domain: string,
        primaryMail: string,
        alternativeEmail: string | undefined,
    ): Promise<Result<PersonData>> {
        return this.executeWithRetry(
            () => this.updatePersonInternal(person, domain, primaryMail, alternativeEmail),
            this.getNrOfRetries(),
        );
    }

    public async updatePersonEmails(
        personUid: string,
        domain: string,
        primaryMail: string,
        alternativeEmail: string | undefined,
    ): Promise<Result<string>> {
        return this.executeWithRetry(
            () => this.updatePersonEmailsInternal(personUid, domain, primaryMail, alternativeEmail),
            this.getNrOfRetries(),
        );
    }

    public async isPersonExisting(uid: string, domain: string): Promise<Result<boolean>> {
        return this.executeWithRetry(() => this.isPersonExistingInternal(uid, domain), this.getNrOfRetries());
    }

    public async renamePerson(
        oldExternalId: PersonExternalID,
        newExternalId: PersonExternalID,
        domain: string,
    ): Promise<Result<void>> {
        return this.executeWithRetry(
            () => this.renamePersonInternal(oldExternalId, newExternalId, domain),
            this.getNrOfRetries(),
        );
    }
    //** BELOW ONLY PRIVATE HELPER FUNCTIONS THAT NOT OPERATE ON LDAP - MUST NOT USE THE 'executeWithRetry'/

    private getNrOfRetries(): number {
        return this.ldapInstanceConfig.RETRY_WRAPPER_DEFAULT_RETRIES != null
            ? this.ldapInstanceConfig.RETRY_WRAPPER_DEFAULT_RETRIES
            : LdapClientAdapter.FALLBACK_RETRIES;
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

            return { ok: false, error: new Error('LDAP bind FAILED') };
        }
    }

    private getRootName(emailDomain: string): Result<string, LdapEmailDomainError> {
        if (
            emailDomain === this.ldapInstanceConfig.ERSATZSCHULEN_DOMAIN ||
            emailDomain === LdapClientAdapter.ERSATZ_SCHULEN_DOMAIN_DEFAULT
        ) {
            return {
                ok: true,
                value: LdapClientAdapter.ERSATZ_SCHULEN_OU,
            };
        }
        if (
            emailDomain === this.ldapInstanceConfig.OEFFENTLICHE_SCHULEN_DOMAIN ||
            emailDomain === LdapClientAdapter.OEFFENTLICHE_SCHULEN_DOMAIN_DEFAULT
        ) {
            return {
                ok: true,
                value: LdapClientAdapter.OEFFENTLICHE_SCHULEN_OU,
            };
        }

        return {
            ok: false,
            error: new LdapEmailDomainError(),
        };
    }

    private getPersonUid(externalId: PersonExternalID, rootName: string): string {
        return `uid=${externalId},ou=${rootName},${this.ldapInstanceConfig.BASE_DN}`;
    }

    private getRootNameOrError(domain: string): Result<string> {
        const rootName: Result<string> = this.getRootName(domain);
        if (!rootName.ok) {
            this.logger.error(`Could not get root-name because email-domain is invalid, domain:${domain}`);
        }
        return rootName;
    }

    public async deletePerson(externalId: string, domain: string): Promise<Result<void>> {
        return this.executeWithRetry(() => this.deletePersonInternal(externalId, domain), this.getNrOfRetries());
    }

    public useLdap(): boolean {
        return this.ldapInstanceConfig.ENABLED;
    }

    private async deletePersonInternal(externalId: string, domain: string): Promise<Result<void>> {
        const rootName: Result<string> = this.getRootNameOrError(domain);
        if (!rootName.ok) {
            return rootName;
        }

        return this.mutex.runExclusive(async () => {
            this.logger.info(`LDAP: deletePerson by externalId ${externalId}`);
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }
            const personUid: string = this.getPersonUid(externalId, rootName.value);
            try {
                const ouBaseDn: string = `ou=${rootName.value},${this.ldapInstanceConfig.BASE_DN}`;
                this.logger.debug(`LDAP: Trying to find person, uid:${personUid}, ouBaseDn:${ouBaseDn} for deletion`);
                const searchResultLehrer: SearchResult = await client.search(ouBaseDn, {
                    filter: `(uid=${externalId})`,
                });
                if (!searchResultLehrer.searchEntries[0]) {
                    this.logger.info(`LDAP: Person ${personUid} does not exist, nothing to delete`);

                    return { ok: true, value: undefined };
                }
                await client.del(personUid);
                this.logger.info(`LDAP: Successfully deleted person ${personUid}`);

                return { ok: true, value: undefined };
            } catch (err) {
                this.logger.logUnknownAsError(`LDAP: Deleting person FAILED, uid:${personUid}`, err);

                return { ok: false, error: new Error() };
            }
        });
    }

    private async createPersonInternal(
        person: PersonData,
        domain: string,
        primaryMail: string,
        alternativeEmail: string | undefined,
    ): Promise<Result<PersonData>> {
        const rootName: Result<string> = this.getRootNameOrError(domain);
        if (!rootName.ok) {
            return rootName;
        }

        const personUid: string = this.getPersonUid(person.uid, rootName.value);
        return this.mutex.runExclusive(async () => {
            this.logger.info('LDAP: createPerson');
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }

            const searchResultPerson: SearchResult = await client.search(
                `ou=${rootName.value},${this.ldapInstanceConfig.BASE_DN}`,
                {
                    filter: `(uid=${person.uid})`,
                },
            );
            if (searchResultPerson.searchEntries.length > 0) {
                this.logger.info(`LDAP: Person ${personUid} exists, nothing to create`);

                return { ok: true, value: person };
            }
            const entry: LdapPersonEntry = {
                uid: person.uid,
                uidNumber: LdapClientAdapter.UID_NUMBER,
                gidNumber: LdapClientAdapter.GID_NUMBER,
                homeDirectory: LdapClientAdapter.HOME_DIRECTORY,
                cn: person.username,
                givenName: person.firstName,
                sn: person.lastName,
                objectclass: ['inetOrgPerson', 'univentionMail', 'posixAccount'],
                mailPrimaryAddress: primaryMail,
                mailAlternativeAddress: alternativeEmail ?? '',
            };

            try {
                await client.add(personUid, entry);
                this.logger.info(`LDAP: Creating person succeeded, uid:${personUid}`);
                return { ok: true, value: person };
            } catch (err) {
                this.logger.logUnknownAsError(`LDAP: Creating person FAILED, uid:${personUid}`, err);

                return { ok: false, error: new LdapCreatePersonError() };
            }
        });
    }

    private async updatePersonInternal(
        person: PersonData,
        domain: string,
        primaryMail: string,
        alternativeEmail: string | undefined,
    ): Promise<Result<PersonData>> {
        const rootName: Result<string> = this.getRootNameOrError(domain);
        if (!rootName.ok) {
            return rootName;
        }

        const personUid: string = this.getPersonUid(person.uid, rootName.value);
        return this.mutex.runExclusive(async () => {
            this.logger.info('LDAP: updatePerson');
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }

            const changes: Change[] = [
                new Change({
                    operation: 'replace',
                    modification: new Attribute({ type: LdapClientAdapter.COMMON_NAME, values: [person.username] }),
                }),
                new Change({
                    operation: 'replace',
                    modification: new Attribute({ type: LdapClientAdapter.GIVEN_NAME, values: [person.firstName] }),
                }),
                new Change({
                    operation: 'replace',
                    modification: new Attribute({ type: LdapClientAdapter.SUR_NAME, values: [person.lastName] }),
                }),
                new Change({
                    operation: 'replace',
                    modification: new Attribute({
                        type: LdapClientAdapter.MAIL_PRIMARY_ADDRESS,
                        values: [primaryMail],
                    }),
                }),

                new Change({
                    operation: 'replace',
                    modification: new Attribute({
                        type: LdapClientAdapter.MAIL_ALTERNATIVE_ADDRESS,
                        values: [alternativeEmail].filter(Boolean),
                    }),
                }),
            ];

            try {
                await client.modify(personUid, changes);
                this.logger.info(`LDAP: Modify person succeeded, uid:${personUid}, `);
                this.logger.infoWithDetails('LDAP: Modify person succeeded', {
                    uid: personUid,
                    username: person.username,
                    firstname: person.firstName,
                    lastname: person.lastName,
                });
                return { ok: true, value: person };
            } catch (err) {
                this.logger.logUnknownAsError(`LDAP: Modify person FAILED, uid:${personUid}`, err);

                return { ok: false, error: new LdapModifyPersonError() };
            }
        });
    }

    private async updatePersonEmailsInternal(
        personUid: string,
        domain: string,
        primaryMail: string,
        alternativeEmail: string | undefined,
    ): Promise<Result<string>> {
        const rootName: Result<string> = this.getRootNameOrError(domain);
        if (!rootName.ok) {
            return rootName;
        }

        return this.mutex.runExclusive(async () => {
            this.logger.info('LDAP: updatePerson');
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }

            const personDn: string = this.getPersonUid(personUid, rootName.value);

            const changes: Change[] = [
                new Change({
                    operation: 'replace',
                    modification: new Attribute({
                        type: LdapClientAdapter.MAIL_PRIMARY_ADDRESS,
                        values: [primaryMail],
                    }),
                }),

                new Change({
                    operation: 'replace',
                    modification: new Attribute({
                        type: LdapClientAdapter.MAIL_ALTERNATIVE_ADDRESS,
                        values: [alternativeEmail].filter(Boolean),
                    }),
                }),
            ];

            try {
                await client.modify(personDn, changes);
                this.logger.info(`LDAP: Modify person succeeded, uid:${personUid}, `);
                this.logger.infoWithDetails('LDAP: Modify person succeeded', {
                    uid: personUid,
                });
                return { ok: true, value: personUid };
            } catch (err) {
                this.logger.logUnknownAsError(`LDAP: Modify person FAILED, uid:${personUid}`, err);

                return { ok: false, error: new LdapModifyPersonError() };
            }
        });
    }

    private async isPersonExistingInternal(uid: string, domain: string): Promise<Result<boolean>> {
        const rootName: Result<string> = this.getRootNameOrError(domain);
        if (!rootName.ok) {
            return rootName;
        }

        return this.mutex.runExclusive(async () => {
            this.logger.info('LDAP: isPersonExisting');
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }

            const searchResultLehrer: SearchResult = await client.search(
                `ou=${rootName.value},${this.ldapInstanceConfig.BASE_DN}`,
                {
                    filter: `(uid=${uid})`,
                },
            );
            if (searchResultLehrer.searchEntries.length > 0) {
                return { ok: true, value: true };
            }
            return { ok: true, value: false };
        });
    }

    // uid is the entry's RDN, so renaming it requires a modifyDN, not an attribute replace
    private async renamePersonInternal(
        oldExternalId: PersonExternalID,
        newExternalId: PersonExternalID,
        domain: string,
    ): Promise<Result<void>> {
        const rootName: Result<string> = this.getRootNameOrError(domain);
        if (!rootName.ok) {
            return rootName;
        }

        const oldPersonUid: string = this.getPersonUid(oldExternalId, rootName.value);
        const newRdn: string = `${LdapClientAdapter.UID}=${newExternalId}`;

        return this.mutex.runExclusive(async () => {
            this.logger.info(`LDAP: renamePerson from uid:${oldPersonUid} to ${newRdn}`);
            const client: Client = this.ldapClient.getClient();
            const bindResult: Result<boolean> = await this.bind();
            if (!bindResult.ok) {
                return bindResult;
            }

            try {
                await client.modifyDN(oldPersonUid, newRdn);
                this.logger.info(`LDAP: Renaming person succeeded, from:${oldPersonUid}, to:${newRdn}`);

                return { ok: true, value: undefined };
            } catch (err) {
                this.logger.logUnknownAsError(`LDAP: Renaming person FAILED, from:${oldPersonUid}, to:${newRdn}`, err);

                return { ok: false, error: new LdapRenamePersonError() };
            }
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

    private sleep(ms: number): Promise<void> {
        return new Promise<void>((resolve: () => void) => {
            setTimeout(resolve, ms);
        });
    }
}
