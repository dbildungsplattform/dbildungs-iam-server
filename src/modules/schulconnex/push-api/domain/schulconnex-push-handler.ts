import { EntityManager } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mutex } from 'async-mutex';

import { EventHandler } from '../../../../core/eventbus/decorators/event-handler.decorator.js';
import { KafkaEventHandler } from '../../../../core/eventbus/decorators/kafka-event-handler.decorator.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { ServerConfig } from '../../../../shared/config/index.js';
import { SchulconnexConfig } from '../../../../shared/config/schulconnex.config.js';
import { DomainError } from '../../../../shared/error/domain.error.js';
import { SchulconnexPushError } from '../../../../shared/error/schulconnex-push.error.js';
import { EmailMicroserviceAddressChangedEvent } from '../../../../shared/events/email-microservice/email-microservice-address-changed.event.js';
import { KafkaEmailMicroserviceAddressChangedEvent } from '../../../../shared/events/email-microservice/kafka-email-microservice-address-changed.event.js';
import { KafkaLocksForPersonChangedEvent } from '../../../../shared/events/kafka-locks-for-person-changed.event.js';
import { KafkaPersonenkontextUpdatedEvent } from '../../../../shared/events/kafka-personenkontext-updated.event.js';
import { KafkaRollenerweiterungCreatedEvent } from '../../../../shared/events/kafka-rollenerweiterung-created.event.js';
import { KafkaRollenerweiterungDeletedEvent } from '../../../../shared/events/kafka-rollenerweiterung-deleted.event.js';
import { LocksForPersonChangedEvent } from '../../../../shared/events/locks-for-person-changed.event.js';
import { PersonenkontextEventKontextData } from '../../../../shared/events/personenkontext-event.types.js';
import { PersonenkontextUpdatedEvent } from '../../../../shared/events/personenkontext-updated.event.js';
import { RollenerweiterungCreatedEvent } from '../../../../shared/events/rollenerweiterung-created.event.js';
import { RollenerweiterungDeletedEvent } from '../../../../shared/events/rollenerweiterung-deleted.event.js';
import {
    OrganisationID,
    PersonenkontextID,
    PersonID,
    RolleID,
    ServiceProviderID,
} from '../../../../shared/types/aggregate-ids.types.js';
import { Err, Ok } from '../../../../shared/util/result.js';
import { EmailAddressStatus } from '../../../email/domain/email-address.js';
import { EmailResolverService } from '../../../email-microservice/domain/email-resolver.service.js';
import { UserLock } from '../../../keycloak-administration/domain/user-lock.js';
import { UserLockRepository } from '../../../keycloak-administration/repository/user-lock.repository.js';
import { OrganisationsTyp } from '../../../organisation/domain/organisation.enums.js';
import { PersonEmailResponse } from '../../../person/api/person-email-response.js';
import { PersonRepository } from '../../../person/persistence/person.repository.js';
import {
    DBiamPersonenkontextRepo,
    KontextWithOrgaAndRolle,
    OrganisationAndRolle,
    PersonWithPersonenkontextIds,
    RollenerweiterungGrant,
} from '../../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { Rolle } from '../../../rolle/domain/rolle.js';
import { RolleRepo } from '../../../rolle/repo/rolle.repo.js';
import { PersonenInfoData } from '../../domain/personeninfo/personeninfo-data.js';
import { SchulconnexPushAdapter } from '../adapter/domain/schulconnex-push.adapter.js';
import { SchulconnexPushRegistryRepo } from '../persistence/schulconnex-push-registry.repo.js';
import { SchulconnexPushRegistry } from './schulconnex-push-registry.js';

type EmailSource =
    | {
          type: 'event';
          email: Option<PersonEmailResponse>;
      }
    | {
          type: 'resolver';
      };

export type KeepAliveFn = () => void;

type RollenerweiterungEvent = RollenerweiterungCreatedEvent | RollenerweiterungDeletedEvent;

type RollenerweiterungChange = 'created' | 'deleted';

/** Keys of `organisationId|rolleId|serviceProviderId` granted through Rollenerweiterungen */
type RollenerweiterungGrantKeys = Set<string>;

function grantKey(organisationId: OrganisationID, rolleId: RolleID, serviceProviderId: ServiceProviderID): string {
    return `${organisationId}|${rolleId}|${serviceProviderId}`;
}

@Injectable()
export class SchulconnexPushHandler {
    private readonly personUpdateMutexes: Map<PersonID, Mutex> = new Map();

    private readonly maxBatchSize: number;

    public constructor(
        private readonly logger: ClassLogger,
        private readonly registryRepo: SchulconnexPushRegistryRepo,
        private readonly rolleRepo: RolleRepo,
        private readonly personRepo: PersonRepository,
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly userLockRepo: UserLockRepository,
        private readonly emailResolverService: EmailResolverService,
        private readonly adapter: SchulconnexPushAdapter,
        private readonly em: EntityManager,
        configService: ConfigService<ServerConfig>,
    ) {
        this.maxBatchSize = configService.getOrThrow<SchulconnexConfig>('SCHULCONNEX').PUSH_MAX_BATCH_SIZE;
    }

    @EventHandler(PersonenkontextUpdatedEvent)
    @KafkaEventHandler(KafkaPersonenkontextUpdatedEvent)
    @EnsureRequestContext((handler: SchulconnexPushHandler) => handler.em)
    public async handlePersonenkontextUpdatedEvent(
        event: PersonenkontextUpdatedEvent,
        keepAlive?: KeepAliveFn,
    ): Promise<Result<void, DomainError>> {
        const logPrefix: string = `[EventID: ${event.eventID}] ` + `Schulconnex push for person ${event.person.id}`;

        this.logger.info(`${logPrefix}: Received PersonenkontextUpdatedEvent`);

        return this.runExclusiveForPerson(
            event.person.id,
            (): Promise<Result<void, DomainError>> => this.handlePersonenkontextUpdatedEventExclusive(event, keepAlive),
        );
    }

    @KafkaEventHandler(KafkaEmailMicroserviceAddressChangedEvent)
    @EventHandler(EmailMicroserviceAddressChangedEvent)
    @EnsureRequestContext((handler: SchulconnexPushHandler) => handler.em)
    public async handleEmailAddressChanged(
        event: EmailMicroserviceAddressChangedEvent,
        keepAlive?: KeepAliveFn,
    ): Promise<Result<void, DomainError>> {
        this.logger.info(
            `[EventID: ${event.eventID}] ` +
                `Received EmailMicroserviceAddressChangedEvent for person ${event.personId}`,
        );

        const email: Option<PersonEmailResponse> = event.newPrimaryAddress
            ? {
                  address: event.newPrimaryAddress,
                  status: EmailAddressStatus.ENABLED,
              }
            : undefined;

        return this.updatePersonenkontexte(
            event.personId,
            event.eventID,
            {
                type: 'event',
                email,
            },
            keepAlive,
        );
    }

    @KafkaEventHandler(KafkaLocksForPersonChangedEvent)
    @EventHandler(LocksForPersonChangedEvent)
    @EnsureRequestContext((handler: SchulconnexPushHandler) => handler.em)
    public async handleLocksForPersonChanged(
        event: LocksForPersonChangedEvent,
        keepAlive?: KeepAliveFn,
    ): Promise<Result<void, DomainError>> {
        this.logger.info(
            `[EventID: ${event.eventID}] ` + `Received LocksForPersonChangedEvent for person ${event.personId}`,
        );

        return this.updatePersonenkontexte(
            event.personId,
            event.eventID,
            {
                type: 'resolver',
            },
            keepAlive,
        );
    }

    @KafkaEventHandler(KafkaRollenerweiterungCreatedEvent)
    @EventHandler(RollenerweiterungCreatedEvent)
    @EnsureRequestContext((handler: SchulconnexPushHandler) => handler.em)
    public async handleRollenerweiterungCreatedEvent(
        event: RollenerweiterungCreatedEvent,
        keepAlive?: KeepAliveFn,
    ): Promise<Result<void, DomainError>> {
        return this.handleRollenerweiterungEvent(event, 'created', keepAlive);
    }

    @KafkaEventHandler(KafkaRollenerweiterungDeletedEvent)
    @EventHandler(RollenerweiterungDeletedEvent)
    @EnsureRequestContext((handler: SchulconnexPushHandler) => handler.em)
    public async handleRollenerweiterungDeletedEvent(
        event: RollenerweiterungDeletedEvent,
        keepAlive?: KeepAliveFn,
    ): Promise<Result<void, DomainError>> {
        return this.handleRollenerweiterungEvent(event, 'deleted', keepAlive);
    }

    /**
     * Every person holding the rolle at the organisation (or below it) is affected. The decision what to push is
     * based on the current state, so remaining access through direct Angebotszuweisungen or other
     * Rollenerweiterungen prevents deletions and duplicate creations.
     */
    private async handleRollenerweiterungEvent(
        event: RollenerweiterungEvent,
        change: RollenerweiterungChange,
        keepAlive?: KeepAliveFn,
    ): Promise<Result<void, DomainError>> {
        const logPrefix: string =
            `[EventID: ${event.eventID}] Schulconnex push for ${event.constructor.name} ` +
            `(orga ${event.organisationId}, rolle ${event.rolleId}, sp ${event.serviceProviderId})`;

        this.logger.info(`${logPrefix}: Received event`);

        const registries: SchulconnexPushRegistry<true>[] = (await this.registryRepo.findAll()).filter(
            (registry: SchulconnexPushRegistry<true>) => registry.serviceProviderId === event.serviceProviderId,
        );

        if (registries.length === 0) {
            return Ok();
        }

        const failures: unknown[] = [];
        let afterPersonId: PersonID | undefined;
        let batch: PersonWithPersonenkontextIds[];

        do {
            // eslint-disable-next-line no-await-in-loop
            batch = await this.personenkontextRepo.findNonKlassenKontexteWithRolleInOrganisationTree(
                event.organisationId,
                event.rolleId,
                this.maxBatchSize,
                afterPersonId,
            );

            for (const affected of batch) {
                // eslint-disable-next-line no-await-in-loop
                const error: unknown = await this.pushRollenerweiterungEventForPerson(
                    event,
                    change,
                    affected,
                    registries,
                    logPrefix,
                    keepAlive,
                );

                if (error !== undefined) {
                    failures.push(error);
                }
            }

            afterPersonId = batch.at(-1)?.personId;
        } while (batch.length >= this.maxBatchSize);

        this.logger.info(`${logPrefix}: Processed event`);

        return failures.length > 0 ? Err(new SchulconnexPushError(`${logPrefix} failed`, failures)) : Ok();
    }

    /** Returns the error if pushing failed for the person, so the remaining persons can still be processed */
    private async pushRollenerweiterungEventForPerson(
        event: RollenerweiterungEvent,
        change: RollenerweiterungChange,
        affected: PersonWithPersonenkontextIds,
        registries: SchulconnexPushRegistry<true>[],
        logPrefix: string,
        keepAlive?: KeepAliveFn,
    ): Promise<unknown> {
        let error: unknown;

        try {
            const result: Result<void, DomainError> = await this.runExclusiveForPerson(
                affected.personId,
                (): Promise<Result<void, DomainError>> =>
                    change === 'created'
                        ? this.pushRollenerweiterungCreation(event, affected, registries, logPrefix, keepAlive)
                        : this.pushRollenerweiterungDeletion(event, affected, registries, logPrefix, keepAlive),
            );

            error = result.ok ? undefined : result.error;
        } catch (err: unknown) {
            error = err;
        }

        if (error !== undefined) {
            this.logger.logUnknownAsError(`${logPrefix}: Push for person ${affected.personId} failed`, error);
        }

        keepAlive?.();

        return error;
    }

    private async pushRollenerweiterungCreation(
        event: RollenerweiterungEvent,
        affected: PersonWithPersonenkontextIds,
        registries: SchulconnexPushRegistry<true>[],
        logPrefix: string,
        keepAlive?: KeepAliveFn,
    ): Promise<Result<void, DomainError>> {
        const current: KontextWithOrgaAndRolle[] =
            await this.personenkontextRepo.findByPersonAndServiceProviderWithOrgaAndRolle(
                affected.personId,
                event.serviceProviderId,
            );

        const affectedIds: Set<PersonenkontextID> = new Set(affected.personenkontextIds);
        const affectedCurrent: KontextWithOrgaAndRolle[] = current.filter((kontext: KontextWithOrgaAndRolle) =>
            affectedIds.has(kontext.personenkontext.id),
        );
        const grantedOtherwise: Set<PersonenkontextID> = await this.findKontexteGrantedWithoutRollenerweiterung(
            event,
            affectedCurrent,
        );
        const gained: KontextWithOrgaAndRolle[] = affectedCurrent.filter(
            (kontext: KontextWithOrgaAndRolle) => !grantedOtherwise.has(kontext.personenkontext.id),
        );

        if (gained.length === 0) {
            return Ok();
        }

        const hadAccessBefore: boolean = current.length > gained.length;
        const data: Result<PersonenInfoData, DomainError> = await this.loadPushData(affected.personId);

        if (!data.ok) {
            return data;
        }

        return this.pushToRegistries(
            registries,
            `${logPrefix}: person ${affected.personId}`,
            async (registry: SchulconnexPushRegistry<true>): Promise<Result<void, DomainError>> => {
                if (!hadAccessBefore) {
                    const result: Result<void, DomainError> = await this.adapter.upsertPerson(
                        registry,
                        data.value.person,
                    );
                    keepAlive?.();
                    if (!result.ok) {
                        return result;
                    }
                }

                for (const kontext of gained) {
                    // eslint-disable-next-line no-await-in-loop
                    const result: Result<void, DomainError> = await this.adapter.upsertPersonenkontext(
                        registry,
                        kontext,
                        data.value.userLocks,
                        data.value.email,
                    );
                    keepAlive?.();
                    if (!result.ok) {
                        return result;
                    }
                }

                return Ok();
            },
        );
    }

    private async pushRollenerweiterungDeletion(
        event: RollenerweiterungEvent,
        affected: PersonWithPersonenkontextIds,
        registries: SchulconnexPushRegistry<true>[],
        logPrefix: string,
        keepAlive?: KeepAliveFn,
    ): Promise<Result<void, DomainError>> {
        const current: KontextWithOrgaAndRolle[] =
            await this.personenkontextRepo.findByPersonAndServiceProviderWithOrgaAndRolle(
                affected.personId,
                event.serviceProviderId,
            );

        const currentIds: Set<PersonenkontextID> = new Set(
            current.map((kontext: KontextWithOrgaAndRolle) => kontext.personenkontext.id),
        );
        const lost: PersonenkontextID[] = affected.personenkontextIds.filter(
            (id: PersonenkontextID) => !currentIds.has(id),
        );

        if (lost.length === 0) {
            return Ok();
        }

        return this.pushToRegistries(
            registries,
            `${logPrefix}: person ${affected.personId}`,
            async (registry: SchulconnexPushRegistry<true>): Promise<Result<void, DomainError>> => {
                for (const personenkontextId of lost) {
                    // eslint-disable-next-line no-await-in-loop
                    const result: Result<void, DomainError> = await this.adapter.deletePersonenkontext(
                        registry,
                        affected.personId,
                        personenkontextId,
                    );
                    keepAlive?.();
                    if (!result.ok) {
                        return result;
                    }
                }

                if (current.length > 0) {
                    return Ok();
                }

                const result: Result<void, DomainError> = await this.adapter.deletePerson(registry, affected.personId);
                keepAlive?.();
                return result;
            },
        );
    }

    /** Kontexte that grant the event's service provider by direct assignment or by another Rollenerweiterung */
    private async findKontexteGrantedWithoutRollenerweiterung(
        event: RollenerweiterungEvent,
        kontexte: KontextWithOrgaAndRolle[],
    ): Promise<Set<PersonenkontextID>> {
        const granted: Set<PersonenkontextID> = new Set(
            kontexte
                .filter((kontext: KontextWithOrgaAndRolle) =>
                    kontext.rolle.serviceProviderIds.includes(event.serviceProviderId),
                )
                .map((kontext: KontextWithOrgaAndRolle) => kontext.personenkontext.id),
        );

        const remaining: KontextWithOrgaAndRolle[] = kontexte.filter(
            (kontext: KontextWithOrgaAndRolle) => !granted.has(kontext.personenkontext.id),
        );

        if (remaining.length === 0) {
            return granted;
        }

        const grants: RollenerweiterungGrant[] = await this.personenkontextRepo.findRollenerweiterungGrants(
            remaining.map((kontext: KontextWithOrgaAndRolle) => ({
                organisationId: kontext.personenkontext.organisationId,
                rolleId: kontext.personenkontext.rolleId,
            })),
        );
        const otherGrantKeys: RollenerweiterungGrantKeys = new Set(
            grants
                .filter(
                    (grant: RollenerweiterungGrant) =>
                        grant.serviceProviderId === event.serviceProviderId &&
                        grant.rollenerweiterungOrganisationId !== event.organisationId,
                )
                .map((grant: RollenerweiterungGrant) =>
                    grantKey(grant.organisationId, grant.rolleId, grant.serviceProviderId),
                ),
        );

        for (const kontext of remaining) {
            if (
                otherGrantKeys.has(
                    grantKey(
                        kontext.personenkontext.organisationId,
                        kontext.personenkontext.rolleId,
                        event.serviceProviderId,
                    ),
                )
            ) {
                granted.add(kontext.personenkontext.id);
            }
        }

        return granted;
    }

    private async pushToRegistries(
        registries: SchulconnexPushRegistry<true>[],
        logPrefix: string,
        push: (registry: SchulconnexPushRegistry<true>) => Promise<Result<void, DomainError>>,
    ): Promise<Result<void, DomainError>> {
        const results: PromiseSettledResult<Result<void, DomainError>>[] = await Promise.allSettled(
            registries.map(push),
        );

        const failures: unknown[] = this.collectAndLogFailures(results, registries, logPrefix);

        return failures.length > 0 ? Err(new SchulconnexPushError(`${logPrefix} failed`, failures)) : Ok();
    }

    private async handlePersonenkontextUpdatedEventExclusive(
        event: PersonenkontextUpdatedEvent,
        keepAlive?: KeepAliveFn,
    ): Promise<Result<void, DomainError>> {
        const logPrefix: string = `[EventID: ${event.eventID}] ` + `Schulconnex push for person ${event.person.id}`;

        const registries: SchulconnexPushRegistry<true>[] = await this.registryRepo.findAll();

        if (registries.length === 0) {
            return Ok();
        }

        const rolleIds: RolleID[] = [
            ...new Set(
                [...event.newKontexte, ...event.removedKontexte, ...event.currentKontexte]
                    .filter((pk: PersonenkontextEventKontextData) => pk.orgaTyp !== OrganisationsTyp.KLASSE)
                    .map((pk: PersonenkontextEventKontextData) => pk.rolleId),
            ),
        ];

        const [rollen, grantKeys]: [Map<RolleID, Rolle<true>>, RollenerweiterungGrantKeys] = await Promise.all([
            this.rolleRepo.findByIds(rolleIds),
            this.findRollenerweiterungGrantKeys(event),
        ]);

        const relevantRegistries: SchulconnexPushRegistry<true>[] = registries.filter(
            (registry: SchulconnexPushRegistry<true>) =>
                this.hasRelevantKontextForRegistry(registry, rollen, grantKeys, event),
        );

        const results: PromiseSettledResult<Result<void, DomainError>>[] = await Promise.allSettled(
            relevantRegistries.map((registry: SchulconnexPushRegistry<true>) =>
                this.pushPersonenkontextUpdatedEventToRegistry(event, registry, rollen, grantKeys, keepAlive),
            ),
        );

        const failures: unknown[] = this.collectAndLogFailures(results, relevantRegistries, logPrefix);

        return failures.length > 0 ? Err(new SchulconnexPushError(`${logPrefix} failed`, failures)) : Ok();
    }

    private async findRollenerweiterungGrantKeys(
        event: PersonenkontextUpdatedEvent,
    ): Promise<RollenerweiterungGrantKeys> {
        const query: Map<string, OrganisationAndRolle> = new Map();

        for (const pk of [...event.newKontexte, ...event.removedKontexte, ...event.currentKontexte]) {
            if (pk.orgaTyp !== OrganisationsTyp.KLASSE) {
                query.set(`${pk.orgaId}|${pk.rolleId}`, { organisationId: pk.orgaId, rolleId: pk.rolleId });
            }
        }

        const grants: RollenerweiterungGrant[] = await this.personenkontextRepo.findRollenerweiterungGrants([
            ...query.values(),
        ]);

        return new Set(
            grants.map((grant: RollenerweiterungGrant) =>
                grantKey(grant.organisationId, grant.rolleId, grant.serviceProviderId),
            ),
        );
    }

    private hasRelevantKontextForRegistry(
        registry: SchulconnexPushRegistry<true>,
        rollen: Map<RolleID, Rolle<true>>,
        grantKeys: RollenerweiterungGrantKeys,
        event: PersonenkontextUpdatedEvent,
    ): boolean {
        const filter: (pk: PersonenkontextEventKontextData) => boolean = this.createRegistryKontextFilter(
            registry,
            rollen,
            grantKeys,
        );

        return [...event.newKontexte, ...event.removedKontexte, ...event.currentKontexte].some(filter);
    }

    private collectAndLogFailures(
        results: PromiseSettledResult<Result<void, DomainError>>[],
        registries: SchulconnexPushRegistry<true>[],
        logPrefix: string,
    ): unknown[] {
        const failures: unknown[] = [];

        results.forEach((result: PromiseSettledResult<Result<void, DomainError>>, index: number): void => {
            let error: unknown;

            if (result.status === 'rejected') {
                error = result.reason;
            } else if (!result.value.ok) {
                error = result.value.error;
            } else {
                return;
            }

            failures.push(error);

            this.logger.logUnknownAsError(`${logPrefix}: Registry ${registries[index]?.id} failed`, error);
        });

        return failures;
    }

    private async pushPersonenkontextUpdatedEventToRegistry(
        event: PersonenkontextUpdatedEvent,
        registry: SchulconnexPushRegistry<true>,
        rollen: Map<RolleID, Rolle<true>>,
        grantKeys: RollenerweiterungGrantKeys,
        keepAlive?: KeepAliveFn,
    ): Promise<Result<void, DomainError>> {
        const filter: (pk: PersonenkontextEventKontextData) => boolean = this.createRegistryKontextFilter(
            registry,
            rollen,
            grantKeys,
        );

        const newKontexte: PersonenkontextEventKontextData[] = event.newKontexte.filter(filter);

        const removedKontexte: PersonenkontextEventKontextData[] = event.removedKontexte.filter(filter);

        const currentKontexte: PersonenkontextEventKontextData[] = event.currentKontexte.filter(filter);

        if (newKontexte.length === 0 && removedKontexte.length === 0) {
            return Ok();
        }

        const newIds: Set<PersonenkontextID> = new Set(newKontexte.map((pk: PersonenkontextEventKontextData) => pk.id));

        const hadRelevantKontexte: boolean = this.hadRelevantKontexteBefore(removedKontexte, currentKontexte, newIds);

        const kontexteToUpsert: PersonenkontextEventKontextData[] = hadRelevantKontexte ? newKontexte : currentKontexte;

        const creationResult: Result<void, DomainError> = await this.handleCreation(
            event,
            kontexteToUpsert,
            hadRelevantKontexte,
            registry,
            keepAlive,
        );

        if (!creationResult.ok) {
            return creationResult;
        }

        return this.handleDeletion(event, removedKontexte, currentKontexte, hadRelevantKontexte, registry, keepAlive);
    }

    private async handleDeletion(
        event: PersonenkontextUpdatedEvent,
        removedKontexte: PersonenkontextEventKontextData[],
        currentKontexte: PersonenkontextEventKontextData[],
        hadRelevantKontexte: boolean,
        registry: SchulconnexPushRegistry<true>,
        keepAlive?: KeepAliveFn,
    ): Promise<Result<void, DomainError>> {
        for (const pk of removedKontexte) {
            // eslint-disable-next-line no-await-in-loop
            const result: Result<void, DomainError> = await this.adapter.deletePersonenkontext(
                registry,
                event.person.id,
                pk.id,
            );
            keepAlive?.();
            if (!result.ok) {
                return result;
            }
        }

        if (hadRelevantKontexte && currentKontexte.length === 0) {
            const result: Result<void, DomainError> = await this.adapter.deletePerson(registry, event.person.id);
            keepAlive?.();
            return result;
        }

        return Ok();
    }

    private async handleCreation(
        event: PersonenkontextUpdatedEvent,
        kontexteToUpsert: PersonenkontextEventKontextData[],
        hadRelevantKontexte: boolean,
        registry: SchulconnexPushRegistry<true>,
        keepAlive?: KeepAliveFn,
    ): Promise<Result<void, DomainError>> {
        if (kontexteToUpsert.length === 0) {
            return Ok();
        }

        const data: Result<PersonenInfoData, DomainError> = await this.loadPushData(event.person.id);

        if (!data.ok) {
            return data;
        }

        const kontexte: KontextWithOrgaAndRolle[] = [];

        for (const pk of kontexteToUpsert) {
            const kontext: Option<KontextWithOrgaAndRolle> = data.value.kontexteWithOrgaAndRolle.find(
                (candidate: KontextWithOrgaAndRolle) => candidate.personenkontext.id === pk.id,
            );

            if (!kontext) {
                return Err(new SchulconnexPushError(`Personenkontext ${pk.id} not found`));
            }

            kontexte.push(kontext);
        }

        if (!hadRelevantKontexte) {
            const result: Result<void, DomainError> = await this.adapter.upsertPerson(registry, data.value.person);
            keepAlive?.();
            if (!result.ok) {
                return result;
            }
        }

        for (const kontext of kontexte) {
            // eslint-disable-next-line no-await-in-loop
            const result: Result<void, DomainError> = await this.adapter.upsertPersonenkontext(
                registry,
                kontext,
                data.value.userLocks,
                data.value.email,
            );
            keepAlive?.();
            if (!result.ok) {
                return result;
            }
        }

        return Ok();
    }

    private hadRelevantKontexteBefore(
        removedKontexte: PersonenkontextEventKontextData[],
        currentKontexte: PersonenkontextEventKontextData[],
        newIds: Set<PersonenkontextID>,
    ): boolean {
        return (
            removedKontexte.length > 0 ||
            currentKontexte.some((pk: PersonenkontextEventKontextData) => !newIds.has(pk.id))
        );
    }

    private createRegistryKontextFilter(
        registry: SchulconnexPushRegistry<true>,
        rollen: Map<RolleID, Rolle<true>>,
        grantKeys: RollenerweiterungGrantKeys,
    ): (pk: PersonenkontextEventKontextData) => boolean {
        return (pk: PersonenkontextEventKontextData): boolean =>
            pk.orgaTyp !== OrganisationsTyp.KLASSE &&
            (rollen.get(pk.rolleId)?.serviceProviderIds.includes(registry.serviceProviderId) === true ||
                grantKeys.has(grantKey(pk.orgaId, pk.rolleId, registry.serviceProviderId)));
    }

    private async loadPushData(personId: PersonID): Promise<Result<PersonenInfoData, DomainError>> {
        const [person, kontexteWithOrgaAndRolle, userLocks, emails]: [
            Option<PersonenInfoData['person']>,
            PersonenInfoData['kontexteWithOrgaAndRolle'],
            PersonenInfoData['userLocks'],
            Result<Map<PersonID, PersonenInfoData['email']>, DomainError>,
        ] = await Promise.all([
            this.personRepo.findById(personId),
            this.personenkontextRepo.findByPersonWithOrgaAndRolle(personId),
            this.userLockRepo.findByPersonId(personId),
            this.emailResolverService.findEmailsBySpshPersons([personId]),
        ]);

        if (!person) {
            return Err(new SchulconnexPushError(`Person ${personId} not found`));
        }

        if (!emails.ok) {
            return emails;
        }

        return Ok({
            person,
            kontexteWithOrgaAndRolle,
            userLocks,
            email: emails.value.get(personId),
        });
    }

    private async updatePersonenkontexte(
        personId: PersonID,
        eventId: string,
        emailSource: EmailSource,
        keepAlive?: KeepAliveFn,
    ): Promise<Result<void, DomainError>> {
        return this.runExclusiveForPerson(
            personId,
            (): Promise<Result<void, DomainError>> =>
                this.updatePersonenkontexteExclusive(personId, eventId, emailSource, keepAlive),
        );
    }

    private async updatePersonenkontexteExclusive(
        personId: PersonID,
        eventId: string,
        emailSource: EmailSource,
        keepAlive?: KeepAliveFn,
    ): Promise<Result<void, DomainError>> {
        // Do not fall back to the resolver for email change events: undefined indicates that the primary email was removed and must stay removed.
        const emailPromise: Promise<Option<PersonEmailResponse>> =
            emailSource.type === 'event'
                ? Promise.resolve(emailSource.email)
                : this.emailResolverService.findEmailBySpshPerson(personId);

        const [registries, userLocks, email]: [
            SchulconnexPushRegistry<true>[],
            UserLock[],
            Option<PersonEmailResponse>,
        ] = await Promise.all([this.registryRepo.findAll(), this.userLockRepo.findByPersonId(personId), emailPromise]);

        const errors: DomainError[] = [];

        for (const registry of registries) {
            const kontexte: KontextWithOrgaAndRolle[] =
                // eslint-disable-next-line no-await-in-loop
                await this.personenkontextRepo.findByPersonAndServiceProviderWithOrgaAndRolle(
                    personId,
                    registry.serviceProviderId,
                );

            for (const kontext of kontexte) {
                // eslint-disable-next-line no-await-in-loop
                const result: Result<void, DomainError> = await this.adapter.upsertPersonenkontext(
                    registry,
                    kontext,
                    userLocks,
                    email,
                );
                keepAlive?.();

                if (!result.ok) {
                    errors.push(result.error);

                    this.logger.logUnknownAsError(
                        `[EventID: ${eventId}] ` +
                            `Could not update Personenkontext ` +
                            `${kontext.personenkontext.id} ` +
                            `for person ${personId}`,
                        result.error,
                    );
                }
            }
        }

        if (errors.length > 0) {
            return Err(
                new SchulconnexPushError(`Could not update all Personenkontexte ` + `for person ${personId}`, errors),
            );
        }

        return Ok();
    }

    private async runExclusiveForPerson(
        personId: PersonID,
        operation: () => Promise<Result<void, DomainError>>,
    ): Promise<Result<void, DomainError>> {
        const mutex: Mutex = this.personUpdateMutexes.get(personId) ?? new Mutex();

        this.personUpdateMutexes.set(personId, mutex);

        try {
            return await mutex.runExclusive(operation);
        } finally {
            if (this.personUpdateMutexes.get(personId) === mutex && !mutex.isLocked()) {
                this.personUpdateMutexes.delete(personId);
            }
        }
    }
}
