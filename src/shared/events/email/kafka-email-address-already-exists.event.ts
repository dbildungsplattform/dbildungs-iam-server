import { type KafkaEvent } from '../kafka-event.js';
import { EmailAddressAlreadyExistsEvent } from './email-address-already-exists.event.js';

export class KafkaEmailAddressAlreadyExistsEvent extends EmailAddressAlreadyExistsEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.personId;
    }
}
