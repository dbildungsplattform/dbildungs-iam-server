import { type KafkaEvent } from './kafka-event.js';
import { SchuleCreatedEvent } from './schule-created.event.js';

export class KafkaSchuleCreatedEvent extends SchuleCreatedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.organisationId;
    }
}
