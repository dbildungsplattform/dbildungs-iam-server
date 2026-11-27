import { Injectable } from '@nestjs/common';
import { type DomainError } from '../../../shared/error/domain.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { type IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { EscalatedPersonPermissionsFactory } from '../../permission/escalated-person-permissions.factory.js';
import { type EscalatedPermissionAtOrga } from '../../permission/escalated-person-permissions.js';
import { PersonLandesbediensteterSearchService } from '../../person/person-landesbedienstete-search/person-landesbediensteter-search.service.js';
import { RollenSystemRecht, RollenSystemRechtEnum } from '../../rolle/domain/systemrecht.js';
import { type DbiamPersonenkontextBodyParams } from '../api/param/dbiam-personenkontext.body.params.js';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { DbiamPersonenkontextFactory } from './dbiam-personenkontext.factory.js';
import { type PersonenkontexteUpdateError } from './error/personenkontexte-update.error.js';
import { type Personenkontext } from './personenkontext.js';
import { type PersonenkontexteUpdate } from './personenkontexte-update.js';

@Injectable()
export class LandesbediensteteKontextWorkflowService {
    public constructor(
        private readonly landesbediensteteSearchService: PersonLandesbediensteterSearchService,
        private readonly escalatedPersonPermissionsFactory: EscalatedPersonPermissionsFactory,
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly dbiamPersonenkontextFactory: DbiamPersonenkontextFactory,
    ) {}

    public async commit(
        personId: string,
        lastModified: Date | undefined,
        count: number,
        personenkontexte: DbiamPersonenkontextBodyParams[],
        permissions: IPersonPermissions,
        personalnummer?: string,
    ): Promise<Personenkontext<true>[] | PersonenkontexteUpdateError> {
        const permissionsError: DomainError | void = await this.checkPermissionsForContextExpansion(
            personId,
            personenkontexte,
            permissions,
        );
        if (permissionsError) {
            return permissionsError;
        }

        const permissionsToUse: IPersonPermissions = await this.applyEscalatedPermissions(permissions);
        const consolidatedPersonenkontexte: DbiamPersonenkontextBodyParams[] = await this.mergeExistingContexts(
            personId,
            personenkontexte,
        );

        const pkUpdate: PersonenkontexteUpdate = this.dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
            personId,
            lastModified,
            count,
            consolidatedPersonenkontexte,
            permissionsToUse,
            personalnummer,
        );
        return pkUpdate.update();
    }

    private async checkPermissionsForContextExpansion(
        personId: string,
        personenkontexte: DbiamPersonenkontextBodyParams[],
        permissions: IPersonPermissions,
    ): Promise<DomainError | void> {
        if (personenkontexte.length === 0) {
            return new MissingPermissionsError('No target organisation provided for context expansion');
        }

        const permissionChecks: Result<void, DomainError>[] = await Promise.all(
            personenkontexte.map((pk: DbiamPersonenkontextBodyParams) =>
                this.checkPermissions(permissions, pk.organisationId),
            ),
        );

        const failedCheck: Result<void, DomainError> | undefined = permissionChecks.find(
            (check: Result<void, DomainError>) => !check.ok,
        );
        if (failedCheck && !failedCheck.ok) {
            return failedCheck.error;
        }

        const canExpandContext: Result<void, DomainError> =
            await this.landesbediensteteSearchService.personIsSearchable(personId);

        if (!canExpandContext.ok) {
            return canExpandContext.error;
        }
    }

    public async checkPermissions(
        permissions: IPersonPermissions,
        organisationId: string,
    ): Promise<Result<void, DomainError>> {
        const hasPermissionAtOrga: boolean = await permissions.hasSystemrechteAtOrganisation(organisationId, [
            RollenSystemRecht.LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN,
        ]);

        if (!hasPermissionAtOrga) {
            return Err(new MissingPermissionsError('Unauthorized to expand person context'));
        }

        return Ok(undefined);
    }

    private async mergeExistingContexts(
        personId: string,
        newPersonenkontexte: DbiamPersonenkontextBodyParams[],
    ): Promise<DbiamPersonenkontextBodyParams[]> {
        const existingPKs: DbiamPersonenkontextBodyParams[] = await this.personenkontextRepo.findByPerson(personId);
        return existingPKs.concat(newPersonenkontexte);
    }

    private async applyEscalatedPermissions(permissions: IPersonPermissions): Promise<IPersonPermissions> {
        return this.escalatedPersonPermissionsFactory.fromPermissions(permissions, [
            {
                orgaId: 'ROOT',
                systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN],
            } satisfies EscalatedPermissionAtOrga,
        ]);
    }
}
