import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { OrganisationMatchesRollenartError } from '../../rolle/domain/specification/error/organisation-matches-rollenart.error.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RolleNurAnPassendeOrganisationError } from '../specification/error/rolle-nur-an-passende-organisation.js';
import { Err, Ok } from '../../../shared/util/result.js';

@Injectable()
export class PersonenkontextWorkflowSharedKernel {
    public constructor(
        private readonly rolleRepo: RolleRepo,
        private readonly organisationRepository: OrganisationRepository,
    ) {}

    public async checkReferences(organisationId: string, rolleId: string): Promise<Result<void, DomainError>> {
        const [orga, rolle]: [Option<Organisation<true>>, Option<Rolle<true>>] = await Promise.all([
            this.organisationRepository.findById(organisationId),
            this.rolleRepo.findById(rolleId),
        ]);
        if (!orga) {
            return Err(new EntityNotFoundError('Organisation', organisationId));
        }

        if (!rolle) {
            return Err(new EntityNotFoundError('Rolle', rolleId));
        }
        // Can rolle be assigned at target orga
        const canAssignRolle: Result<void, EntityNotFoundError | OrganisationMatchesRollenartError> =
            await rolle.canBeAssignedToOrga(orga);
        if (!canAssignRolle.ok) {
            if (canAssignRolle.error instanceof OrganisationMatchesRollenartError) {
                return Err(new RolleNurAnPassendeOrganisationError());
            }
            return Err(new EntityNotFoundError('Rolle', rolleId)); // Rolle does not exist for the chosen organisation
        }

        return Ok();
    }
}
