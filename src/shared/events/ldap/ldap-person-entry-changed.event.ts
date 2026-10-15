import { BaseEvent } from '../base-event.js';
import { type PersonID, type PersonUsername } from '../../types/aggregate-ids.types.js';

export class LdapPersonEntryChangedEvent extends BaseEvent {
    public constructor(
        public readonly personId: PersonID | undefined,
        public readonly username: PersonUsername,
        public readonly mailPrimaryAddress?: string,
        public readonly mailAlternativeAddress?: string,
        public readonly userPasswordChanged?: boolean,
    ) {
        super();
    }
}
