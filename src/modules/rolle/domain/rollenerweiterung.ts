import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import {
    type OrganisationID,
    type RolleID,
    type RollenerweiterungID,
    type ServiceProviderID,
} from '../../../shared/types/aggregate-ids.types.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { type OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { type ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { type ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { type RolleRepo } from '../repo/rolle.repo.js';
import { type Rolle } from './rolle.js';

export class Rollenerweiterung<WasPersisted extends boolean> {
    private constructor(
        private readonly organisationRepo: OrganisationRepository,
        private readonly rolleRepo: RolleRepo,
        private readonly serviceProviderRepo: ServiceProviderRepo,
        public readonly id: Persisted<RollenerweiterungID, WasPersisted>,
        public readonly createdAt: Persisted<Date, WasPersisted>,
        public readonly updatedAt: Persisted<Date, WasPersisted>,
        public readonly organisationId: OrganisationID,
        public readonly rolleId: RolleID,
        public readonly serviceProviderId: ServiceProviderID,
    ) {}

    public static construct<WasPersisted extends boolean = false>(
        organisationRepo: OrganisationRepository,
        rolleRepo: RolleRepo,
        serviceProviderRepo: ServiceProviderRepo,
        id: RollenerweiterungID,
        createdAt: Date,
        updatedAt: Date,
        organisationId: OrganisationID,
        rolleId: RolleID,
        serviceProviderId: ServiceProviderID,
    ): Rollenerweiterung<WasPersisted> {
        return new Rollenerweiterung<WasPersisted>(
            organisationRepo,
            rolleRepo,
            serviceProviderRepo,
            id,
            createdAt,
            updatedAt,
            organisationId,
            rolleId,
            serviceProviderId,
        );
    }

    public static createNew(
        organisationRepo: OrganisationRepository,
        rolleRepo: RolleRepo,
        serviceProviderRepo: ServiceProviderRepo,
        organisationId: OrganisationID,
        rolleId: RolleID,
        serviceProviderId: ServiceProviderID,
    ): Rollenerweiterung<false> {
        return new Rollenerweiterung<false>(
            organisationRepo,
            rolleRepo,
            serviceProviderRepo,
            undefined,
            undefined,
            undefined,
            organisationId,
            rolleId,
            serviceProviderId,
        );
    }

    public async checkReferences(): Promise<Option<EntityNotFoundError>> {
        const [organisation, rolle, serviceProvider]: [
            Option<Organisation<true>>,
            Option<Rolle<true>>,
            Option<ServiceProvider<true>>,
        ] = await Promise.all([
            this.organisationRepo.findById(this.organisationId),
            this.rolleRepo.findById(this.rolleId),
            this.serviceProviderRepo.findById(this.serviceProviderId),
        ]);
        if (!organisation) {
            return new EntityNotFoundError('Organisation', this.organisationId);
        }
        if (!rolle) {
            return new EntityNotFoundError('Rolle', this.rolleId);
        }

        if (!(await rolle.canBeAssignedToOrga(organisation)).ok) {
            return new EntityNotFoundError('Rolle', this.rolleId);
        }

        if (!serviceProvider) {
            return new EntityNotFoundError('ServiceProvider', this.serviceProviderId);
        }
        return undefined;
    }

    public async getOrganisation(): Promise<Option<Organisation<true>>> {
        return this.organisationRepo.findById(this.organisationId);
    }

    public async getRolle(): Promise<Option<Rolle<true>>> {
        return this.rolleRepo.findById(this.rolleId);
    }

    public async getServiceProvider(): Promise<Option<ServiceProvider<true>>> {
        return this.serviceProviderRepo.findById(this.serviceProviderId);
    }
}
