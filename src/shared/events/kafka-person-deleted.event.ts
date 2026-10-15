import { type KafkaEvent } from './kafka-event.js';
import { PersonDeletedEvent } from './person-deleted.event.js';

export class KafkaPersonDeletedEvent extends PersonDeletedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.personId;
    }
}
