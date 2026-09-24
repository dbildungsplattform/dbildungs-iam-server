import { Injectable } from '@nestjs/common';
import { OrganisationID, RollenerweiterungID, ServiceProviderID } from '../../../shared/types/aggregate-ids.types.js';
import { NoRedundantRollenerweiterungError } from '../specification/error/no-redundant-rollenerweiterung.error.js';
import { Rolle } from './rolle.js';
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

    public createNew(
        organisationId: OrganisationID,
        rolle: Rolle<true>,
        serviceProviderId: ServiceProviderID,
    ): Result<Rollenerweiterung<false>, NoRedundantRollenerweiterungError> {
        return Rollenerweiterung.createNew(organisationId, rolle, serviceProviderId);
    }
}
