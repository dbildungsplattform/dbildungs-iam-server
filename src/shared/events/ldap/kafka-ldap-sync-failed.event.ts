import { type KafkaEvent } from '../kafka-event.js';
import { LdapSyncFailedEvent } from './ldap-sync-failed.event.js';

export class KafkaLdapSyncFailedEvent extends LdapSyncFailedEvent implements KafkaEvent {
    public get kafkaKey(): string | undefined {
        return this.personId;
    }
}
