import { type KafkaEvent } from '../kafka-event.js';
import { EmailAddressesPurgedEvent } from './email-addresses-purged.event.js';

export class KafkaEmailAddressesPurgedEvent extends EmailAddressesPurgedEvent implements KafkaEvent {
    public get kafkaKey(): string | undefined {
        return this.personId;
    }
}
