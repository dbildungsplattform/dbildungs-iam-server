import { type KafkaEvent } from '../kafka-event.js';
import { LdapPersonEntryChangedEvent } from './ldap-person-entry-changed.event.js';

export class KafkaLdapPersonEntryChangedEvent extends LdapPersonEntryChangedEvent implements KafkaEvent {
    public get kafkaKey(): string | undefined {
        return this.personId;
    }
}
