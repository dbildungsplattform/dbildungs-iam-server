import { Injectable } from '@nestjs/common';
import { OrganisationID, RollenerweiterungID, ServiceProviderID } from '../../../shared/types/aggregate-ids.types.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { Rolle } from './rolle.js';
import { CreateRollenerweiterungError, Rollenerweiterung } from './rollenerweiterung.js';

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
        serviceProvider: ServiceProvider<true>,
    ): Result<Rollenerweiterung<false>, CreateRollenerweiterungError> {
        return Rollenerweiterung.createNew(organisationId, rolle, serviceProvider);
    }
}
