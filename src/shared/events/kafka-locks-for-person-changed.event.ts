import { KafkaEvent } from './kafka-event.js';
import { LocksForPersonChangedEvent } from './locks-for-person-changed.event.js';

export class KafkaLocksForPersonChangedEvent extends LocksForPersonChangedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.personId;
    }
}