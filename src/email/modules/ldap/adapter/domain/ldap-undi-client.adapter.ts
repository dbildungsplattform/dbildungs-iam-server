import { Injectable } from '@nestjs/common';
import { Mutex } from 'async-mutex';
import { Client, SearchResult } from 'ldapts';
import { ClassLogger } from '../../../../../core/logging/class-logger.js';
import { OrganisationID, PersonID, PersonUsername } from '../../../../../shared/types/aggregate-ids.types.js';
import { LdapUndiClient } from '../technical/ldap-undi-client.js';
import { LdapUndiEmailMicroserviceInstanceConfig } from '../technical/ldap-undi-email-microservice-instance-config.js';
import { LdapBindError } from './error/ldap-bind.error.js';
import { LdapEmailDomainError } from './error/ldap-email-domain.error.js';
import { LdapExecuteWithRetryFallbackError } from './error/ldap-execute-with-retry-fallback.error.js';
import { DomainError } from '../../../../../shared/error/domain.error.js';
import { Ok } from '../../../../../shared/util/result.js';

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

    /**
     * Updates the group in ldap, if it exists (kennung must not be updated!)
     * @param id
     * @param name
     * @returns
     */
    public async updateGroup(id: string, name: string): Promise<Result<void, LdapEmailDomainError>> {
        // TODO
        return Ok();
    }

    /**
     * Delete a group in ldap
     * @param id
     * @returns
     */
    public async deleteGroup(id: string): Promise<Result<void, LdapEmailDomainError>> {
        // TODO
        return Ok();
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

    private async upsertPersonInternal() {
        // TODO: SPSH-4220
        // Search for person
        // person doesn't exist?
        // - create person
        // person exists?
        // - update person attributes
        // call setPersonGroupsInternal
    }

    private async deletePersonInternal() {
        // TODO: SPSH-4220
        // Search for person
        // person doesn't exist?
        // - done, nothing to do
        // person exists?
        // - delete person
    }

    private async setPersonGroupsInternal() {
        // TODO: SPSH-4220
        // Search for groups of person
        // call addPersonToGroupInternal for missing groups
        // call removePersonFromGroupInternal for superfluous groups
    }

    private async addPersonToGroupInternal(personUID: string, groupData: GroupData) {
        // TODO: SPSH-4220
        // Search for group
        // create or update group?
        // - create with person
        // - update group then add person

        const groupName: string = `lehrer-${groupData.kennung}`;

        const client: Client = this.ldapClient.getClient();
        const bindResult: Result<boolean> = await this.bind();
        if (!bindResult.ok) {
            return bindResult;
        }

        const searchResultOrgUnit: SearchResult = await client.search(this.ldapInstanceConfig.BASE_DN, {
            filter: `(cn=${groupData.id}&objectClass=groupOfNames)`,
        });

        if (!searchResultOrgUnit.searchEntries[0]) {
            const groupDn: string = `cn=${groupData.id}`;
            // GroupOfNames doesnt exist
            const newOrgUnit: Record<string, string | string[]> = {
                objectclass: ['groupOfNames'],
                cn: groupData.id,
                description: groupName,
                o: groupData.name,
                ou: groupData.kennung,
                member: [personUID],
            };
            try {
                await client.add(groupDn, newOrgUnit);
            } catch (_e) {
                // TODO
            }
        }
    }

    private async removePersonFromGroupInternal(personUID: string, groupData: GroupData) {
        // TODO: SPSH-4220
        // Search for group
        // group doesn't exist?
        // - nothing to do
        // group exists and person is last remaining member?
        // - delete group (groupOfNames can't be empty)
        // else
        // - remove person from group
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
