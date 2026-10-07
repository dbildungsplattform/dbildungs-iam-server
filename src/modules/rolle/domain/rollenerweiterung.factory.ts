import { Injectable } from '@nestjs/common';
import { OrganisationID, RollenerweiterungID, ServiceProviderID } from '../../../shared/types/aggregate-ids.types.js';
import { Rollenerweiterung } from './rollenerweiterung.js';

@Injectable()
export class RollenerweiterungFactory {
    public construct(
        id: RollenerweiterungID,
        createdAt: Date,
        updatedAt: Date,
        organisationId: OrganisationID,
        rolleId: string,
        serviceProviderId: ServiceProviderID,
    ): Rollenerweiterung<true> {
        return Rollenerweiterung.construct(id, createdAt, updatedAt, organisationId, rolleId, serviceProviderId);
    }
}
