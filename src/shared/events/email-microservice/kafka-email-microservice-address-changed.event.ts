import { type KafkaEvent } from '../kafka-event.js';
import { EmailMicroserviceAddressChangedEvent } from './email-microservice-address-changed.event.js';

export class KafkaEmailMicroserviceAddressChangedEvent
    extends EmailMicroserviceAddressChangedEvent
    implements KafkaEvent
{
    public get kafkaKey(): string {
        return this.personId;
    }
}
