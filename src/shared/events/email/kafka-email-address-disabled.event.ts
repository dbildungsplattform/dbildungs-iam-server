import { type KafkaEvent } from '../kafka-event.js';
import { EmailAddressDisabledEvent } from './email-address-disabled.event.js';

export class KafkaEmailAddressDisabledEvent extends EmailAddressDisabledEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.personId;
    }
}
