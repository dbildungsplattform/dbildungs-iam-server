import { EntityManager } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { Injectable } from '@nestjs/common';
import { uniq } from 'lodash-es';
import { OrganisationsTyp } from '../../../modules/organisation/domain/organisation.enums.js';
import { Organisation } from '../../../modules/organisation/domain/organisation.js';
import { OrganisationRepository } from '../../../modules/organisation/persistence/organisation.repository.js';
import { Person } from '../../../modules/person/domain/person.js';
import { PersonRepository } from '../../../modules/person/persistence/person.repository.js';
import { Personenkontext } from '../../../modules/personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../../../modules/personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RolleRepo } from '../../../modules/rolle/repo/rolle.repo.js';
import { KafkaPersonExternalSystemsSyncEvent } from '../../../shared/events/kafka-person-external-systems-sync.event.js';
import { KafkaPersonLdapSyncEvent } from '../../../shared/events/kafka-person-ldap-sync.event.js';
import { KafkaLdapSyncCompletedEvent } from '../../../shared/events/ldap/kafka-ldap-sync-completed.event.js';
import { LdapSyncCompletedEvent } from '../../../shared/events/ldap/ldap-sync-completed.event.js';
import { PersonExternalSystemsSyncEvent } from '../../../shared/events/person-external-systems-sync.event.js';
import { PersonLdapSyncEvent } from '../../../shared/events/person-ldap-sync.event.js';
import { OrganisationID, PersonID } from '../../../shared/types/aggregate-ids.types.js';
import { EventHandler } from '../../eventbus/decorators/event-handler.decorator.js';
import { KafkaEventHandler } from '../../eventbus/decorators/kafka-event-handler.decorator.js';
import { EventRoutingLegacyKafkaService } from '../../eventbus/services/event-routing-legacy-kafka.service.js';
import { ClassLogger } from '../../logging/class-logger.js';
import { LdapGroupKennungExtractionError } from '../adapter/domain/error/ldap-group-kennung-extraction.error.js';
import { LdapAdapter, LdapPersonAttributes } from '../adapter/domain/ldap.adapter.js';
import { LdapInstanceConfig } from '../adapter/technical/ldap-instance-config.js';
import { AbstractLdapEventHandler } from './abstract-ldap-event-handler.js';
import { EmailResolverService } from '../../../modules/email-microservice/domain/email-resolver.service.js';
import { PersonEmailResponse } from '../../../modules/person/api/person-email-response.js';
import { EmailAddressStatus } from '../../../modules/email/domain/email-address.js';

export type LdapSyncData = {
    givenName: string;
    surName: string;
    cn: string;
    enabledEmailAddress: string | null;
    disabledEmailAddresses: string[];

    personId: PersonID;
    username: string;
    groupsToAdd: string[];
    groupsToRemove: string[];
};

/**
 * Handling of PersonExternalSystemsSyncEvent is done here, an additional class next to LdapEventHandler
 * for several reasons: maybe settings of features in here should be configurable in the future in contrast to LdapEventHandler (and reduce refactoring),
 * more processing logic is done in here, in contrast the LdapEventHandler passes the parameters to LdapClientService
 * and in the end this handler also shares some common data and common behavior with ItsLearningSyncEventHandler.
 */
@Injectable()
export class LdapSyncEventHandler extends AbstractLdapEventHandler {
    public static readonly GROUP_DN_REGEX_STR: string = `cn=lehrer-KENNUNG1,cn=groups,ou=KENNUNG2,BASE_DN`;

    public constructor(
        logger: ClassLogger,
        private readonly ldapInstanceConfig: LdapInstanceConfig,
        private readonly ldapClientAdapter: LdapAdapter,
        private readonly personRepository: PersonRepository,
        dBiamPersonenkontextRepo: DBiamPersonenkontextRepo,
        rolleRepo: RolleRepo,
        organisationRepository: OrganisationRepository,
        private readonly eventService: EventRoutingLegacyKafkaService,
        private readonly emailResolverService: EmailResolverService,
        // @ts-expect-error used by EnsureRequestContext decorator
        // Although not accessed directly, MikroORM's @EnsureRequestContext() uses this.em internally
        // to create the request-bound EntityManager context. Removing it would break context creation.
        private readonly em: EntityManager,
    ) {
        super(logger, organisationRepository, dBiamPersonenkontextRepo, rolleRepo);
    }

    @KafkaEventHandler(KafkaPersonExternalSystemsSyncEvent)
    @EventHandler(PersonExternalSystemsSyncEvent)
    @EnsureRequestContext()
    public async personExternalSystemSyncEventHandler(event: PersonExternalSystemsSyncEvent): Promise<void> {
        this.logger.info(
            `[EventID: ${event.eventID}] Received PersonExternalSystemsSyncEvent, personId:${event.personId}`,
        );

        await this.fetchDataAndSync(event.personId);
    }

    /**
     * This event-handler-method is implemented to make fetchDataAndSync() callable indirectly and also avoid the usage without await.
     * Otherwise, method calls to fetchDataAndSync() had to be possible without await and would force usage floating-promises.
     **/
    @KafkaEventHandler(KafkaPersonLdapSyncEvent)
    @EventHandler(PersonLdapSyncEvent)
    @EnsureRequestContext()
    public async personLdapSyncEventHandler(event: PersonLdapSyncEvent): Promise<void> {
        this.logger.info(`[EventID: ${event.eventID}] Received PersonLdapSyncEvent, personId:${event.personId}`);

        await this.fetchDataAndSync(event.personId);
    }

    public async triggerLdapSync(personId: PersonID): Promise<void> {
        await this.fetchDataAndSync(personId);
    }

    private async fetchDataAndSync(personId: PersonID): Promise<void> {
        // Retrieve the person from the DB
        const person: Option<Person<true>> = await this.personRepository.findById(personId);
        if (!person) {
            return this.logger.error(`Person with personId:${personId} could not be found!`);
        }

        // Check if person has a username
        if (!person.username) {
            return this.logger.error(`Person with personId:${personId} has no username!`);
        }

        const personKontextWithUemRolle: Personenkontext<true>[] = await this.findUemKontexts(personId);

        const organisationIDs: OrganisationID[] = uniq(
            personKontextWithUemRolle.map((pk: Personenkontext<true>) => pk.organisationId),
        );
        const organisations: Map<OrganisationID, Organisation<true>> = await this.organisationRepository.findByIds(
            organisationIDs,
        );

        // Delete all organisations from map which are NOT typ SCHULE
        for (const [orgaId, orga] of organisations.entries()) {
            if (orga.typ !== OrganisationsTyp.SCHULE) {
                organisations.delete(orgaId);
            }
        }
        // checking only the first organisation is sufficient, tree can only consist of either OeffentlicheSchulen or ErsatzSchulen.
        if (!organisationIDs[0]) {
            return this.logger.error(
                `Could NOT fetch domain from organisations, no organisations found for person, ABORTING SYNC, personId:${personId}`,
            );
        }
        const uemLdapOu: Result<string> = await this.resolveUemLdapOuOrThrow(organisationIDs[0]);
        if (!uemLdapOu.ok) {
            return this.logger.error(
                `Could NOT fetch LDAP OU from organisations, LDAP-root CANNOT be chosen, ABORTING SYNC, personId:${personId}`,
            );
        }

        const schulenDstNrList: string[] = [];
        let schule: Organisation<true> | undefined;
        for (const pk of personKontextWithUemRolle) {
            schule = organisations.get(pk.organisationId);
            if (!schule) {
                return this.logger.error(`Could not find organisation, orgaId:${pk.organisationId}, pkId:${pk.id}`);
            }
            if (!schule.kennung) {
                return this.logger.error(
                    `Required kennung is missing on organisation, orgaId:${pk.organisationId}, pkId:${pk.id}`,
                );
            }
            schulenDstNrList.push(schule.kennung);
        }
        this.logger.info(
            `Found orgaKennungen:${JSON.stringify(schulenDstNrList)}, for personId:${personId}, username:${person.username}`,
        );

        // Get current attributes for person from LDAP
        const personAttributesFromLdap: Result<LdapPersonAttributes> = await this.ldapClientAdapter.getPersonAttributes(
            personId,
            person.username,
            uemLdapOu.value,
        );
        if (!personAttributesFromLdap.ok) {
            return this.logger.error(
                `Error while fetching attributes for personId:${personId} in LDAP, msg:${personAttributesFromLdap.error.message}`,
            );
        }
        // entryUUID is only return within LdapPersonAttributes, when an empty PersonEntry had to be created,
        // therefore changed data has to be persisted via repository
        if (personAttributesFromLdap.value.entryUUID) {
            person.externalIds.LDAP = personAttributesFromLdap.value.entryUUID;
            await this.personRepository.save(person);
        }

        const givenName: string = person.vorname;
        const surName: string = person.familienname;
        const cn: string = person.username;

        // Get current groups for person from LDAP
        const groups: Result<string[]> = await this.ldapClientAdapter.getGroupsForPerson(personId, person.username);
        if (!groups.ok) {
            return this.logger.error(
                `Error while fetching groups for personId:${personId} in LDAP, msg:${groups.error.message}`,
            );
        }
        this.logger.info(
            `Found groups in LDAP:${JSON.stringify(groups.value)}, for personId:${personId}, username:${person.username}`,
        );

        const groupsToAdd: string[] = this.createGroupAdditionList(schulenDstNrList, groups.value);
        const groupsToRemove: string[] = this.createGroupRemovalList(schulenDstNrList, groups.value);

        const emailRetrieved: Option<PersonEmailResponse> = await this.emailResolverService.findEmailBySpshPerson(
            person.id,
        );
        let emailToSync: string | null = null;
        if (emailRetrieved && emailRetrieved.status === EmailAddressStatus.ENABLED) {
            emailToSync = emailRetrieved.address;
        }

        const syncData: LdapSyncData = {
            personId: person.id,
            username: person.username,
            givenName: givenName,
            surName: surName,
            cn: cn,
            enabledEmailAddress: emailToSync, // TODO sync email addresses form microservice
            disabledEmailAddresses: [],
            groupsToAdd: groupsToAdd,
            groupsToRemove: groupsToRemove,
        };

        await this.syncDataToLdap(syncData, personAttributesFromLdap.value);
        this.eventService.publish(
            new LdapSyncCompletedEvent(personId, person.username),
            new KafkaLdapSyncCompletedEvent(personId, person.username),
        );
    }

    private async syncDataToLdap(
        ldapSyncData: LdapSyncData,
        personAttributesFromLdap: LdapPersonAttributes,
    ): Promise<void> {
        this.logger.info(
            `Syncing data to LDAP for personId:${ldapSyncData.personId}, username:${ldapSyncData.username}`,
        );

        // Check and sync PersonAttributes
        if (ldapSyncData.givenName !== personAttributesFromLdap.givenName) {
            this.logger.warning(
                `Mismatch for givenName, person:${ldapSyncData.givenName}, LDAP:${personAttributesFromLdap.givenName}, personId:${ldapSyncData.personId}, username:${ldapSyncData.username}`,
            );
        }
        if (ldapSyncData.surName !== personAttributesFromLdap.surName) {
            this.logger.warning(
                `Mismatch for surName, person:${ldapSyncData.surName}, LDAP:${personAttributesFromLdap.surName}, personId:${ldapSyncData.personId}, username:${ldapSyncData.username}`,
            );
        }
        if (ldapSyncData.cn !== personAttributesFromLdap.cn) {
            this.logger.warning(
                `Mismatch for cn, person:${ldapSyncData.cn}, LDAP:${personAttributesFromLdap.cn}, personId:${ldapSyncData.personId}, username:${ldapSyncData.username}`,
            );
        }
        if (ldapSyncData.enabledEmailAddress !== personAttributesFromLdap.mailPrimaryAddress) {
            this.logger.warning(
                `Mismatch for enabledEmailAddress, person:${ldapSyncData.enabledEmailAddress}, LDAP:${personAttributesFromLdap.mailPrimaryAddress}, personId:${ldapSyncData.personId}, username:${ldapSyncData.username}`,
            );
        }

        await this.ldapClientAdapter.modifyPersonAttributes(
            ldapSyncData.username,
            ldapSyncData.givenName,
            ldapSyncData.surName,
            ldapSyncData.cn,
        );
        // UEM prefers an old email address over no email address, thus we only change the email address if the new one is not null and different from the current one.
        if (
            ldapSyncData.enabledEmailAddress != null &&
            ldapSyncData.enabledEmailAddress !== personAttributesFromLdap.mailPrimaryAddress
        ) {
            await this.ldapClientAdapter.changeEmailAddressByPersonId(
                ldapSyncData.personId,
                ldapSyncData.username,
                ldapSyncData.enabledEmailAddress,
            );
        }

        await Promise.all([
            ...ldapSyncData.groupsToAdd.map(
                (kennung: string): Promise<Result<boolean>> =>
                    this.ldapClientAdapter.addPersonToGroup(
                        ldapSyncData.username,
                        kennung,
                        personAttributesFromLdap.dn,
                    ),
            ),
            ...ldapSyncData.groupsToRemove.map(
                (kennung: string): Promise<Result<boolean>> =>
                    this.ldapClientAdapter.removePersonFromGroup(
                        ldapSyncData.username,
                        kennung,
                        personAttributesFromLdap.dn,
                    ),
            ),
        ]);
    }

    private createGroupAdditionList(schulenDstNrList: string[], groupDns: string[]): string[] {
        const groupsToAdd: string[] = [];
        for (const schulenDstNr of schulenDstNrList) {
            if (!groupDns.some((groupDn: string) => groupDn.includes(schulenDstNr))) {
                this.logger.warning(`Added missing groupMembership for kennung:${schulenDstNr}`);
                groupsToAdd.push(schulenDstNr);
            }
        }
        return groupsToAdd;
    }

    private createGroupRemovalList(schulenDstNrList: string[], groupDns: string[]): string[] {
        const groupsToRemove: string[] = [];
        for (const groupDn of groupDns) {
            if (!schulenDstNrList.some((schulenDstNr: string) => this.isGroupDnForKennung(groupDn, schulenDstNr))) {
                this.logger.warning(`Orphan group detected, no existing PK for groupDN:${groupDn}`);
                const kennungFromGroupDn: Result<string> = this.getKennungFromGroupDn(groupDn);
                if (!kennungFromGroupDn.ok) {
                    this.logger.error(
                        `Could NOT extract kennung from groupDN:${groupDn}, CANNOT add group to list of groups for removal, err:${kennungFromGroupDn.error.message}`,
                    );
                } else {
                    groupsToRemove.push(kennungFromGroupDn.value);
                }
            }
        }
        return groupsToRemove;
    }

    private isGroupDnForKennung(groupDn: string, kennung: string): boolean {
        const rep: string = LdapSyncEventHandler.GROUP_DN_REGEX_STR.replace('KENNUNG1', kennung)
            .replace('KENNUNG2', kennung)
            .replace('BASE_DN', this.ldapInstanceConfig.BASE_DN);
        return groupDn === rep;
    }

    private getKennungFromGroupDn(groupDn: string): Result<string> {
        const split: string[] = groupDn.split(',cn=groups,');

        if (!split[0] || !split[0].match(/cn=lehrer-\d+/)) {
            return {
                ok: false,
                error: new LdapGroupKennungExtractionError('Split on ,cn=groups, failed'),
            };
        }

        return {
            ok: true,
            value: split[0].replace('cn=lehrer-', ''),
        };
    }
}
