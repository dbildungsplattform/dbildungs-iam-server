import { type KafkaEvent } from './kafka-event.js';
import { KlasseUpdatedEvent } from './klasse-updated.event.js';

export class KafkaKlasseUpdatedEvent extends KlasseUpdatedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.organisationId;
    }
}
