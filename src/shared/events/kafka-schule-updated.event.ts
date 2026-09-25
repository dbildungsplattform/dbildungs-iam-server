import { KafkaEvent } from './kafka-event.js';
import { SchuleUpdatedEvent } from './schule-updated.event.js';

export class KafkaSchuleUpdatedEvent extends SchuleUpdatedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.organisationId;
    }
}