import { type OrganisationID, type RolleID, type ServiceProviderID } from '../types/aggregate-ids.types.js';
import { BaseEvent } from './base-event.js';

export class RollenerweiterungDeletedEvent extends BaseEvent {
    public constructor(
        public organisationId: OrganisationID,
        public rolleId: RolleID,
        public serviceProviderId: ServiceProviderID,
    ) {
        super();
    }
}
