import { type EmailAddressID, type PersonID, type PersonUsername } from '../../types/aggregate-ids.types.js';
import { BaseEvent } from '../base-event.js';

/**
 * This event should be triggered when a new email-address is generated for a user, DIRECTLY DISABLED and persisted successfully in the database.
 * It is used for synchronization of email-address generation when a user needs a new email-address
 * e.g. as result of renaming the user but the user also only owns DISABLED email-addresses.
 * It should not be triggered by any OX-related operation.
 */
export class DisabledEmailAddressGeneratedEvent extends BaseEvent {
    public constructor(
        public readonly personId: PersonID,
        public readonly username: PersonUsername,
        public readonly emailAddressId: EmailAddressID,
        public readonly address: string,
        public readonly domain: string,
    ) {
        super();
    }
}
