import { type KafkaEvent } from './kafka-event.js';
import { KlasseCreatedEvent } from './klasse-created.event.js';

export class KafkaKlasseCreatedEvent extends KlasseCreatedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.id;
    }
}
