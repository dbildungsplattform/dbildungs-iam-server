import {
    OrganisationID,
    RolleID,
    RollenerweiterungID,
    ServiceProviderID,
} from '../../../shared/types/aggregate-ids.types.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { NoRedundantRollenerweiterungError } from '../specification/error/no-redundant-rollenerweiterung.error.js';
import { ServiceProviderNichtVerfuegbarFuerRollenerweiterungError } from '../specification/error/service-provider-nicht-verfuegbar-fuer-rollenerweiterung.error.js';
import { NoRedundantRollenerweiterung } from '../specification/no-redundant-rollenerweiterung.specification.js';
import { ServiceProviderVerfuegbarFuerRollenerweiterung } from '../specification/service-provider-verfuegbar-fuer-rollenerweiterung.specification.js';
import { Rolle } from './rolle.js';
import { RollenartNotAllowedForSPError } from './rollenart-not-allowed-for-sp.error.js';

export type CreateRollenerweiterungError =
    | NoRedundantRollenerweiterungError
    | ServiceProviderNichtVerfuegbarFuerRollenerweiterungError
    | RollenartNotAllowedForSPError;

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
        serviceProvider: ServiceProvider<true>,
    ): Result<Rollenerweiterung<false>, NoRedundantRollenerweiterungError> {
        const rollenerweiterung: Rollenerweiterung<false> = new Rollenerweiterung<false>(
            undefined,
            undefined,
            undefined,
            organisationId,
            rolle.id,
            serviceProvider.id,
        );

        const noRedundantRollenerweiterung: NoRedundantRollenerweiterung = new NoRedundantRollenerweiterung();
        if (!noRedundantRollenerweiterung.isSatisfiedBy(rollenerweiterung, rolle)) {
            return Err(new NoRedundantRollenerweiterungError());
        }

        const serviceProviderVerfuegbar: ServiceProviderVerfuegbarFuerRollenerweiterung =
            new ServiceProviderVerfuegbarFuerRollenerweiterung();
        if (!serviceProviderVerfuegbar.isSatisfiedBy(rollenerweiterung, serviceProvider)) {
            return Err(new ServiceProviderNichtVerfuegbarFuerRollenerweiterungError());
        }

        if (
            serviceProvider.rollenartenWhitelist.length > 0 &&
            !serviceProvider.rollenartenWhitelist.includes(rolle.rollenart)
        ) {
            return Err(new RollenartNotAllowedForSPError(rolle.rollenart, serviceProvider.id));
        }

        return Ok(rollenerweiterung);
    }
}
