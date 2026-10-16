import { type KafkaEvent } from './kafka-event.js';
import { PersonExternalSystemsSyncEvent } from './person-external-systems-sync.event.js';

export class KafkaPersonExternalSystemsSyncEvent extends PersonExternalSystemsSyncEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.personId;
    }
}
