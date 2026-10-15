import { type KafkaEvent } from '../kafka-event.js';
import { OxSyncUserCreatedEvent } from './ox-sync-user-created.event.js';

/**
 * This event should be triggered when a new email-address is added to OX-account for a user
 * as result of renaming when user only has disabled email-addresses.
 */
export class KafkaOxSyncUserCreatedEvent extends OxSyncUserCreatedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.personId;
    }
}
