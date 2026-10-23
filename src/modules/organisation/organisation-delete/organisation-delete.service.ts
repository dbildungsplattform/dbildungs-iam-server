import { Injectable } from '@nestjs/common';

import { DomainError } from '../../../shared/error/domain.error.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { OrganisationID } from '../../../shared/types/index.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { PersonenkontextScope } from '../../personenkontext/persistence/personenkontext.scope.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../../rolle/repo/rollenerweiterung.repo.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { Organisation } from '../domain/organisation.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { OrganisationScope } from '../persistence/organisation.scope.js';
import { OrganisationHasChildrenError } from './errors/organisation-has-children.error.js';
import { OrganisationHasPersonenkontexteError } from './errors/organisation-has-personenkontexte.error.js';
import { OrganisationHasRollenError } from './errors/organisation-has-rollen.error.js';
import { OrganisationHasRollenerweiterungError } from './errors/organisation-has-rollenerweiterung.error.js';
import { OrganisationHasServiceProvidersError } from './errors/organisation-has-service-provider.error.js';
import { OrganisationHasZugehoerigeError } from './errors/organisation-has-zugehoerige.error.js';

@Injectable()
export class OrganisationDeleteService {
    public constructor(
        private readonly organisationRepo: OrganisationRepository,
        private readonly rolleRepo: RolleRepo,
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly serviceProviderRepo: ServiceProviderRepo,
        private readonly rollenerweiterungRepo: RollenerweiterungRepo,
    ) {}

    public async deleteOrganisation(
        organisationId: OrganisationID,
        permissions: IPersonPermissions,
    ): Promise<void | DomainError> {
        const hasNoReferences: Result<undefined, DomainError> = await this.hasNoReferences(organisationId, permissions);

        return hasNoReferences.ok ? this.organisationRepo.delete(organisationId) : hasNoReferences.error;
    }

    private async hasNoReferences(
        organisationId: OrganisationID,
        permissions: IPersonPermissions,
    ): Promise<Result<undefined, DomainError>> {
        const [, childOrganisationCount]: Counted<Organisation<true>> = await this.organisationRepo.findBy(
            new OrganisationScope().findAdministrierteVon(organisationId).paged(0, 1),
        );
        if (childOrganisationCount) {
            return Err(new OrganisationHasChildrenError());
        }

        const [, zugehoerigeOrganisationCount]: Counted<Organisation<true>> = await this.organisationRepo.findBy(
            new OrganisationScope().findZugehoerigeZu(organisationId).paged(0, 1),
        );
        if (zugehoerigeOrganisationCount) {
            return Err(new OrganisationHasZugehoerigeError());
        }

        const referencedRollen: Rolle<true>[] = await this.rolleRepo.findBySchulstrukturknoten(organisationId);

        if (referencedRollen.length > 0) {
            return Err(new OrganisationHasRollenError());
        }

        const [, referencedPersonenkontexteCount]: Counted<Personenkontext<true>> =
            await this.personenkontextRepo.findBy(
                new PersonenkontextScope().byOrganisations([organisationId]).paged(0, 1),
            );
        if (referencedPersonenkontexteCount) {
            return Err(new OrganisationHasPersonenkontexteError());
        }

        const referencedServiceProviders: ServiceProvider<true>[] =
            await this.serviceProviderRepo.findBySchulstrukturknoten([organisationId]);

        if (referencedServiceProviders.length > 0) {
            return Err(new OrganisationHasServiceProvidersError());
        }

        const hasRollenerweiterungenResult: Result<boolean, DomainError> =
            await this.rollenerweiterungRepo.existsByOrganisationId(organisationId, permissions);

        if (!hasRollenerweiterungenResult.ok) {
            return hasRollenerweiterungenResult;
        }

        if (hasRollenerweiterungenResult.value) {
            return Err(new OrganisationHasRollenerweiterungError());
        }

        return Ok(undefined);
    }
}
