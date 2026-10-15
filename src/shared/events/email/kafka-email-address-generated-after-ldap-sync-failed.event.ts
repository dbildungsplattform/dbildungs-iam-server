import { type KafkaEvent } from '../kafka-event.js';
import { EmailAddressGeneratedAfterLdapSyncFailedEvent } from './email-address-generated-after-ldap-sync-failed.event.js';

export class KafkaEmailAddressGeneratedAfterLdapSyncFailedEvent
    extends EmailAddressGeneratedAfterLdapSyncFailedEvent
    implements KafkaEvent
{
    public get kafkaKey(): string {
        return this.personId;
    }
}
