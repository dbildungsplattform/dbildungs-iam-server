import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { uniq } from 'lodash-es';

import { EntityManager } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { EventHandler } from '../../../core/eventbus/decorators/event-handler.decorator.js';
import { KafkaEventHandler } from '../../../core/eventbus/decorators/kafka-event-handler.decorator.js';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { PersonIdentifier } from '../../../core/logging/person-identifier.js';
import { OxServerConfig } from '../../../shared/config/ox-server.config.js';
import { ServerConfig } from '../../../shared/config/server.config.js';
import { DomainError } from '../../../shared/error/index.js';
import { DisabledEmailAddressGeneratedEvent } from '../../../shared/events/email/disabled-email-address-generated.event.js';
import { EmailAddressAlreadyExistsEvent } from '../../../shared/events/email/email-address-already-exists.event.js';
import { EmailAddressChangedEvent } from '../../../shared/events/email/email-address-changed.event.js';
import { EmailAddressDisabledEvent } from '../../../shared/events/email/email-address-disabled.event.js';
import { EmailAddressGeneratedAfterLdapSyncFailedEvent } from '../../../shared/events/email/email-address-generated-after-ldap-sync-failed.event.js';
import { EmailAddressGeneratedEvent } from '../../../shared/events/email/email-address-generated.event.js';
import { EmailAddressMarkedForDeletionEvent } from '../../../shared/events/email/email-address-marked-for-deletion.event.js';
import { EmailAddressesPurgedEvent } from '../../../shared/events/email/email-addresses-purged.event.js';
import { KafkaDisabledEmailAddressGeneratedEvent } from '../../../shared/events/email/kafka-disabled-email-address-generated.event.js';
import { KafkaEmailAddressAlreadyExistsEvent } from '../../../shared/events/email/kafka-email-address-already-exists.event.js';
import { KafkaEmailAddressChangedEvent } from '../../../shared/events/email/kafka-email-address-changed.event.js';
import { KafkaEmailAddressDisabledEvent } from '../../../shared/events/email/kafka-email-address-disabled.event.js';
import { KafkaEmailAddressGeneratedAfterLdapSyncFailedEvent } from '../../../shared/events/email/kafka-email-address-generated-after-ldap-sync-failed.event.js';
import { KafkaEmailAddressGeneratedEvent } from '../../../shared/events/email/kafka-email-address-generated.event.js';
import { KafkaEmailAddressMarkedForDeletionEvent } from '../../../shared/events/email/kafka-email-address-marked-for-deletion.event.js';
import { KafkaEmailAddressesPurgedEvent } from '../../../shared/events/email/kafka-email-addresses-purged.event.js';
import { KafkaOrganisationDeletedEvent } from '../../../shared/events/kafka-organisation-deleted.event.js';
import { KafkaPersonDeletedAfterDeadlineExceededEvent } from '../../../shared/events/kafka-person-deleted-after-deadline-exceeded.event.js';
import { KafkaPersonDeletedEvent } from '../../../shared/events/kafka-person-deleted.event.js';
import { KafkaPersonenkontextUpdatedEvent } from '../../../shared/events/kafka-personenkontext-updated.event.js';
import { OrganisationDeletedEvent } from '../../../shared/events/organisation-deleted.event.js';
import { KafkaOxAccountDeletedEvent } from '../../../shared/events/ox/kafka-ox-account-deleted.event.js';
import { OxAccountDeletedEvent } from '../../../shared/events/ox/ox-account-deleted.event.js';
import { PersonDeletedAfterDeadlineExceededEvent } from '../../../shared/events/person-deleted-after-deadline-exceeded.event.js';
import { PersonDeletedEvent } from '../../../shared/events/person-deleted.event.js';
import { PersonenkontextEventKontextData } from '../../../shared/events/personenkontext-event.types.js';
import { PersonenkontextUpdatedEvent } from '../../../shared/events/personenkontext-updated.event.js';
import { OrganisationKennung, PersonID, PersonUsername } from '../../../shared/types/index.js';
import { OXGroupID, OXUserID } from '../../../shared/types/ox-ids.types.js';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { EmailAddress, EmailAddressStatus } from '../../email/domain/email-address.js';
import { EmailRepo } from '../../email/persistence/email.repo.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { OxMemberAlreadyInGroupError } from '../adapter/domain/error/ox-member-already-in-group.error.js';
import { OxNoSuchUserError } from '../adapter/domain/error/ox-no-such-user.error.js';
import {
    generateDisabledOxUserChangedEvent,
    generateOxSyncUserCreatedEvent,
    generateOxUserChangedEvent,
    generateOxUserCreatedEvent,
    OxAdapter,
    OxUserChangedEventCreator,
    OxUserCreatedEventCreator,
} from '../adapter/domain/ox.adapter.js';
import {
    AddMemberToGroupAction,
    AddMemberToGroupResponse,
} from '../adapter/technical/actions/group/add-member-to-group.action.js';
import { ChangeByModuleAccessAction } from '../adapter/technical/actions/user/change-by-module-access.action.js';
import { ChangeUserAction } from '../adapter/technical/actions/user/change-user.action.js';
import { CreateUserAction, CreateUserResponse } from '../adapter/technical/actions/user/create-user.action.js';
import { DeleteUserAction } from '../adapter/technical/actions/user/delete-user.action.js';
import { ExistsUserAction, ExistsUserResponse } from '../adapter/technical/actions/user/exists-user.action.js';
import {
    GetDataForUserAction,
    GetDataForUserResponse,
} from '../adapter/technical/actions/user/get-data-user.action.js';
import { OxSendService } from '../adapter/technical/ox.send-service.js';
import { OxSyncEventHandler } from './ox-sync-event-handler.js';

@Injectable()
export class OxEventHandler {
    public ENABLED: boolean;

    public constructor(
        protected readonly logger: ClassLogger,
        protected readonly emailResolverService: EmailResolverService,
        protected readonly oxService: OxSendService,
        protected readonly oxAdapter: OxAdapter,
        protected readonly oxSyncEventHandler: OxSyncEventHandler,
        protected readonly emailRepo: EmailRepo,
        protected readonly personRepository: PersonRepository,
        protected readonly eventService: EventRoutingLegacyKafkaService,
        protected configService: ConfigService<ServerConfig>,
        // @ts-expect-error used by EnsureRequestContext decorator
        // Although not accessed directly, MikroORM's @EnsureRequestContext() uses this.em internally
        // to create the request-bound EntityManager context. Removing it would break context creation.
        private readonly em: EntityManager,
    ) {
        const oxConfig: OxServerConfig = configService.getOrThrow<OxServerConfig>('OX');
        this.ENABLED = oxConfig.ENABLED;
    }

    @EventHandler(EmailAddressChangedEvent)
    @KafkaEventHandler(KafkaEmailAddressChangedEvent)
    @EnsureRequestContext()
    public async handleEmailAddressChangedEvent(
        event: EmailAddressChangedEvent | KafkaEmailAddressChangedEvent,
    ): Promise<void> {
        this.logger.info(
            `Received EmailAddressChangedEvent, personId:${event.personId}, username:${event.username}, oldEmailAddressId:${event.oldEmailAddressId}, oldAddress:${event.oldAddress}, newEmailAddressId:${event.newEmailAddressId}, newAddress:${event.newAddress}`,
        );
        if (!this.ENABLED) {
            return this.logger.info('Not enabled, ignoring event');
        }

        await this.changeOxUser(event.personId, event.username, generateOxUserChangedEvent);
    }

    @EventHandler(EmailAddressGeneratedEvent)
    @KafkaEventHandler(KafkaEmailAddressGeneratedEvent)
    @EnsureRequestContext()
    public async handleEmailAddressGeneratedEvent(
        event: EmailAddressGeneratedEvent | KafkaEmailAddressGeneratedEvent,
    ): Promise<void> {
        this.logger.info(
            `Received EmailAddressGeneratedEvent, personId:${event.personId}, username:${event.username}, emailAddressId:${event.emailAddressId}, address:${event.address}`,
        );
        if (!this.ENABLED) {
            return this.logger.info('Not enabled, ignoring event');
        }

        await this.createOxUser(event.personId, event.username, event.orgaKennung, generateOxUserCreatedEvent);
    }

    @EventHandler(EmailAddressGeneratedAfterLdapSyncFailedEvent)
    @KafkaEventHandler(KafkaEmailAddressGeneratedAfterLdapSyncFailedEvent)
    @EnsureRequestContext()
    public async handleEmailAddressGeneratedAfterLdapSyncFailedEvent(
        event: EmailAddressGeneratedAfterLdapSyncFailedEvent | KafkaEmailAddressGeneratedAfterLdapSyncFailedEvent,
    ): Promise<void> {
        this.logger.info(
            `Received EmailAddressGeneratedAfterLdapSyncFailedEvent, personId:${event.personId}, username:${event.username}, emailAddressId:${event.emailAddressId}, address:${event.address}`,
        );
        if (!this.ENABLED) {
            return this.logger.info('Not enabled, ignoring event');
        }

        await this.createOxUser(event.personId, event.username, event.orgaKennung, generateOxSyncUserCreatedEvent);
    }

    @KafkaEventHandler(KafkaDisabledEmailAddressGeneratedEvent)
    @EventHandler(DisabledEmailAddressGeneratedEvent)
    @EnsureRequestContext()
    public async handleDisabledEmailAddressGeneratedEvent(event: DisabledEmailAddressGeneratedEvent): Promise<void> {
        this.logger.info(
            `Received EmailAddressGeneratedAndDisabledEvent, personId:${event.personId}, username:${event.username}, address:${event.address}, domain:${event.domain}`,
        );

        if (!this.ENABLED) {
            return this.logger.info('Not enabled, ignoring event');
        }

        await this.changeOxUser(event.personId, event.username, generateDisabledOxUserChangedEvent);
    }

    @KafkaEventHandler(KafkaEmailAddressAlreadyExistsEvent)
    @EventHandler(EmailAddressAlreadyExistsEvent)
    @EnsureRequestContext()
    public async handleEmailAddressAlreadyExistsEvent(event: EmailAddressAlreadyExistsEvent): Promise<void> {
        this.logger.info(
            `Received EmailAddressAlreadyExistsEvent, personId:${event.personId}, orgaKennung:${event.orgaKennung}`,
        );

        // Check if the functionality is enabled
        if (!this.ENABLED) {
            return this.logger.info('Not enabled, ignoring event');
        }

        // Fetch the person's details using their personId
        const person: Option<Person<true>> = await this.personRepository.findById(event.personId);
        if (!person) {
            return this.logger.error(`Person not found for personId:${event.personId}`);
        }

        // If the person doesn't have an OX user ID, log an error and stop the process
        if (!person.oxUserId) {
            return this.logger.error(`Person with personId:${event.personId} does not have a ox_id. Cannot sync.`);
        }

        // If the person doesn't have a username, log an error and stop the process
        if (!person.username) {
            return this.logger.error(`Person with personId:${event.personId} does not have a username. Cannot sync.`);
        }

        // This also publishes an OxUserChangedEvent
        await this.oxSyncEventHandler.sync(event.personId, person.username);

        // Log the successful sync of the user
        this.logger.info(`Successfully synced user, personId:${event.personId}, oxUserId:${person.oxUserId}`);
    }

    @KafkaEventHandler(KafkaEmailAddressDisabledEvent)
    @EventHandler(EmailAddressDisabledEvent)
    @EnsureRequestContext()
    public async handleEmailAddressDisabledEvent(event: EmailAddressDisabledEvent): Promise<void> {
        this.logger.info(`Received EmailAddressDisabledEvent, personId:${event.personId}, username:${event.username}`);
        if (!this.ENABLED) {
            return this.logger.info('Not enabled, ignoring event');
        }
        const person: Option<Person<true>> = await this.personRepository.findById(event.personId);
        if (!person) {
            return this.logger.error(`Could Not Find Person For personId:${event.personId}`);
        }
        if (!person.oxUserId) {
            return this.logger.error(
                `Could Not Remove Person From OxGroups, No OxUserId For personId:${event.personId}`,
            );
        }

        //remove oxUser as member from all its oxGroups
        //logging about success or errors is done inside removeOxUserFromAllItsOxGroups
        await this.oxAdapter.removeOxUserFromAllItsOxGroups(person.oxUserId, {
            personId: event.personId,
            username: event.username,
        });
    }

    @KafkaEventHandler(KafkaPersonenkontextUpdatedEvent)
    @EventHandler(PersonenkontextUpdatedEvent)
    @EnsureRequestContext()
    public async handlePersonenkontextUpdatedEvent(event: PersonenkontextUpdatedEvent): Promise<void> {
        this.logger.info(
            `Received PersonenkontextUpdatedEvent, personId:${event.person.id}, username:${event.person.username}, newPKs:${event.newKontexte.length}, removedPKs:${event.removedKontexte.length}`,
        );
        if (this.emailResolverService.shouldUseEmailMicroservice()) {
            this.logger.info(`Ignoring Event for personId:${event.person.id} because email microservice is enabled`);
            return;
        }
        if (!this.ENABLED) {
            return this.logger.info('Not enabled, ignoring event');
        }
        const person: Option<Person<true>> = await this.personRepository.findById(event.person.id);
        if (!person) {
            return this.logger.error(`Could Not Find Person For personId:${event.person.id}`);
        }
        if (!person.oxUserId) {
            return this.logger.error(`OxUserId Not Defined For personId:${event.person.id}`);
        }
        // For each removed personenkontext and if rollenart === LEHR
        const rollenArtLehrPKs: PersonenkontextEventKontextData[] = event.removedKontexte.filter(
            (pk: PersonenkontextEventKontextData) => pk.rolle === RollenArt.LEHR,
        );
        // Await the requests to OX explicitly to avoid transaction-exceptions on OX-side regarding concurrent modifications
        /* eslint-disable no-await-in-loop */
        for (const pk of rollenArtLehrPKs) {
            const oxGroupId: OXGroupID | DomainError = await this.oxAdapter.getOxGroupByName(
                OxAdapter.LEHRER_OX_GROUP_NAME_PREFIX + pk.orgaKennung,
            );
            if (oxGroupId instanceof DomainError) {
                return this.logger.error(
                    `Could Not Get OxGroupId For oxGroupName:${OxAdapter.LEHRER_OX_GROUP_NAME_PREFIX + pk.orgaKennung}`,
                );
            }
            //Logging is done in removeOxUserFromOxGroup
            await this.oxAdapter.removeOxUserFromOxGroup(oxGroupId, person.oxUserId, {
                personId: person.id,
                username: person.username,
            });
        }
    }

    @EventHandler(PersonDeletedAfterDeadlineExceededEvent)
    @KafkaEventHandler(KafkaPersonDeletedAfterDeadlineExceededEvent)
    @EnsureRequestContext()
    public async handlePersonDeletedAfterDeadlineExceededEvent(
        event: PersonDeletedAfterDeadlineExceededEvent | KafkaPersonDeletedAfterDeadlineExceededEvent,
    ): Promise<void> {
        this.logger.info(
            `Received PersonDeletedAfterDeadlineExceededEvent, personId:${event.personId}, username:${event.username}, oxUserId:${event.oxUserId}`,
        );
        if (!this.ENABLED) {
            return this.logger.info('Not enabled, ignoring event');
        }

        await this.handlePersonHasNotAnyPKWithRollenartLehr(event.personId, event.username, event.oxUserId);
    }

    public async handlePersonHasNotAnyPKWithRollenartLehr(
        personId: PersonID,
        username: PersonUsername | undefined,
        oxUserId: OXUserID,
    ): Promise<void> {
        //change oxUserName to avoid conflicts for future OX-createUser-requests
        const action: ChangeUserAction = this.oxAdapter.createChangeUserAction(oxUserId, personId);
        const result: Result<void, DomainError> = await this.oxService.send(action);

        if (!result.ok) {
            return this.logger.error(
                `Could Not Change OxUsername, personId:${personId}, username:${username}, oxUserId:${oxUserId} After PersonDeletedAfterDeadlineExceededEvent, error:${result.error.message}`,
            );
        }

        return this.logger.info(
            `Successfully Changed OxUsername, personId:${personId}, username:${username}, oxUserId:${oxUserId} After PersonDeletedAfterDeadlineExceededEvent`,
        );
    }

    // this method cannot make use of handlePerson(personId) method, because personId is already null when event is received
    @KafkaEventHandler(KafkaPersonDeletedEvent)
    @EventHandler(PersonDeletedEvent)
    @EnsureRequestContext()
    public async handlePersonDeletedEvent(event: PersonDeletedEvent | KafkaPersonDeletedEvent): Promise<void> {
        this.logger.info(`Received PersonDeletedEvent, personId:${event.personId}`);

        if (this.emailResolverService.shouldUseEmailMicroservice()) {
            this.logger.info(`Ignoring Event for personId:${event.personId} because email microservice is enabled`);
            return;
        }

        // Check if the functionality is enabled
        if (!this.ENABLED) {
            return this.logger.info('Not enabled, ignoring event');
        }

        if (!event.emailAddress) {
            return this.logger.error('Cannot Create OX-delete-user-request, Email-Address Is Not Defined');
        }

        const emailAddress: Option<EmailAddress<true>> = await this.emailRepo.findByAddress(event.emailAddress);
        if (!emailAddress) {
            return this.logger.error(
                `Cannot Create OX-delete-user-request For address:${event.emailAddress} Could Not Be Found`,
            );
        }
        if (!emailAddress.oxUserID) {
            return this.logger.error(
                `Cannot Create OX-delete-user-request For address:${event.emailAddress}, OxUserId Is Not Defined`,
            );
        }

        return this.removeOxUserFromAllItsGroupsAndDeleteOxAccount(emailAddress.oxUserID, {
            personId: event.personId,
            username: event.username,
        });
    }

    @KafkaEventHandler(KafkaEmailAddressMarkedForDeletionEvent)
    @EventHandler(EmailAddressMarkedForDeletionEvent)
    @EnsureRequestContext()
    public async handleEmailAddressMarkedForDeletionEvent(event: EmailAddressMarkedForDeletionEvent): Promise<void> {
        this.logger.info(
            `Received EmailAddressMarkedForDeletionEvent, personId:${event.personId}, username:${event.username}, oxUserId:${event.oxUserId}`,
        );

        // Check if the functionality is enabled
        if (!this.ENABLED) {
            return this.logger.info('Not enabled, ignoring event');
        }
        const getDataAction: GetDataForUserAction = this.oxAdapter.createGetDataForUserAction(event.oxUserId);
        const getDataResult: Result<GetDataForUserResponse, DomainError> = await this.oxService.send(getDataAction);

        if (!getDataResult.ok && getDataResult.error instanceof OxNoSuchUserError) {
            this.oxAdapter.publishOxEmailAddressDeletedEvent(
                event.personId,
                event.username,
                event.oxUserId,
                event.address,
            );
            return this.logger.info(
                `User already deleted in OX, publishing (Kafka)OxEmailAddressDeleted-event, personId:${event.personId}, username:${event.username}`,
            );
        }

        if (!getDataResult.ok) {
            return this.logger.error(
                `Cannot get data for oxUsername:${event.username} from OX, Aborting Email-Address Removal, personId:${event.personId}, username:${event.username}`,
            );
        }
        let newAliasesArray: string[] = getDataResult.value.aliases;
        const aliasesLengthBeforeRemoval: number = newAliasesArray.length;
        this.logger.info(
            `Found Current aliases:${JSON.stringify(newAliasesArray)}, personId:${event.personId}, username:${event.username}`,
        );

        newAliasesArray = newAliasesArray.filter((a: string) => a !== event.address);
        if (aliasesLengthBeforeRemoval !== newAliasesArray.length) {
            this.logger.info(
                `Removed From alias:${event.address}, personId:${event.personId}, username:${event.username}`,
            );
        }

        // Use the first alias as primary mail (guaranteed to still exist in OX)
        let newPrimaryMail: string | undefined = newAliasesArray[0];

        if (event.personId) {
            // Try to find a primary mail if user still exists, instead of using one returned by ox
            const enabledMail: Option<EmailAddress<true>> = await this.emailRepo.findEnabledByPerson(event.personId);

            if (enabledMail) {
                newPrimaryMail = enabledMail.address;

                // Make sure the email is in the aliases
                newAliasesArray = uniq([newPrimaryMail, ...newAliasesArray]);
            }
        }

        if (newPrimaryMail) {
            const action: ChangeUserAction = this.oxAdapter.createChangeUserAction(
                event.oxUserId,
                undefined, // oxUserName
                newAliasesArray, // aliases
                undefined, // givenname
                undefined, // surname
                undefined, // displayname
                newPrimaryMail, // defaultSenderAddress
                newPrimaryMail, // primaryEmail
            );
            const result: Result<void, DomainError> = await this.oxService.send(action);

            if (!result.ok) {
                return this.logger.error(
                    `Could Not Remove EmailAddress from OxAccount, personId:${event.personId}, username:${event.username}, oxUserId:${event.oxUserId}, error:${result.error.message}`,
                );
            }
        } else {
            // If no primary email could be determined, we can't update the ox-user.
            // Just treat this as a success, so the rest of the event-chain can proceed.
            this.logger.info(
                `Could Not Remove EmailAddress from OxAccount because user would not have any more addresses, treat address as deleted. personId:${event.personId}, username:${event.username}, oxUserId:${event.oxUserId}`,
            );
        }

        this.oxAdapter.publishOxEmailAddressDeletedEvent(event.personId, event.username, event.oxUserId, event.address);
        return this.logger.info(
            `Successfully Removed EmailAddress from OxAccount, personId:${event.personId}, username:${event.username}, oxUserId:${event.oxUserId}`,
        );
    }

    @KafkaEventHandler(KafkaEmailAddressesPurgedEvent)
    @EventHandler(EmailAddressesPurgedEvent)
    @EnsureRequestContext()
    public async handleEmailAddressesPurgedEvent(event: EmailAddressesPurgedEvent): Promise<void> {
        this.logger.info(
            `Received EmailAddressesPurgedEvent, personId:${event.personId}, username:${event.username}, oxUserId:${event.oxUserId}`,
        );

        // Check if the functionality is enabled
        if (!this.ENABLED) {
            return this.logger.info('Not enabled, ignoring event');
        }

        return this.removeOxUserFromAllItsGroupsAndDeleteOxAccount(event.oxUserId, {
            personId: event.personId,
            username: event.username,
        });
    }

    @KafkaEventHandler(KafkaOrganisationDeletedEvent)
    @EventHandler(OrganisationDeletedEvent)
    @EnsureRequestContext()
    public async handleOrganisationDeletedEvent(event: OrganisationDeletedEvent): Promise<void> {
        this.logger.info(
            `Received OrganisationDeletedEvent, organisationId:${event.organisationId}, name:${event.name}, kennung:${event.kennung}, typ:${event.typ}`,
        );

        // Check if the functionality is enabled
        if (!this.ENABLED) {
            return this.logger.info('Not enabled, ignoring event');
        }

        if (this.emailResolverService.shouldUseEmailMicroservice()) {
            this.logger.info(
                `Ignoring Event for organisationId:${event.organisationId} because email microservice is enabled`,
            );
            return;
        }

        if (!event.kennung || event?.typ !== OrganisationsTyp.SCHULE) {
            return this.logger.info('OrganisationDeletedEvent does not apply, ignoring event');
        }

        await this.oxAdapter.removeOxGroup(event.kennung);
    }

    private async removeOxUserFromAllItsGroupsAndDeleteOxAccount(
        oxUserId: OXUserID,
        personIdentifier: PersonIdentifier,
    ): Promise<void> {
        this.logger.infoPersonalized(
            `Remove OxUser from all its groups and delete OxAccount, oxUserId:${oxUserId}`,
            personIdentifier,
        );

        //remove oxUser as member from all its oxGroups
        //logging about success or errors is done inside removeOxUserFromAllItsOxGroups
        await this.oxAdapter.removeOxUserFromAllItsOxGroups(oxUserId, personIdentifier);

        const action: DeleteUserAction = this.oxAdapter.createDeleteUserAction(oxUserId);
        const result: Result<void, DomainError> = await this.oxService.send(action);

        if (!result.ok) {
            return this.logger.errorPersonalized(
                `Could Not Delete OxAccount For oxUserId:${oxUserId}, error:${result.error.message}`,
                personIdentifier,
            );
        }
        this.eventService.publish(
            new OxAccountDeletedEvent(personIdentifier.personId, personIdentifier.username, oxUserId),
            new KafkaOxAccountDeletedEvent(personIdentifier.personId, personIdentifier.username, oxUserId),
        );

        return this.logger.infoPersonalized(
            `Successfully Deleted OxAccount For oxUserId:${oxUserId}`,
            personIdentifier,
        );
    }

    private async getMostRecentRequestedEmailAddress(personId: PersonID): Promise<Option<EmailAddress<true>>> {
        const requestedEmailAddresses: Option<EmailAddress<true>[]> =
            await this.emailRepo.findByPersonSortedByUpdatedAtDesc(personId, EmailAddressStatus.REQUESTED);
        if (!requestedEmailAddresses || !requestedEmailAddresses[0]) {
            this.logger.error(`No REQUESTED email-address found for personId:${personId}`);
            return undefined;
        }
        this.logger.info(
            `Found mostRecentRequested Email-Address:${JSON.stringify(requestedEmailAddresses[0].address)} for personId:${personId}`,
        );

        return requestedEmailAddresses[0];
    }

    private async addOxUserToOxGroup(
        oxGroupId: OXGroupID,
        oxUserId: OXUserID,
        personIdentifier: PersonIdentifier,
    ): Promise<Result<AddMemberToGroupResponse>> {
        const action: AddMemberToGroupAction = this.oxAdapter.createAddMemberToGroupAction(oxGroupId, oxUserId);
        const result: Result<AddMemberToGroupResponse, DomainError> = await this.oxService.send(action);

        if (!result.ok) {
            if (result.error instanceof OxMemberAlreadyInGroupError) {
                this.logger.infoPersonalized(
                    `Added OxUser To OxGroup not necessary (already in group), oxUserId:${oxUserId}, oxGroupId:${oxGroupId}`,
                    personIdentifier,
                );
            } else {
                this.logger.errorPersonalized(
                    `Could Not Add OxUser To OxGroup, oxUserId:${oxUserId}, oxGroupId:${oxGroupId}`,
                    personIdentifier,
                );
            }
        } else {
            this.logger.infoPersonalized(
                `Successfully Added OxUser To OxGroup, oxUserId:${oxUserId}, oxGroupId:${oxGroupId}`,
                personIdentifier,
            );
        }
        return result;
    }

    private async createOxUser(
        personId: PersonID,
        username: PersonUsername,
        orgaKennung: OrganisationKennung,
        oxUserCreatedEventCreator: OxUserCreatedEventCreator,
    ): Promise<void> {
        const personIdentifier: PersonIdentifier = {
            personId: personId,
            username: username,
        };
        const person: Option<Person<true>> = await this.personRepository.findById(personId);

        if (!person) {
            return this.logger.errorPersonalized(`Person not found`, personIdentifier);
        }
        if (!person.username) {
            return this.logger.errorPersonalized(
                `Person has no username: cannot create OXEmailAddress`,
                personIdentifier,
            );
        }

        const mostRecentRequestedEmailAddress: Option<EmailAddress<true>> =
            await this.getMostRecentRequestedEmailAddress(personId);
        if (!mostRecentRequestedEmailAddress) {
            return;
        }
        const requestedEmailAddressString: string = mostRecentRequestedEmailAddress.address;

        const existsAction: ExistsUserAction = this.oxAdapter.createExistsUserAction(person.username);
        const existsResult: Result<ExistsUserResponse, DomainError> = await this.oxService.send(existsAction);

        if (existsResult.ok && existsResult.value.exists) {
            mostRecentRequestedEmailAddress.failed();
            await this.emailRepo.save(mostRecentRequestedEmailAddress);
            return this.logger.errorPersonalized(`Cannot create user in OX, user already exists`, personIdentifier);
        }

        const action: CreateUserAction = this.oxAdapter.createCreateUserAction(
            person.username,
            person.username,
            person.vorname,
            person.familienname,
            requestedEmailAddressString,
        );
        const createUserResult: Result<CreateUserResponse, DomainError> = await this.oxService.send(action);

        if (!createUserResult.ok) {
            mostRecentRequestedEmailAddress.failed();
            await this.emailRepo.save(mostRecentRequestedEmailAddress);

            return this.logger.errorPersonalized(
                `Could not create user in OX, error:${createUserResult.error.message}`,
                personIdentifier,
            );
        }

        this.logger.infoPersonalized(
            `User created in OX, oxUserId:${createUserResult.value.id}, oxEmail:${createUserResult.value.primaryEmail}`,
            personIdentifier,
        );

        mostRecentRequestedEmailAddress.oxUserID = createUserResult.value.id;
        const emailAddressUpdateResult: EmailAddress<true> | DomainError = await this.emailRepo.save(
            mostRecentRequestedEmailAddress,
        );
        if (emailAddressUpdateResult instanceof DomainError) {
            mostRecentRequestedEmailAddress.failed();
            await this.emailRepo.save(mostRecentRequestedEmailAddress);
            return this.logger.errorPersonalized(`Persisting oxUserId on emailAddress failed`, personIdentifier);
        }

        const oxGroupId: Result<OXGroupID> = await this.oxAdapter.getExistingOxGroupByNameOrCreateOxGroup(
            OxAdapter.LEHRER_OX_GROUP_NAME_PREFIX + orgaKennung,
            OxAdapter.LEHRER_OX_GROUP_DISPLAY_NAME_PREFIX + orgaKennung,
        );
        if (!oxGroupId.ok) {
            mostRecentRequestedEmailAddress.failed();
            await this.emailRepo.save(mostRecentRequestedEmailAddress);
            return this.logger.logUnknownAsError(
                `Failed getting existing OxGroup by name or create new OxGroup if necessary, personId:${personIdentifier.personId}, username:${personIdentifier.username}`,
                oxGroupId.error,
            );
        }

        const addUserToGroupResult: Result<AddMemberToGroupResponse> = await this.addOxUserToOxGroup(
            oxGroupId.value,
            createUserResult.value.id,
            {
                personId: personIdentifier.personId,
                username: personIdentifier.username,
            },
        );
        if (!addUserToGroupResult.ok) {
            mostRecentRequestedEmailAddress.failed();
            await this.emailRepo.save(mostRecentRequestedEmailAddress);
            return this.logger.logUnknownAsError(
                `Failed adding user to OXGroup, personId:${personIdentifier.personId}, username:${personIdentifier.username}`,
                addUserToGroupResult.error,
            );
        }

        const changeByModuleAccessAction: ChangeByModuleAccessAction = this.oxAdapter.createChangeByModuleAccessAction(
            createUserResult.value.id,
        );
        const changeByModuleAccessResult: Result<void, DomainError> =
            await this.oxService.send(changeByModuleAccessAction);

        if (!changeByModuleAccessResult.ok) {
            //only log error, do not set email-address status = FAILED, the ChangeByModuleAccessAction won't work against OX-DEV
            this.logger.errorPersonalized(
                `Could Not Adjust GlobalAddressBookDisabled For oxUserId:${createUserResult.value.id}, error:${changeByModuleAccessResult.error.message}`,
                personIdentifier,
            );
        }

        this.oxAdapter.publishOxUserChangedEvent2(
            oxUserCreatedEventCreator,
            personId,
            person.username,
            createUserResult.value.id,
            createUserResult.value.username,
            createUserResult.value.primaryEmail,
        );
    }

    private async changeOxUser(
        personId: PersonID,
        username: PersonUsername,
        eventCreator: OxUserChangedEventCreator,
    ): Promise<void> {
        const personIdentifier: PersonIdentifier = {
            personId: personId,
            username: username,
        };
        const person: Option<Person<true>> = await this.personRepository.findById(personId);

        if (!person) {
            return this.logger.errorPersonalized(`Person not found`, personIdentifier);
        }
        if (!person.username) {
            return this.logger.errorPersonalized(
                `Person has no username: Cannot Change Email-Address In OX`,
                personIdentifier,
            );
        }
        if (!person.oxUserId) {
            return this.logger.errorPersonalized(`Person has no OXUserId`, personIdentifier);
        }

        const mostRecentRequestedEmailAddress: Option<EmailAddress<true>> =
            await this.getMostRecentRequestedEmailAddress(personId);
        if (!mostRecentRequestedEmailAddress) {
            return;
        } //logging is done in getMostRecentRequestedEmailAddress
        const requestedEmailAddressString: string = mostRecentRequestedEmailAddress.address;

        const getDataAction: GetDataForUserAction = this.oxAdapter.createGetDataForUserAction(person.oxUserId);
        const getDataResult: Result<GetDataForUserResponse, DomainError> = await this.oxService.send(getDataAction);

        if (!getDataResult.ok) {
            mostRecentRequestedEmailAddress.failed();
            await this.emailRepo.save(mostRecentRequestedEmailAddress);
            return this.logger.error(
                `Cannot get data for oxUsername:${person.username} from OX, Aborting Email-Address Change, personId:${personIdentifier.personId}, username:${personIdentifier.username}`,
            );
        }
        const newAliasesArray: string[] = getDataResult.value.aliases;
        this.logger.info(
            `Found Current aliases:${JSON.stringify(newAliasesArray)}, personId:${personIdentifier.personId}, username:${personIdentifier.username}`,
        );

        newAliasesArray.push(requestedEmailAddressString);
        this.logger.info(
            `Added New alias:${requestedEmailAddressString}, personId:${personIdentifier.personId}, username:${personIdentifier.username}`,
        );

        const action: ChangeUserAction = this.oxAdapter.createChangeUserAction(
            person.oxUserId,
            person.username,
            newAliasesArray,
            person.vorname,
            person.familienname,
            person.username, //IS EXPLICITLY NOT SET to vorname+familienname
            requestedEmailAddressString,
            requestedEmailAddressString,
        );
        const result: Result<void, DomainError> = await this.oxService.send(action);

        if (!result.ok) {
            mostRecentRequestedEmailAddress.failed();
            await this.emailRepo.save(mostRecentRequestedEmailAddress);

            return this.logger.errorPersonalized(
                `Could not change email-address for oxUserId:${person.oxUserId}, error:${result.error.message}`,
                personIdentifier,
            );
        }

        this.logger.infoPersonalized(
            `Changed primary email-address in OX for user, oxUserId:${person.oxUserId}, oxUsername:${person.username}, new email-address:${requestedEmailAddressString}`,
            personIdentifier,
        );

        this.oxAdapter.publishOxUserChangedEvent2(
            eventCreator,
            personId,
            person.username,
            person.oxUserId,
            person.username, //strictEquals the new OxUsername
            requestedEmailAddressString,
        );
    }
}
