import { EntityManager } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { difference } from 'lodash-es';
import { EventHandler } from '../../../core/eventbus/decorators/event-handler.decorator.js';
import { KafkaEventHandler } from '../../../core/eventbus/decorators/kafka-event-handler.decorator.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { ItsLearningConfig, ServerConfig } from '../../../shared/config/index.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { KafkaRolleUpdatedEvent } from '../../../shared/events/kafka-rolle-updated.event.js';
import { RolleUpdatedEvent } from '../../../shared/events/rolle-updated.event.js';
import { PersonID, RolleID, ServiceProviderID } from '../../../shared/types/index.js';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { EmailAddressStatus } from '../../email/domain/email-address.js';
import { PersonEmailResponse } from '../../person/api/person-email-response.js';
import { Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { ServiceProviderSystem } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { ItslearningMembershipAdapter } from '../adapter/domain/itslearning-membership.adapter.js';
import { ItslearningPersonAdapter } from '../adapter/domain/itslearning-person.adapter.js';
import { rollenartToIMSESInstitutionRole, rollenartToIMSESRole } from '../adapter/domain/role-utils.js';
import { IMSESInstitutionRoleType, IMSESRoleType } from '../adapter/domain/role.enum.js';
import { FailureStatusInfo, MassResult } from '../adapter/technical/actions/base-mass-action.js';
import { CreateMembershipParams } from '../adapter/technical/actions/create-memberships.action.js';
import { CreatePersonParams } from '../adapter/technical/actions/create-person.action.js';
import { StatusInfoHelpers } from '../adapter/technical/utils/status-info.utils.js';

type FailedRequests<T> = (readonly [failureDescription: string, T])[];

@Injectable()
export class ItsLearningRolleEventHandler {
    public ENABLED: boolean;

    private MAX_BATCH_SIZE: number;

    public constructor(
        private readonly logger: ClassLogger,

        private readonly itslearningPersonAdapter: ItslearningPersonAdapter,
        private readonly itslearningMembershipAdapter: ItslearningMembershipAdapter,

        private readonly personRepo: PersonRepository,
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly serviceproviderRepo: ServiceProviderRepo,
        private readonly emailResolverService: EmailResolverService,
        configService: ConfigService<ServerConfig>,

        // @ts-expect-error used by EnsureRequestContext decorator
        // Although not accessed directly, MikroORM's @EnsureRequestContext() uses this.em internally
        // to create the request-bound EntityManager context. Removing it would break context creation.
        private readonly em: EntityManager,
    ) {
        const itsLearningConfig: ItsLearningConfig = configService.getOrThrow<ItsLearningConfig>('ITSLEARNING');

        this.ENABLED = itsLearningConfig.ENABLED;
        this.MAX_BATCH_SIZE = itsLearningConfig.MAX_BATCH_SIZE;
    }

    @KafkaEventHandler(KafkaRolleUpdatedEvent)
    @EventHandler(RolleUpdatedEvent)
    @EnsureRequestContext()
    public async rolleUpdatedEventHandler(event: RolleUpdatedEvent, keepAlive: () => void): Promise<void> {
        this.logger.info(`[EventID: ${event.eventID}] Received RolleUpdatedEvent, ${event.id} (${event.name})`);

        if (!this.ENABLED) {
            return this.logger.info(`[EventID: ${event.eventID}] Not enabled, ignoring event.`);
        }

        const [itslearningAdded, itslearningRemoved]: [boolean, boolean] = await this.newItslearningStatus(
            event.oldServiceProviderIds,
            event.serviceProviderIds,
        );

        // If itslearning status did not change during the event, ignore it
        if (itslearningAdded === itslearningRemoved) {
            return this.logger.info(
                `[EventID: ${event.eventID}] Itslearning status did not change during RoleUpdatedEvent, ignoring.`,
            );
        }

        if (itslearningAdded) {
            // Create persons
            const failedPersons: FailedRequests<Person<true>> = await this.batchPersonCreate(
                event.id,
                rollenartToIMSESInstitutionRole(event.rollenArt),
                event.eventID,
                keepAlive,
            );

            for (const [reason, person] of failedPersons) {
                this.logger.error(
                    `[EventID: ${event.eventID}] Creation of person ${person.username} failed with the following reason: ${reason}`,
                );
            }

            // Add memberships
            const failedMemberships: FailedRequests<Personenkontext<true>> = await this.batchMembershipsCreate(
                event.id,
                rollenartToIMSESRole(event.rollenArt),
                event.eventID,
                keepAlive,
            );

            for (const [reason, pk] of failedMemberships) {
                this.logger.error(
                    `[EventID: ${event.eventID}] Could not give Rolle to person ${pk.personId} at orga ${pk.organisationId}, failed with the following reason: ${reason}`,
                );
            }
        }

        if (itslearningRemoved) {
            // Delete memberships
            const failedMemberships: FailedRequests<Personenkontext<true>> = await this.batchMembershipsDelete(
                event.id,
                event.eventID,
                keepAlive,
            );

            for (const [reason, pk] of failedMemberships) {
                this.logger.error(
                    `[EventID: ${event.eventID}] Could not remove Rolle from person ${pk.personId} at orga ${pk.organisationId}, failed with the following reason: ${reason}`,
                );
            }

            // Delete persons
            const failedPersons: FailedRequests<Person<true>> = await this.batchPersonDelete(
                event.id,
                event.eventID,
                keepAlive,
            );

            for (const [reason, person] of failedPersons) {
                this.logger.error(
                    `[EventID: ${event.eventID}] Deletion of person ${person.username} failed with the following reason: ${reason}`,
                );
            }
        }
    }

    private async newItslearningStatus(
        oldSpIds: ServiceProviderID[],
        newSpIds: ServiceProviderID[],
    ): Promise<[added: boolean, removed: boolean]> {
        // ServiceProviders that were added
        const addedServiceProviderIDs: ServiceProviderID[] = difference(newSpIds, oldSpIds);

        // ServiceProviders that were removed
        const removedServiceProviderIDs: ServiceProviderID[] = difference(oldSpIds, newSpIds);

        const serviceProviders: Map<
            ServiceProviderID,
            ServiceProvider<true>
        > = await this.serviceproviderRepo.findByIds(addedServiceProviderIDs.concat(removedServiceProviderIDs));

        // Function to determine if a serviceprovider is itslearning by its ID
        const spIsItslearning = (id: ServiceProviderID): boolean =>
            serviceProviders.get(id)?.externalSystem === ServiceProviderSystem.ITSLEARNING;

        const added: boolean = addedServiceProviderIDs.some(spIsItslearning);
        const removed: boolean = removedServiceProviderIDs.some(spIsItslearning);

        return [added, removed];
    }

    private async batchPersonCreate(
        rolleId: RolleID,
        institutionRole: IMSESInstitutionRoleType,
        syncId: string,
        keepAlive: () => void,
    ): Promise<FailedRequests<Person<true>>> {
        const failedPersons: FailedRequests<Person<true>> = [];

        let personCursor: string | undefined;
        do {
            let personen: Person<true>[];

            // Await allowed, because we want batching behaviour
            // eslint-disable-next-line no-await-in-loop
            [personen, personCursor] = await this.personRepo.findWithRolleAndNoOtherItslearningKontexteByCursor(
                rolleId,
                this.MAX_BATCH_SIZE,
                personCursor,
            );

            this.logger.info(`[EventID: ${syncId}] Sending ${personen.length} Personen to itslearning.`);

            const emailsForPersons: Result<
                Map<PersonID, PersonEmailResponse | undefined>,
                DomainError
                // eslint-disable-next-line no-await-in-loop
            > = await this.emailResolverService.findEmailsBySpshPersons(personen.map((p: Person<true>) => p.id));

            const createParams: CreatePersonParams[] = personen.map((p: Person<true>) => {
                const emailResp: PersonEmailResponse | undefined = emailsForPersons.ok
                    ? emailsForPersons.value.get(p.id)
                    : undefined;
                return {
                    id: p.id,
                    firstName: p.vorname,
                    lastName: p.familienname,
                    username: p.username!,
                    institutionRoleType: institutionRole,
                    email: emailResp?.status === EmailAddressStatus.ENABLED ? emailResp.address : undefined,
                };
            });

            const createResult: Result<MassResult<void>, DomainError> =
                // eslint-disable-next-line no-await-in-loop
                await this.itslearningPersonAdapter.createOrUpdatePersons(createParams, syncId);

            if (!createResult.ok) {
                // The network request failed (with retries), nothing we can do. Mark all these persons as failed.
                failedPersons.push(...personen.map((p: Person<true>) => [createResult.error.message, p] as const));
            } else {
                // Find all persons which could not be created
                const fails: [FailureStatusInfo, Person<true>][] = StatusInfoHelpers.zipFailed(
                    createResult.value.status,
                    personen,
                );
                failedPersons.push(
                    ...fails.map(
                        ([status, person]: [FailureStatusInfo, Person<true>]) =>
                            [status.description.text, person] as const,
                    ),
                );
            }

            keepAlive();
        } while (personCursor);

        return failedPersons;
    }

    private async batchPersonDelete(
        rolleId: RolleID,
        syncId: string,
        keepAlive: () => void,
    ): Promise<FailedRequests<Person<true>>> {
        const failedPersons: FailedRequests<Person<true>> = [];

        let personCursor: string | undefined;
        do {
            let personen: Person<true>[];

            // Await allowed, because we want batching behaviour
            // eslint-disable-next-line no-await-in-loop
            [personen, personCursor] = await this.personRepo.findWithRolleAndNoOtherItslearningKontexteByCursor(
                rolleId,
                this.MAX_BATCH_SIZE,
                personCursor,
            );

            this.logger.info(`[EventID: ${syncId}] Deleting ${personen.length} Personen from itslearning.`);

            const deleteResult: Result<MassResult<void>, DomainError> =
                // eslint-disable-next-line no-await-in-loop
                await this.itslearningPersonAdapter.deletePersons(
                    personen.map((p: Person<true>) => p.id),
                    syncId,
                );

            if (!deleteResult.ok) {
                // The network request failed (with retries), nothing we can do. Mark all these persons as failed.
                failedPersons.push(...personen.map((p: Person<true>) => [deleteResult.error.message, p] as const));
            } else {
                // Find all persons which could not be created
                const fails: [FailureStatusInfo, Person<true>][] = StatusInfoHelpers.zipFailed(
                    deleteResult.value.status,
                    personen,
                );
                failedPersons.push(
                    ...fails.map(
                        ([status, person]: [FailureStatusInfo, Person<true>]) =>
                            [status.description.text, person] as const,
                    ),
                );
            }

            keepAlive();
        } while (personCursor);

        return failedPersons;
    }

    private async batchMembershipsCreate(
        rolleId: RolleID,
        rollenart: IMSESRoleType,
        syncId: string,
        keepAlive: () => void,
    ): Promise<FailedRequests<Personenkontext<true>>> {
        const failedMemberships: FailedRequests<Personenkontext<true>> = [];

        let personenkontextCursor: string | undefined;
        do {
            let personenkontexte: Personenkontext<true>[];

            [personenkontexte, personenkontextCursor] =
                // Await allowed, because we want batching behaviour
                // eslint-disable-next-line no-await-in-loop
                await this.personenkontextRepo.findWithRolleAtItslearningOrgaByCursor(
                    rolleId,
                    this.MAX_BATCH_SIZE,
                    personenkontextCursor,
                );

            this.logger.info(
                `[EventID: ${syncId}] Sending ${personenkontexte.length} Personenkontexte to itslearning.`,
            );

            const createParams: CreateMembershipParams[] = personenkontexte.map((pk: Personenkontext<true>) => ({
                id: `membership-${pk.personId}-${pk.organisationId}`,
                groupId: pk.organisationId,
                personId: pk.personId,
                roleType: rollenart,
            }));

            const createResult: Result<MassResult<void>, DomainError> =
                // eslint-disable-next-line no-await-in-loop
                await this.itslearningMembershipAdapter.createMembershipsMass(createParams, syncId);

            if (!createResult.ok) {
                // The network request failed (with retries), nothing we can do. Mark all these memberships as failed.
                failedMemberships.push(
                    ...personenkontexte.map((pk: Personenkontext<true>) => [createResult.error.message, pk] as const),
                );
            } else {
                // Find all memberships which could not be created
                const fails: [FailureStatusInfo, Personenkontext<true>][] = StatusInfoHelpers.zipFailed(
                    createResult.value.status,
                    personenkontexte,
                );
                failedMemberships.push(
                    ...fails.map(
                        ([status, pk]: [FailureStatusInfo, Personenkontext<true>]) =>
                            [status.description.text, pk] as const,
                    ),
                );
            }

            keepAlive();
        } while (personenkontextCursor);

        return failedMemberships;
    }

    private async batchMembershipsDelete(
        rolleId: RolleID,
        syncId: string,
        keepAlive: () => void,
    ): Promise<FailedRequests<Personenkontext<true>>> {
        const failedMemberships: FailedRequests<Personenkontext<true>> = [];

        let personenkontextCursor: string | undefined;
        do {
            let personenkontexte: Personenkontext<true>[];

            [personenkontexte, personenkontextCursor] =
                // Await allowed, because we want batching behaviour
                // eslint-disable-next-line no-await-in-loop
                await this.personenkontextRepo.findWithRolleAtItslearningOrgaByCursor(
                    rolleId,
                    this.MAX_BATCH_SIZE,
                    personenkontextCursor,
                );

            this.logger.info(
                `[EventID: ${syncId}] Deleting ${personenkontexte.length} Personenkontexte from itslearning.`,
            );

            const removeResult: Result<MassResult<void>, DomainError> =
                // eslint-disable-next-line no-await-in-loop
                await this.itslearningMembershipAdapter.removeMembershipsMass(
                    personenkontexte.map(
                        (pk: Personenkontext<true>) => `membership-${pk.personId}-${pk.organisationId}`,
                    ),
                    syncId,
                );

            if (!removeResult.ok) {
                // The network request failed (with retries), nothing we can do. Mark all these memberships as failed.
                failedMemberships.push(
                    ...personenkontexte.map((pk: Personenkontext<true>) => [removeResult.error.message, pk] as const),
                );
            } else {
                // Find all memberships which could not be removed
                const fails: [FailureStatusInfo, Personenkontext<true>][] = StatusInfoHelpers.zipFailed(
                    removeResult.value.status,
                    personenkontexte,
                );
                failedMemberships.push(
                    ...fails.map(
                        ([status, pk]: [FailureStatusInfo, Personenkontext<true>]) =>
                            [status.description.text, pk] as const,
                    ),
                );
            }

            keepAlive();
        } while (personenkontextCursor);

        return failedMemberships;
    }
}
