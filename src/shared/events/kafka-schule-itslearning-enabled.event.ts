import { type KafkaEvent } from './kafka-event.js';
import { SchuleItslearningEnabledEvent } from './schule-itslearning-enabled.event.js';

export class KafkaSchuleItslearningEnabledEvent extends SchuleItslearningEnabledEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.organisationId;
    }
}
