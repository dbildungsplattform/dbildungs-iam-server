import { type KafkaEvent } from './kafka-event.js';
import { GroupAndRoleCreatedEvent } from './kc-group-and-role-event.js';

export class KafkaGroupAndRoleCreatedEvent extends GroupAndRoleCreatedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return `${this.groupName}:${this.roleName}`;
    }
}
