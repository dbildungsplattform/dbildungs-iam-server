import { type KafkaEvent } from '../kafka-event.js';
import { EmailAddressDeletedInDatabaseEvent } from './email-address-deleted-in-database.event.js';

export class KafkaEmailAddressDeletedInDatabaseEvent extends EmailAddressDeletedInDatabaseEvent implements KafkaEvent {
    public get kafkaKey(): string | undefined {
        return this.personId;
    }
}
