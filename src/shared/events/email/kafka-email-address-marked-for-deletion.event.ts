import { type KafkaEvent } from '../kafka-event.js';
import { EmailAddressMarkedForDeletionEvent } from './email-address-marked-for-deletion.event.js';

export class KafkaEmailAddressMarkedForDeletionEvent extends EmailAddressMarkedForDeletionEvent implements KafkaEvent {
    public get kafkaKey(): string | undefined {
        return this.personId;
    }
}
