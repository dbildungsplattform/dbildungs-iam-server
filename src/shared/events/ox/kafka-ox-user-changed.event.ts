import { type KafkaEvent } from '../kafka-event.js';
import { OxUserChangedEvent } from './ox-user-changed.event.js';

export class KafkaOxUserChangedEvent extends OxUserChangedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.personId;
    }
}
