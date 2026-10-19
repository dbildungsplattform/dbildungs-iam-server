import { type KafkaEvent } from '../kafka-event.js';
import { LdapSyncCompletedEvent } from './ldap-sync-completed.event.js';

export class KafkaLdapSyncCompletedEvent extends LdapSyncCompletedEvent implements KafkaEvent {
    public get kafkaKey(): string | undefined {
        return this.personId;
    }
}
