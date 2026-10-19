import { EmailAddressGeneratedEvent } from './email-address-generated.event.js';
import { type KafkaEvent } from '../kafka-event.js';

export class KafkaEmailAddressGeneratedEvent extends EmailAddressGeneratedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.personId;
    }
}
