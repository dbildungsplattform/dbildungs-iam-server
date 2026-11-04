/* eslint-disable no-await-in-loop */
import { EntityManager } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mutex } from 'async-mutex';

import { EventHandler } from '../../../core/eventbus/decorators/event-handler.decorator.js';
import { KafkaEventHandler } from '../../../core/eventbus/decorators/kafka-event-handler.decorator.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { ItsLearningConfig, ServerConfig } from '../../../shared/config/index.js';
import { KafkaRollenerweiterungCreatedEvent } from '../../../shared/events/kafka-rollenerweiterung-created.event.js';
import { KafkaRollenerweiterungDeletedEvent } from '../../../shared/events/kafka-rollenerweiterung-deleted.event.js';
import { PersonExternalSystemsSyncEvent } from '../../../shared/events/person-external-systems-sync.event.js';
import { RollenerweiterungCreatedEvent } from '../../../shared/events/rollenerweiterung-created.event.js';
import { RollenerweiterungDeletedEvent } from '../../../shared/events/rollenerweiterung-deleted.event.js';
import { PersonID } from '../../../shared/types/aggregate-ids.types.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { ServiceProviderSystem } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { ItsLearningSyncEventHandler } from './itslearning-sync.event-handler.js';

/**
 * Reacts to school-specific Rollenerweiterungen for itslearning. A Rollenerweiterung on a school also covers
 * the classes below it, so every person holding the rolle in that subtree is re-synchronised with the sync
 * handler. The sync handler decides per person whether itslearning access is granted or removed.
 */
@Injectable()
export class ItsLearningRollenerweiterungEventHandler {
    public ENABLED: boolean;

    private readonly MAX_BATCH_SIZE: number;

    // Only one fan-out per pod at a time, so many simultaneous Rollenerweiterungen do not overload itslearning
    private readonly syncMutex: Mutex = new Mutex();

    public constructor(
        private readonly logger: ClassLogger,

        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly serviceProviderRepo: ServiceProviderRepo,
        private readonly syncEventHandler: ItsLearningSyncEventHandler,
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

    @KafkaEventHandler(KafkaRollenerweiterungCreatedEvent)
    @EventHandler(RollenerweiterungCreatedEvent)
    @EnsureRequestContext()
    public async rollenerweiterungCreatedEventHandler(
        event: RollenerweiterungCreatedEvent,
        keepAlive: () => void,
    ): Promise<void> {
        await this.syncAffectedPersons(event, keepAlive);
    }

    @KafkaEventHandler(KafkaRollenerweiterungDeletedEvent)
    @EventHandler(RollenerweiterungDeletedEvent)
    @EnsureRequestContext()
    public async rollenerweiterungDeletedEventHandler(
        event: RollenerweiterungDeletedEvent,
        keepAlive: () => void,
    ): Promise<void> {
        await this.syncAffectedPersons(event, keepAlive);
    }

    private async syncAffectedPersons(
        event: RollenerweiterungCreatedEvent | RollenerweiterungDeletedEvent,
        keepAlive: () => void,
    ): Promise<void> {
        const eventName: string = event.constructor.name;
        this.logger.info(
            `[EventID: ${event.eventID}] Received ${eventName}, orga ${event.organisationId}, rolle ${event.rolleId}, sp ${event.serviceProviderId}`,
        );

        if (!this.ENABLED) {
            return this.logger.info(`[EventID: ${event.eventID}] Not enabled, ignoring event.`);
        }

        const serviceProvider: Option<ServiceProvider<true>> = await this.serviceProviderRepo.findById(
            event.serviceProviderId,
        );
        if (serviceProvider?.externalSystem !== ServiceProviderSystem.ITSLEARNING) {
            return this.logger.info(
                `[EventID: ${event.eventID}] Service provider ${event.serviceProviderId} is not itslearning, ignoring event.`,
            );
        }

        await this.syncMutex.runExclusive(async () => {
            let afterPersonId: PersonID | undefined;
            let personIds: PersonID[];
            do {
                personIds = await this.personenkontextRepo.findPersonIdsWithRolleInOrganisationSubtree(
                    event.organisationId,
                    event.rolleId,
                    this.MAX_BATCH_SIZE,
                    afterPersonId,
                );

                for (const personId of personIds) {
                    try {
                        await this.syncEventHandler.personExternalSystemSyncEventHandler(
                            new PersonExternalSystemsSyncEvent(personId),
                        );
                    } catch (err: unknown) {
                        this.logger.error(
                            `[EventID: ${event.eventID}] Sync of person ${personId} failed: ${err instanceof Error ? err.message : String(err)}`,
                        );
                    }
                    keepAlive();
                }

                afterPersonId = personIds.at(-1);
            } while (personIds.length > 0 && personIds.length >= this.MAX_BATCH_SIZE);
        });

        this.logger.info(`[EventID: ${event.eventID}] ${eventName} processed.`);
    }
}
