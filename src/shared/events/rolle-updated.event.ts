import { type RollenArt, type RollenMerkmal } from '../../modules/rolle/domain/rolle.enums.js';
import { type RollenSystemRecht } from '../../modules/rolle/domain/systemrecht.js';
import { type Rolle } from '../../modules/rolle/domain/rolle.js';
import { type RolleID } from '../types/aggregate-ids.types.js';
import { BaseEvent } from './base-event.js';

export class RolleUpdatedEvent extends BaseEvent {
    public constructor(
        public id: RolleID,
        public rollenArt: RollenArt,
        public name: string,
        public administeredBySchulstrukturknoten: string,
        public merkmale: RollenMerkmal[],
        public systemrechte: RollenSystemRecht[],
        public serviceProviderIds: string[],
        public oldName: string,
        public oldAdministeredBySchulstrukturknoten: string,
        public oldMerkmale: RollenMerkmal[],
        public oldSystemrechte: RollenSystemRecht[],
        public oldServiceProviderIds: string[],
    ) {
        super();
    }

    public static fromRollen(newRolle: Rolle<true>, oldRolle: Rolle<true>): RolleUpdatedEvent {
        return new RolleUpdatedEvent(
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
