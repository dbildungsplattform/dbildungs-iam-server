import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KafkaEvent } from '../../../shared/events/kafka-event.js';
import { ClassLogger } from '../../logging/class-logger.js';
import { EventService } from './event.service.js';
import { KafkaEventService } from './kafka-event.service.js';
import { BaseEvent } from '../../../shared/events/index.js';
import { ServerConfig } from '../../../shared/config/server.config.js';
import { KafkaConfig } from '../../../shared/config/kafka.config.js';
import { EventOutboxService } from '../outbox/event-outbox.service.js';

export type LegacyKafkaEventPair = {
    legacyEvent: BaseEvent;
    kafkaEvent: KafkaEvent;
};

export type PersistedWithEvents<T> = {
    result: T;
    events: LegacyKafkaEventPair[];
};

@Injectable()
export class EventRoutingLegacyKafkaService {
    private readonly kafkaEnabled: boolean;

    public constructor(
        private readonly logger: ClassLogger,
        private readonly eventService: EventService,
        private readonly kafkaEventService: KafkaEventService,
        private readonly eventOutboxService: EventOutboxService,
        private readonly em: EntityManager,
        configService: ConfigService<ServerConfig>,
    ) {
        this.kafkaEnabled = configService.getOrThrow<KafkaConfig>('KAFKA').ENABLED;
    }

    /**
     * Runs the state change and emits the resulting events.
     * With Kafka enabled, events are written to the outbox in the same transaction as the change.
     * Without Kafka, legacy events are published in-process after the change has been persisted.
     * The callback returns only the events for changes that actually happened.
     */
    public async persistAndPublish<T>(persist: () => Promise<PersistedWithEvents<T>>): Promise<T> {
        if (!this.kafkaEnabled) {
            const outcome: PersistedWithEvents<T> = await persist();
            for (const pair of outcome.events) {
                this.publish(pair.legacyEvent);
            }
            return outcome.result;
        }

        const outcome: PersistedWithEvents<T> = await this.em.transactional(async () => {
            const persisted: PersistedWithEvents<T> = await persist();
            await this.eventOutboxService.enqueueAll(
                persisted.events.map((pair: LegacyKafkaEventPair) => pair.kafkaEvent),
            );
            return persisted;
        });
        return outcome.result;
    }

    public publish(legacyEvent: BaseEvent, kafkaEvent?: KafkaEvent): void {
        const legacyEventName: string = legacyEvent.constructor.name;
        const kafkaEventName: string | undefined = kafkaEvent?.constructor.name;

        if (this.kafkaEnabled && kafkaEvent) {
            this.logger.debug(`Publishing '${kafkaEventName}' to Kafka`);
            this.kafkaEventService
                .publish(kafkaEvent)
                .then(() => this.logger.debug(`Successfully published kafka Event`))
                .catch((err: unknown) => this.logger.logUnknownAsError(`Failed publishing kafka event`, err));
        } else {
            this.logger.debug(`Publishing '${legacyEventName}' to legacy event service`);
            this.eventService.publish(legacyEvent);
        }
    }
}
