import { ConfigService } from '@nestjs/config';
import { intersection } from 'lodash-es';
import { PortalConfig } from '../../../shared/config/portal.config.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { PersonID, RolleID } from '../../../shared/types/index.js';
import { PermittedOrgas } from '../../authentication/domain/person-permissions.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RollenArt, RollenMerkmal } from '../../rolle/domain/rolle.enums.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { DbiamPersonenkontextBodyParams } from '../api/param/dbiam-personenkontext.body.params.js';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { DbiamPersonenkontextFactory } from './dbiam-personenkontext.factory.js';
import { PersonenkontexteUpdateError } from './error/personenkontexte-update.error.js';
import { PersonenkontextWorkflowSharedKernel } from './personenkontext-workflow-shared-kernel.js';
import { OperationContext } from './personenkontext.enums.js';
import { Personenkontext } from './personenkontext.js';
import { PersonenkontexteUpdate } from './personenkontexte-update.js';
import { findAllowedRollen } from '../../../shared/util/rollen.helper.js';
import { Err, Ok } from '../../../shared/util/result.js';

export class PersonenkontextWorkflowAggregate {
    public personId?: PersonID;

    public selectedOrganisationId?: string;

    public selectedRolleIds?: string[];

    private constructor(
        private readonly rolleRepo: RolleRepo,
        private readonly organisationRepository: OrganisationRepository,
        private readonly personenkontextRepository: DBiamPersonenkontextRepo,
        private readonly dbiamPersonenkontextFactory: DbiamPersonenkontextFactory,
        private readonly configService: ConfigService,
        private readonly personenkontextWorkflowSharedKernel: PersonenkontextWorkflowSharedKernel,
    ) {}

    public static createNew(
        rolleRepo: RolleRepo,
        organisationRepository: OrganisationRepository,
        personenkontextRepository: DBiamPersonenkontextRepo,
        dbiamPersonenkontextFactory: DbiamPersonenkontextFactory,
        configService: ConfigService,
        personenkontextWorkflowSharedKernel: PersonenkontextWorkflowSharedKernel,
    ): PersonenkontextWorkflowAggregate {
        return new PersonenkontextWorkflowAggregate(
            rolleRepo,
            organisationRepository,
            personenkontextRepository,
            dbiamPersonenkontextFactory,
            configService,
            personenkontextWorkflowSharedKernel,
        );
    }

    // Initialize the aggregate with the selected Organisation and Rolle
    public initialize(personId?: PersonID, organisationId?: string, rolleIds?: string[]): void {
        this.personId = personId;
        this.selectedOrganisationId = organisationId;
        this.selectedRolleIds = rolleIds;
    }

    // Finds all SSKs that the admin can see
    public async findAllSchulstrukturknoten(
        permissions: IPersonPermissions,
        organisationName: string | undefined,
        limit?: number,
    ): Promise<Organisation<true>[]> {
        const permittedOrgas: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.PERSONEN_VERWALTEN],
            true,
        );

        // If there are no permitted orgas, return an empty array early
        if (!permittedOrgas.all && permittedOrgas.orgaIds.length === 0) {
            return [];
        }

        let organisationsExceptKlassen: Organisation<true>[] = [];

        // Fetch organisations based on the permitted organization IDs and the search string
        organisationsExceptKlassen = await this.organisationRepository.findByNameOrKennungAndExcludeByOrganisationType(
            OrganisationsTyp.KLASSE,
            organisationName,
            permittedOrgas.all ? undefined : permittedOrgas.orgaIds, // Only fetch permitted organizations if restricted
            limit,
        );

        // If no organizations were found, return an empty array
        if (organisationsExceptKlassen.length === 0) {
            return [];
        }

        // If organisationId is provided and it's not in the filtered results, fetch it explicitly
        if (
            this.selectedOrganisationId &&
            !organisationsExceptKlassen.some((orga: Organisation<true>) => orga.id === this.selectedOrganisationId)
        ) {
            const selectedOrg: Option<Organisation<true>> = await this.organisationRepository.findById(
                this.selectedOrganisationId,
            );
            if (selectedOrg) {
                organisationsExceptKlassen = [selectedOrg, ...organisationsExceptKlassen]; // Add the selected org at the beginning
            }
        }

        // Sort the filtered organizations, handling undefined kennung and name
        organisationsExceptKlassen.sort((a: Organisation<boolean>, b: Organisation<boolean>) => {
            if (a.name && b.name) {
                const aTitle: string = a.kennung ? `${a.kennung} (${a.name})` : a.name;
                const bTitle: string = b.kennung ? `${b.kennung} (${b.name})` : b.name;
                return aTitle.localeCompare(bTitle, 'de', { numeric: true });
            }
            // Ensure a return value for cases where name is not defined (Should never happen normally)
            if (a.name) {
                return -1;
            }
            if (b.name) {
                return 1;
            }
            return 0;
        });

        // Return the organizations that the admin has rights to
        return organisationsExceptKlassen;
    }

    public async findRollenForOrganisation(
        permissions: IPersonPermissions,
        rolleName?: string,
        rollenIds?: string[],
        limit?: number,
        rollenarten?: RollenArt[],
    ): Promise<Rolle<true>[]> {
        if (this.personId && !(await permissions.canModifyPerson(this.personId))) {
            return [];
        }

        let allowedRollenArten: RollenArt[] | undefined = rollenarten;

        if (this.personId) {
            const existingPKs: Personenkontext<true>[] = await this.personenkontextRepository.findByPerson(
                this.personId,
            );
            const existingRollen: Map<string, Rolle<true>> = await this.rolleRepo.findByIds(
                existingPKs.map((pk: Personenkontext<true>) => pk.rolleId),
            );

            if (existingRollen.size > 0) {
                const existingRollenarten: RollenArt[] = Array.from(existingRollen.values()).map(
                    (r: Rolle<true>) => r.rollenart,
                );
                allowedRollenArten = allowedRollenArten
                    ? intersection(allowedRollenArten, existingRollenarten)
                    : existingRollenarten;
            }
        }

        return findAllowedRollen({
            organisationId: this.selectedOrganisationId,
            permissionsCheck: () =>
                permissions.hasSystemrechteAtOrganisation(
                    this.selectedOrganisationId!,
                    [RollenSystemRecht.PERSONEN_VERWALTEN, RollenSystemRecht.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN],
                    false,
                ),
            organisationRepository: this.organisationRepository,
            rolleRepo: this.rolleRepo,
            checkReferences: this.checkReferences.bind(this),
            rolleName,
            rollenIds,
            limit,
            allowedRollenArten,
        });
    }

    // Verifies if the selected rolle and organisation can together be assigned to a kontext
    // Also verifies again if the organisationId is allowed to be assigned by the admin
    public async canCommit(
        permissions: IPersonPermissions,
        operationContext: OperationContext,
    ): Promise<Result<void, DomainError>> {
        if (this.selectedOrganisationId && this.selectedRolleIds && this.selectedRolleIds.length > 0) {
            // Check references for all selected roles concurrently
            const referenceChecks: Result<void, DomainError>[] = await Promise.all(
                this.selectedRolleIds.map((rolleId: string) =>
                    this.checkReferences(this.selectedOrganisationId!, rolleId),
                ),
            );

            const firstFailedCheck: Result<void, DomainError> | undefined = referenceChecks.find(
                (result: Result<void, DomainError>) => !result.ok,
            );
            if (firstFailedCheck) {
                return firstFailedCheck;
            }

            // Check permissions after verifying references
            const permissionCheckError: Result<void, DomainError> = await this.checkPermissions(
                permissions,
                this.personId,
                this.selectedOrganisationId,
                this.selectedRolleIds,
                operationContext,
            );
            if (!permissionCheckError.ok) {
                return permissionCheckError;
            }
        }

        return Ok(undefined);
    }

    // Takes in the list of personenkontexte and decides whether to add or delete the personenkontexte for a specific PersonId
    // This will only be used during "bearbeiten".
    public async commit(
        personId: string,
        lastModified: Date | undefined,
        count: number,
        personenkontexte: DbiamPersonenkontextBodyParams[],
        permissions: IPersonPermissions,
        personalnummer?: string,
    ): Promise<Personenkontext<true>[] | PersonenkontexteUpdateError> {
        const pkUpdate: PersonenkontexteUpdate = this.dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
            personId,
            lastModified,
            count,
            personenkontexte,
            permissions,
            personalnummer,
        );
        return pkUpdate.update();
    }

    // Checks if the rolle can be assigned to the target organisation
    public async checkReferences(organisationId: string, rolleId: string): Promise<Result<void, DomainError>> {
        return this.personenkontextWorkflowSharedKernel.checkReferences(organisationId, rolleId);
    }

    public async checkPermissions(
        permissions: IPersonPermissions,
        personId: PersonID | undefined,
        organisationId: string,
        rolleIds: RolleID[],
        operationContext: OperationContext,
    ): Promise<Result<void, DomainError>> {
        // When person is given, check for permission regardless of operationContext
        if (personId) {
            const hasPersonModifyPermission: boolean = await permissions.canModifyPerson(personId);
            if (!hasPersonModifyPermission) {
                return Err(new MissingPermissionsError('Unauthorized to manage person'));
            }
        }

        return this.checkOperationPermissions(permissions, organisationId, rolleIds, operationContext);
    }

    private async checkOperationPermissions(
        permissions: IPersonPermissions,
        organisationId: string,
        rolleIds: RolleID[],
        operationContext: OperationContext,
    ): Promise<Result<void, DomainError>> {
        switch (operationContext) {
            case OperationContext.PERSON_ANLEGEN:
                return this.checkCreatePermissions(permissions, organisationId, rolleIds);
            case OperationContext.PERSON_BEARBEITEN:
                return this.checkEditPermissions(permissions, organisationId);
        }
    }

    private async checkEditPermissions(
        permissions: IPersonPermissions,
        organisationId: string,
    ): Promise<Result<void, DomainError>> {
        const hasVerwaltenPermissionAtOrga: boolean = await permissions.hasSystemrechtAtOrganisation(
            organisationId,
            RollenSystemRecht.PERSONEN_VERWALTEN,
        );
        if (!hasVerwaltenPermissionAtOrga) {
            return Err(new MissingPermissionsError('Unauthorized to manage persons at the organisation'));
        }
        return Ok(undefined);
    }

    private async checkCreatePermissions(
        permissions: IPersonPermissions,
        organisationId: string,
        rolleIds: RolleID[],
    ): Promise<Result<void, DomainError>> {
        const hasAnlegenPermissionAtOrga: boolean = await permissions.hasSystemrechtAtOrganisation(
            organisationId,
            RollenSystemRecht.PERSONEN_ANLEGEN,
        );

        const rollen: Map<RolleID, Rolle<true>> = await this.rolleRepo.findByIds(rolleIds);
        const includesMPTRollen: boolean = this.includesMPTRollen(rollen.values());
        if (includesMPTRollen) {
            const hasSystemrecht: boolean = await permissions.hasSystemrechtAtOrganisation(
                organisationId,
                RollenSystemRecht.MPT_ROLLEN_VERWALTEN,
            );
            if (!hasSystemrecht) {
                return Err(new MissingPermissionsError('Unauthorized to manage MPT-Rollen at the organisation'));
            }
        }

        if (hasAnlegenPermissionAtOrga) {
            return Ok(undefined);
        }

        const hasLimitedCreationPermissionAtOrga: boolean = await permissions.hasSystemrechtAtOrganisation(
            organisationId,
            RollenSystemRecht.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN,
        );
        if (!hasLimitedCreationPermissionAtOrga) {
            return Err(new MissingPermissionsError('Unauthorized to manage persons at the organisation'));
        }

        const portalConfig: PortalConfig = this.configService.getOrThrow<PortalConfig>('PORTAL');
        const allowedRollenArten: RollenArt[] = portalConfig.LIMITED_ROLLENART_ALLOWLIST;
        if (!this.isLimitedCreationAllowedForRollen(rollen.values(), allowedRollenArten)) {
            return Err(new MissingPermissionsError('Unauthorized to manage rollenart at the organisation'));
        }

        return Ok(undefined);
    }

    private isLimitedCreationAllowedForRollen(
        rollen: Iterable<Rolle<true>>,
        allowedRollenArten: RollenArt[],
    ): boolean {
        return Array.from(rollen).every(
            (rolle: Rolle<true>) =>
                allowedRollenArten.includes(rolle.rollenart) || rolle.hasMerkmal(RollenMerkmal.MPT_ROLLE),
        );
    }

    private includesMPTRollen(rollen: Iterable<Rolle<true>>): boolean {
        for (const rolle of rollen) {
            if (rolle.hasMerkmal(RollenMerkmal.MPT_ROLLE)) {
                return true;
            }
        }
        return false;
    }
}
