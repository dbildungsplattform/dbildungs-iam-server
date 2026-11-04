import { type KafkaEvent } from './kafka-event.js';
import { RollenerweiterungCreatedEvent } from './rollenerweiterung-created.event.js';

export class KafkaRollenerweiterungCreatedEvent extends RollenerweiterungCreatedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return `${this.organisationId}-${this.rolleId}-${this.serviceProviderId}`;
    }
}
