import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EventRoutingLegacyKafkaService } from '../../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { PersonIdentifier } from '../../../../core/logging/person-identifier.js';
import { OxServerConfig } from '../../../../shared/config/ox-server.config.js';
import { ServerConfig } from '../../../../shared/config/server.config.js';
import { DomainError } from '../../../../shared/error/domain.error.js';
import { DisabledOxUserChangedEvent } from '../../../../shared/events/ox/disabled-ox-user-changed.event.js';
import { KafkaDisabledOxUserChangedEvent } from '../../../../shared/events/ox/kafka-disabled-ox-user-changed.event.js';
import { KafkaOxEmailAddressDeletedEvent } from '../../../../shared/events/ox/kafka-ox-email-address-deleted.event.js';
import { KafkaOxUserChangedEvent } from '../../../../shared/events/ox/kafka-ox-user-changed.event.js';
import { OxEmailAddressDeletedEvent } from '../../../../shared/events/ox/ox-email-address-deleted.event.js';
import { OxUserChangedEvent } from '../../../../shared/events/ox/ox-user-changed.event.js';
import { PersonID, PersonUsername } from '../../../../shared/types/aggregate-ids.types.js';
import {
    OXContextID,
    OXContextName,
    OXGroupID,
    OXGroupName,
    OXUserID,
    OXUserName,
} from '../../../../shared/types/ox-ids.types.js';
import { EmailAddress, EmailAddressStatus } from '../../../email/domain/email-address.js';
import { EmailRepo } from '../../../email/persistence/email.repo.js';
import { PersonRepository } from '../../../person/persistence/person.repository.js';
import { AddMemberToGroupAction } from '../technical/actions/group/add-member-to-group.action.js';
import {
    CreateGroupAction,
    CreateGroupParams,
    CreateGroupResponse,
} from '../technical/actions/group/create-group.action.js';
import {
    ListGroupsForUserAction,
    ListGroupsForUserParams,
    ListGroupsForUserResponse,
} from '../technical/actions/group/list-groups-for-user.action.js';
import {
    ListGroupsAction,
    ListGroupsParams,
    ListGroupsResponse,
} from '../technical/actions/group/list-groups.action.js';
import { GroupMemberParams, OXGroup } from '../technical/actions/group/ox-group.types.js';
import {
    RemoveMemberFromGroupAction,
    RemoveMemberFromGroupResponse,
} from '../technical/actions/group/remove-member-from-group.action.js';
import {
    ChangeByModuleAccessAction,
    ChangeByModuleAccessParams,
} from '../technical/actions/user/change-by-module-access.action.js';
import { ChangeUserAction, ChangeUserParams } from '../technical/actions/user/change-user.action.js';
import { CreateUserAction, CreateUserParams } from '../technical/actions/user/create-user.action.js';
import { DeleteUserAction } from '../technical/actions/user/delete-user.action.js';
import { ExistsUserAction } from '../technical/actions/user/exists-user.action.js';
import { GetDataForUserAction } from '../technical/actions/user/get-data-user.action.js';
import { UserIdParams, UserNameParams } from '../technical/actions/user/ox-user.types.js';
import { OxSendService } from '../technical/ox.send-service.js';
import { OxGroupNameAmbiguousError } from './error/ox-group-name-ambiguous.error.js';
import { OxGroupNotFoundError } from './error/ox-group-not-found.error.js';

export type OxUserCreatedEventCreator = (
    personId: PersonID,
    username: PersonUsername,
    oxUserId: OXUserID,
    oxUserName: OXUserName,
    oxContextId: OXContextID,
    oxContextName: OXContextName,
    emailAddress: string,
) => [OxUserChangedEvent, KafkaOxUserChangedEvent];

export const generateOxUserCreatedEvent: OxUserCreatedEventCreator = (
    personId: PersonID,
    username: PersonUsername,
    oxUserId: OXUserID,
    oxUserName: OXUserName,
    oxContextId: OXContextID,
    oxContextName: OXContextName,
    emailAddress: string,
) => {
    return [
        new OxUserChangedEvent(
            personId,
            username,
            oxUserId,
            oxUserName, //strictEquals the new OxUsername
            oxContextId,
            oxContextName,
            emailAddress,
        ),
        new KafkaOxUserChangedEvent(
            personId,
            username,
            oxUserId,
            oxUserName, //strictEquals the new OxUsername
            oxContextId,
            oxContextName,
            emailAddress,
        ),
    ];
};

export type OxUserChangedEventCreator = (
    personId: PersonID,
    username: PersonUsername,
    oxUserId: OXUserID,
    oxUserName: OXUserName,
    oxContextId: OXContextID,
    oxContextName: OXContextName,
    emailAddress: string,
) => [OxUserChangedEvent, KafkaOxUserChangedEvent];

export const generateOxUserChangedEvent: OxUserChangedEventCreator = (
    personId: PersonID,
    username: PersonUsername,
    oxUserId: OXUserID,
    oxUserName: OXUserName,
    oxContextId: OXContextID,
    oxContextName: OXContextName,
    emailAddress: string,
) => {
    return [
        new OxUserChangedEvent(
            personId,
            username,
            oxUserId,
            oxUserName, //strictEquals the new OxUsername
            oxContextId,
            oxContextName,
            emailAddress,
        ),
        new KafkaOxUserChangedEvent(
            personId,
            username,
            oxUserId,
            oxUserName, //strictEquals the new OxUsername
            oxContextId,
            oxContextName,
            emailAddress,
        ),
    ];
};

export const generateDisabledOxUserChangedEvent: OxUserChangedEventCreator = (
    personId: PersonID,
    username: PersonUsername,
    oxUserId: OXUserID,
    oxUserName: OXUserName,
    oxContextId: OXContextID,
    oxContextName: OXContextName,
    emailAddress: string,
) => {
    return [
        new DisabledOxUserChangedEvent(
            personId,
            username,
            oxUserId,
            oxUserName, //strictEquals the new OxUsername
            oxContextId,
            oxContextName,
            emailAddress,
        ),
        new KafkaDisabledOxUserChangedEvent(
            personId,
            username,
            oxUserId,
            oxUserName, //strictEquals the new OxUsername
            oxContextId,
            oxContextName,
            emailAddress,
        ),
    ];
};

@Injectable()
export class OxAdapter {
    public static readonly LEHRER_OX_GROUP_NAME_PREFIX: string = 'lehrer-';

    public static readonly LEHRER_OX_GROUP_DISPLAY_NAME_PREFIX: string = 'lehrer-';

    public ENABLED: boolean;

    public readonly authUser: string;

    public readonly authPassword: string;

    public readonly contextID: OXContextID;

    public readonly contextName: OXContextName;

    public readonly userPasswordDefault: string;

    public readonly emailAddressDeletedEventDelay: number;

    public constructor(
        protected readonly logger: ClassLogger,
        protected readonly oxService: OxSendService,
        protected readonly emailRepo: EmailRepo,
        protected readonly personRepository: PersonRepository,
        protected readonly eventService: EventRoutingLegacyKafkaService,
        protected configService: ConfigService<ServerConfig>,
    ) {
        const oxConfig: OxServerConfig = configService.getOrThrow<OxServerConfig>('OX');
        this.ENABLED = oxConfig.ENABLED;
        this.authUser = oxConfig.USERNAME;
        this.authPassword = oxConfig.PASSWORD;
        this.contextID = oxConfig.CONTEXT_ID;
        this.contextName = oxConfig.CONTEXT_NAME;
        this.userPasswordDefault = oxConfig.USER_PASSWORD_DEFAULT;
        this.emailAddressDeletedEventDelay = oxConfig.EMAIL_ADDRESS_DELETED_EVENT_DELAY ?? 0;
    }

    public async getMostRecentEnabledOrRequestedEmailAddress(personId: PersonID): Promise<Option<EmailAddress<true>>> {
        const enabledEmailAddresses: Option<EmailAddress<true>[]> =
            await this.emailRepo.findByPersonSortedByUpdatedAtDesc(personId, EmailAddressStatus.ENABLED);
        if (!enabledEmailAddresses || !enabledEmailAddresses[0]) {
            this.logger.warning(`No ENABLED email-address found for personId:${personId}`);
        } else {
            this.logger.info(
                `Found mostRecentEnabled Email-Address:${JSON.stringify(enabledEmailAddresses[0].address)} for personId:${personId}`,
            );
            return enabledEmailAddresses[0];
        }

        const requestedEmailAddresses: Option<EmailAddress<true>[]> =
            await this.emailRepo.findByPersonSortedByUpdatedAtDesc(personId, EmailAddressStatus.REQUESTED);
        if (!requestedEmailAddresses || !requestedEmailAddresses[0]) {
            this.logger.error(`Neither REQUESTED nor ENABLED email-address found for personId:${personId}`);
            return undefined;
        }
        this.logger.info(
            `Found mostRecentRequested Email-Address:${JSON.stringify(requestedEmailAddresses[0].address)} for personId:${personId}`,
        );

        return requestedEmailAddresses[0];
    }

    public async createOxGroup(oxGroupName: OXGroupName, displayName: string): Promise<Result<OXGroupID>> {
        const params: CreateGroupParams = {
            contextId: this.contextID,
            name: oxGroupName,
            displayname: displayName,
            login: this.authUser,
            password: this.authPassword,
        };

        const action: CreateGroupAction = new CreateGroupAction(params);
        const result: Result<CreateGroupResponse, DomainError> = await this.oxService.send(action);

        if (!result.ok) {
            this.logger.error(`Could Not Create OxGroup with name:${oxGroupName}, displayName:${displayName}`);

            return result;
        }

        this.logger.info(
            `Successfully Created OxGroup, oxGroupId:${result.value.id}, name:${oxGroupName}, displayName:${displayName}`,
        );

        return {
            ok: true,
            value: result.value.id,
        };
    }

    public async getOxGroupByName(oxGroupName: OXGroupName): Promise<OXGroupID | DomainError> {
        const params: ListGroupsParams = {
            contextId: this.contextID,
            pattern: `${oxGroupName}`,
            login: this.authUser,
            password: this.authPassword,
        };
        const action: ListGroupsAction = new ListGroupsAction(params);
        const result: Result<ListGroupsResponse, DomainError> = await this.oxService.send(action);

        if (!result.ok) {
            this.logger.error(`Could Not Retrieve Groups For Context, contextId:${this.contextID}`);
            return result.error;
        }
        if (!result.value.groups[0] || result.value.groups.length === 0) {
            this.logger.info(`Found No Matching OxGroup For OxGroupName:${oxGroupName}`);
            return new OxGroupNotFoundError(oxGroupName);
        }
        if (result.value.groups.length > 1) {
            this.logger.error(`Found multiple OX-groups For OxGroupName:${oxGroupName}, Cannot Proceed`);
            return new OxGroupNameAmbiguousError(oxGroupName);
        }

        this.logger.info(`Found existing oxGroup for oxGroupName:${oxGroupName}`);

        return result.value.groups[0].id;
    }

    public async getExistingOxGroupByNameOrCreateOxGroup(
        oxGroupName: OXGroupName,
        displayName: string,
    ): Promise<Result<OXGroupID>> {
        const oxGroupId: OXGroupID | DomainError = await this.getOxGroupByName(oxGroupName);

        if (oxGroupId instanceof OxGroupNotFoundError) {
            const createGroupResult: Result<OXGroupID> = await this.createOxGroup(oxGroupName, displayName);

            return createGroupResult;
        }

        //return if OxGroupNameAmbiguousError or any other error
        if (oxGroupId instanceof DomainError) {
            return {
                ok: false,
                error: oxGroupId,
            };
        }

        return {
            ok: true,
            value: oxGroupId,
        };
    }

    public async getOxGroupsForOxUserId(oxUserId: OXUserID): Promise<Result<ListGroupsForUserResponse>> {
        const params: ListGroupsForUserParams = {
            contextId: this.contextID,
            userId: oxUserId,
            login: this.authUser,
            password: this.authPassword,
        };
        const action: ListGroupsForUserAction = new ListGroupsForUserAction(params);
        const result: Result<ListGroupsForUserResponse, DomainError> = await this.oxService.send(action);
        if (!result.ok) {
            this.logger.error(`Could Not Retrieve OxGroups For OxUser, oxUserId:${oxUserId}`);
        } else {
            this.logger.info(`Successfully Retrieved OxGroups For OxUser, oxUserId:${oxUserId}`);
        }
        return result;
    }

    public async removeOxUserFromOxGroup(
        oxGroupId: OXGroupID,
        oxUserId: OXUserID,
        personIdentifier: PersonIdentifier,
    ): Promise<Result<RemoveMemberFromGroupResponse>> {
        const params: GroupMemberParams = {
            contextId: this.contextID,
            groupId: oxGroupId,
            memberId: oxUserId,
            login: this.authUser,
            password: this.authPassword,
        };
        const action: RemoveMemberFromGroupAction = new RemoveMemberFromGroupAction(params);
        const result: Result<RemoveMemberFromGroupResponse, DomainError> = await this.oxService.send(action);
        if (!result.ok) {
            this.logger.errorPersonalized(
                `Could Not Remove OxUser From OxGroup, oxUserId:${oxUserId}, oxGroupId:${oxGroupId}`,
                personIdentifier,
            );
        } else {
            this.logger.infoPersonalized(
                `Successfully Removed OxUser From OxGroup, oxUserId:${oxUserId}, oxGroupId:${oxGroupId}`,
                personIdentifier,
            );
        }

        return result;
    }

    public async removeOxUserFromAllItsOxGroups(oxUserId: OXUserID, personIdentifier: PersonIdentifier): Promise<void> {
        const listGroupsForUserResponse: Result<ListGroupsForUserResponse> =
            await this.getOxGroupsForOxUserId(oxUserId);
        if (!listGroupsForUserResponse.ok) {
            return this.logger.errorPersonalized(`Retrieving OxGroups For OxUser Failed`, personIdentifier);
        }
        //Removal from Standard-Group is possible even when user is member of other OxGroups
        const oxGroups: OXGroup[] = listGroupsForUserResponse.value.groups;
        // The sent Ox-request should be awaited explicitly to avoid failures due to async execution in OX-Database (SQL-exceptions)
        for (const oxGroup of oxGroups) {
            //logging of results is done in removeOxUserFromOxGroup
            /* eslint-disable-next-line no-await-in-loop */
            await this.removeOxUserFromOxGroup(oxGroup.id, oxUserId, personIdentifier);
        }
    }

    public publishOxEmailAddressDeletedEvent(
        personId: PersonID | undefined,
        username: PersonUsername | undefined,
        oxUserId: OXUserID,
        emailAddress: string,
    ): void {
        setTimeout(() => {
            this.eventService.publish(
                new OxEmailAddressDeletedEvent(
                    personId,
                    oxUserId,
                    username,
                    emailAddress,
                    this.contextID,
                    this.contextName,
                ),
                new KafkaOxEmailAddressDeletedEvent(
                    personId,
                    oxUserId,
                    username,
                    emailAddress,
                    this.contextID,
                    this.contextName,
                ),
            );
        }, this.emailAddressDeletedEventDelay);
    }

    public publishOxUserChangedEvent2(
        oxUserCreatedEventCreator: OxUserCreatedEventCreator,
        personId: PersonID,
        username: PersonUsername,
        oxUserId: OXUserID,
        oxUserName: OXUserName,
        emailAddress: string,
    ): void {
        const events: [OxUserChangedEvent, KafkaOxUserChangedEvent] = oxUserCreatedEventCreator(
            personId,
            username,
            oxUserId,
            oxUserName,
            this.contextID,
            this.contextName,
            emailAddress,
        );
        this.eventService.publish(...events);
    }

    public createChangeUserAction(
        oxUserId: OXUserID,
        oxUserName?: string,
        aliases?: string[],
        givenname?: string,
        surname?: string,
        displayName?: string,
        defaultSenderAddress?: string,
        primaryEmail?: string,
    ): ChangeUserAction {
        //change oxUserName to avoid conflicts for future OX-createUser-requests
        const params: ChangeUserParams = {
            contextId: this.contextID,
            contextName: this.contextName,
            userId: oxUserId,
            username: oxUserName,
            aliases: aliases,

            givenname: givenname,
            surname: surname,
            displayname: displayName,
            defaultSenderAddress: defaultSenderAddress,
            email1: primaryEmail,
            primaryEmail: primaryEmail,

            login: this.authUser,
            password: this.authPassword,
        };

        const action: ChangeUserAction = new ChangeUserAction(params);
        return action;
    }

    public createGetDataForUserAction(oxUserId: OXUserID): GetDataForUserAction {
        const idParams: UserIdParams = {
            contextId: this.contextID,
            userId: oxUserId,
            login: this.authUser,
            password: this.authPassword,
        };

        const getDataAction: GetDataForUserAction = new GetDataForUserAction(idParams);
        return getDataAction;
    }

    public createDeleteUserAction(oxUserId: OXUserID): DeleteUserAction {
        const params: UserIdParams = {
            contextId: this.contextID,
            userId: oxUserId,
            login: this.authUser,
            password: this.authPassword,
        };

        const action: DeleteUserAction = new DeleteUserAction(params);
        return action;
    }

    public createAddMemberToGroupAction(oxGroupId: OXGroupID, oxUserId: OXUserID): AddMemberToGroupAction {
        const params: GroupMemberParams = {
            contextId: this.contextID,
            groupId: oxGroupId,
            memberId: oxUserId,
            login: this.authUser,
            password: this.authPassword,
        };

        const action: AddMemberToGroupAction = new AddMemberToGroupAction(params);
        return action;
    }

    public createExistsUserAction(username: PersonUsername): ExistsUserAction {
        const existsParams: UserNameParams = {
            contextId: this.contextID,
            userName: username,
            login: this.authUser,
            password: this.authPassword,
        };

        const existsAction: ExistsUserAction = new ExistsUserAction(existsParams);
        return existsAction;
    }

    public createCreateUserAction(
        displayName: string,
        username: string,
        firstname: string,
        lastname: string,
        primaryEmail: string,
    ): CreateUserAction {
        const params: CreateUserParams = {
            contextId: this.contextID,
            displayName: displayName,
            email1: primaryEmail,
            username: username,
            firstname: firstname,
            mailEnabled: true,
            lastname: lastname,
            primaryEmail: primaryEmail,
            userPassword: this.userPasswordDefault,
            login: this.authUser,
            password: this.authPassword,
        };

        const action: CreateUserAction = new CreateUserAction(params);
        return action;
    }

    public createChangeByModuleAccessAction(userId: string): ChangeByModuleAccessAction {
        //adjust user infostore and globalAddressBook
        const changeByModuleAccessParams: ChangeByModuleAccessParams = {
            contextId: this.contextID,
            userId: userId,
            globalAddressBookDisabled: true,
            infostore: false,
            login: this.authUser,
            password: this.authPassword,
        };
        const changeByModuleAccessAction: ChangeByModuleAccessAction = new ChangeByModuleAccessAction(
            changeByModuleAccessParams,
        );
        return changeByModuleAccessAction;
    }
}
