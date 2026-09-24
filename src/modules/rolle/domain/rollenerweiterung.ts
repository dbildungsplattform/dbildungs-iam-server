import {
    OrganisationID,
    RolleID,
    RollenerweiterungID,
    ServiceProviderID,
} from '../../../shared/types/aggregate-ids.types.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { NoRedundantRollenerweiterungError } from '../specification/error/no-redundant-rollenerweiterung.error.js';
import { NoRedundantRollenerweiterung } from '../specification/no-redundant-rollenerweiterung.specification.js';
import { Rolle } from './rolle.js';

export class Rollenerweiterung<WasPersisted extends boolean> {
    private constructor(
        public readonly id: Persisted<RollenerweiterungID, WasPersisted>,
        public readonly createdAt: Persisted<Date, WasPersisted>,
        public readonly updatedAt: Persisted<Date, WasPersisted>,
        public readonly organisationId: OrganisationID,
        public readonly rolleId: RolleID,
        public readonly serviceProviderId: ServiceProviderID,
    ) {}

    public static construct(
        id: RollenerweiterungID,
        createdAt: Date,
        updatedAt: Date,
        organisationId: OrganisationID,
        rolleId: RolleID,
        serviceProviderId: ServiceProviderID,
    ): Rollenerweiterung<true> {
        return new Rollenerweiterung<true>(id, createdAt, updatedAt, organisationId, rolleId, serviceProviderId);
    }

    public static createNew(
        organisationId: OrganisationID,
        rolle: Rolle<true>,
        serviceProviderId: ServiceProviderID,
    ): Result<Rollenerweiterung<false>, NoRedundantRollenerweiterungError> {
        const rollenerweiterung: Rollenerweiterung<false> = new Rollenerweiterung<false>(
            undefined,
            undefined,
            undefined,
            organisationId,
            rolle.id,
            serviceProviderId,
        );

        const noRedundantRollenerweiterung: NoRedundantRollenerweiterung = new NoRedundantRollenerweiterung();

        if (!noRedundantRollenerweiterung.isSatisfiedBy(rollenerweiterung, rolle)) {
            return Err(new NoRedundantRollenerweiterungError());
        }

        return Ok(rollenerweiterung);
    }
}
