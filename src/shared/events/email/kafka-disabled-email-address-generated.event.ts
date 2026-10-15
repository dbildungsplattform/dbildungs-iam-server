import { type KafkaEvent } from '../kafka-event.js';
import { DisabledEmailAddressGeneratedEvent } from './disabled-email-address-generated.event.js';

/**
 * This event should be triggered when a new email-address is generated for a user, DIRECTLY DISABLED and persisted successfully in the database.
 * It is used for synchronization of email-address generation when a user needs a new email-address
 * e.g. as result of renaming the user but the user also only owns DISABLED email-addresses.
 * It should not be triggered by any OX-related operation.
 */
export class KafkaDisabledEmailAddressGeneratedEvent extends DisabledEmailAddressGeneratedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.personId;
    }
}
