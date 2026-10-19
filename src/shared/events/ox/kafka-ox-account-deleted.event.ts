import { type KafkaEvent } from '../kafka-event.js';
import { OxAccountDeletedEvent } from './ox-account-deleted.event.js';

export class KafkaOxAccountDeletedEvent extends OxAccountDeletedEvent implements KafkaEvent {
    public get kafkaKey(): string | undefined {
        return this.personId;
    }
}
