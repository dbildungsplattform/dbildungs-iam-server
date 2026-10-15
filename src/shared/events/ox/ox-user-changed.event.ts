import { BaseEvent } from '../base-event.js';
import { type OXContextID, type OXContextName, type OXUserID, type OXUserName } from '../../types/ox-ids.types.js';
import { type PersonUsername } from '../../types/aggregate-ids.types.js';

export class OxUserChangedEvent extends BaseEvent {
    public constructor(
        public readonly personId: string,
        public readonly keycloakUsername: PersonUsername,
        public readonly oxUserId: OXUserID,
        public readonly oxUserName: OXUserName,
        public readonly oxContextId: OXContextID,
        public readonly oxContextName: OXContextName,
        public readonly primaryEmail: string,
    ) {
        super();
    }
}
