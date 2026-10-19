import { type KafkaEvent } from './kafka-event.js';
import { PersonLdapSyncEvent } from './person-ldap-sync.event.js';

/**
 * Used for triggering syncing information about a person from SPSH to LDAP explicitly
 * and avoid communication and syncing to other systems like publishing an instance of
 * PersonExternalSystemsSyncEvent would do.
 */
export class KafkaPersonLdapSyncEvent extends PersonLdapSyncEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.personId;
    }
}
