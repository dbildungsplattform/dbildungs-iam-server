import { BaseEvent } from './base-event.js';
import { type PersonID } from '../types/index.js';

/**
 * Used for triggering syncing information about a person from SPSH to LDAP explicitly
 * and avoid communication and syncing to other systems like publishing an instance of
 * PersonExternalSystemsSyncEvent would do.
 */
export class PersonLdapSyncEvent extends BaseEvent {
    public constructor(public readonly personId: PersonID) {
        super();
    }
}
