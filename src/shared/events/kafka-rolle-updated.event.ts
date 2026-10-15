import { type Rolle } from '../../modules/rolle/domain/rolle.js';
import { type KafkaEvent } from './kafka-event.js';
import { RolleUpdatedEvent } from './rolle-updated.event.js';

export class KafkaRolleUpdatedEvent extends RolleUpdatedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.id;
    }

    public static override fromRollen(newRolle: Rolle<true>, oldRolle: Rolle<true>): KafkaRolleUpdatedEvent {
        return new KafkaRolleUpdatedEvent(
            newRolle.id,
            newRolle.rollenart,
            newRolle.name,
            newRolle.administeredBySchulstrukturknoten,
            newRolle.merkmale,
            newRolle.systemrechte,
            newRolle.serviceProviderIds,
            oldRolle.name,
            oldRolle.administeredBySchulstrukturknoten,
            oldRolle.merkmale,
            oldRolle.systemrechte,
            oldRolle.serviceProviderIds,
        );
    }
}
