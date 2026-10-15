import { BaseEvent } from '../base-event.js';
import { type PersonID, type PersonUsername } from '../../types/aggregate-ids.types.js';

export class LdapSyncCompletedEvent extends BaseEvent {
    public constructor(
        public readonly personId: PersonID,
        public readonly username: PersonUsername,
    ) {
        super();
    }
}
