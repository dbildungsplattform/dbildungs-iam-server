import { BaseEvent } from '../base-event.js';
import { type EmailAddressID, type PersonID, type PersonUsername } from '../../types/aggregate-ids.types.js';

/**
 * This event should be triggered when a new email-address is generated for a user and persisted successfully in the database.
 * It is used for synchronization of email-address generation and the process of requesting user-creation in OX afterward.
 * It should NOT be triggered by any OX-related operation.
 */
export class EmailAddressGeneratedEvent extends BaseEvent {
    public constructor(
        public readonly personId: PersonID,
        public readonly username: PersonUsername,
        public readonly emailAddressId: EmailAddressID,
        public readonly address: string,
        public readonly enabled: boolean,
        public readonly orgaKennung: string,
        public readonly alternativeAddress?: string,
    ) {
        super();
    }
}
