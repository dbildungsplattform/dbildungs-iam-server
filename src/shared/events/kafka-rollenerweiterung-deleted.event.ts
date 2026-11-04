import { type KafkaEvent } from './kafka-event.js';
import { RollenerweiterungDeletedEvent } from './rollenerweiterung-deleted.event.js';

export class KafkaRollenerweiterungDeletedEvent extends RollenerweiterungDeletedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return `${this.organisationId}-${this.rolleId}-${this.serviceProviderId}`;
    }
}
