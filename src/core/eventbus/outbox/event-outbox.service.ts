import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { type KafkaEvent } from '../../../shared/events/kafka-event.js';
import { getKafkaEventKeyForEvent } from '../types/kafka-event-mapping.js';
import { EventOutboxEntity } from './event-outbox.entity.js';

@Injectable()
export class EventOutboxService {
    public constructor(private readonly em: EntityManager) {}

    // Must be called inside the transaction that persists the state change, so both commit or roll back together.
    public async enqueueAll(events: KafkaEvent[]): Promise<void> {
        for (const event of events) {
            const eventKey: string | undefined = getKafkaEventKeyForEvent(event);
            if (!eventKey) {
                throw new Error(`No Kafka mapping found for event: ${event.constructor.name}`);
            }

            this.em.persist(
                this.em.create(EventOutboxEntity, {
                    eventKey,
                    kafkaKey: event.kafkaKey ?? null,
                    payload: JSON.stringify(event),
                    createdAt: new Date(),
                    publishedAt: null,
                    attempts: 0,
                    lastError: null,
                }),
            );
        }
        await this.em.flush();
    }
}
