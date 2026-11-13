import { type ConfigService } from '@nestjs/config';
import { type PortalConfig } from '../../../shared/config/portal.config.js';
import { type DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { type IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { type PersonID, type RolleID } from '../../../shared/types/index.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { type PermittedOrgas } from '../../authentication/domain/person-permissions.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { type OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { type EscalatedPersonPermissionsFactory } from '../../permission/escalated-person-permissions.factory.js';
import { type EscalatedPermissionAtOrga } from '../../permission/escalated-person-permissions.js';
import { type RollenArt } from '../../rolle/domain/rolle.enums.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { RollenmerkmalSystemrechtPaar } from '../../rolle/domain/rollenmerkmal-systemrecht-paar.js';
import { OrganisationMatchesRollenartError } from '../../rolle/domain/specification/error/organisation-matches-rollenart.error.js';
import { RollenSystemRecht, RollenSystemRechtEnum } from '../../rolle/domain/systemrecht.js';
import { type RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { type DbiamPersonenkontextBodyParams } from '../api/param/dbiam-personenkontext.body.params.js';
import { type DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { RolleNurAnPassendeOrganisationError } from '../specification/error/rolle-nur-an-passende-organisation.js';
import { type DbiamPersonenkontextFactory } from './dbiam-personenkontext.factory.js';
import { type PersonenkontexteUpdateError } from './error/personenkontexte-update.error.js';
import { OperationContext } from './personenkontext.enums.js';
import { type Personenkontext } from './personenkontext.js';
import { type PersonenkontexteUpdate } from './personenkontexte-update.js';

export class PersonenkontextWorkflowAggregate {
    public personId?: PersonID;

    public selectedOrganisationId?: string;

    public selectedRolleIds?: string[];

    private constructor(
        private readonly rolleRepo: RolleRepo,
        private readonly organisationRepository: OrganisationRepository,
        private readonly dbiamPersonenkontextFactory: DbiamPersonenkontextFactory,
        private readonly configService: ConfigService,
        private readonly escalatedPersonPermissionsFactory: EscalatedPersonPermissionsFactory,
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
    ) {}

    public static createNew(
        rolleRepo: RolleRepo,
        organisationRepository: OrganisationRepository,
        dbiamPersonenkontextFactory: DbiamPersonenkontextFactory,
        configService: ConfigService,
        escalatedPersonPermissionsFactory: EscalatedPersonPermissionsFactory,
        personenkontextRepo: DBiamPersonenkontextRepo,
    ): PersonenkontextWorkflowAggregate {
        return new PersonenkontextWorkflowAggregate(
            rolleRepo,
            organisationRepository,
            dbiamPersonenkontextFactory,
            configService,
            escalatedPersonPermissionsFactory,
            personenkontextRepo,
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

    /**
     * Commits personenkontexte updates with escalated permissions for add operations.
     *
     * For OperationContext.PERSON_HINZUFÜGEN, escalates permissions with PERSONEN_VERWALTEN at ROOT
     * before executing the update. For other operations, uses the provided permissions as-is.
     *
     * @param personId The ID of the person being modified
     * @param lastModified The last modified timestamp
     * @param count Current personenkontext count
     * @param personenkontexte The list of personenkontexte to update
     * @param permissions The caller's permissions
     * @param operationContext The context of the operation
     * @param personalnummer Optional personalnummer
     * @returns Updated personenkontexte or an error
     */
    public async commit(
        personId: string,
        lastModified: Date | undefined,
        count: number,
        personenkontexte: DbiamPersonenkontextBodyParams[],
        permissions: IPersonPermissions,
        operationContext: OperationContext = OperationContext.PERSON_ANLEGEN,
        personalnummer?: string,
    ): Promise<Personenkontext<true>[] | PersonenkontexteUpdateError> {
        const permissionsToUse: IPersonPermissions = await this.applyEscalatedPermissionsIfNeeded(
            operationContext,
            permissions,
        );

        const consolidatedPersonenkontexte: DbiamPersonenkontextBodyParams[] = await this.mergePersonenkontexteIfNeeded(
            operationContext,
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

    private async mergePersonenkontexteIfNeeded(
        operationContext: OperationContext,
        personId: string,
        personenkontexte: DbiamPersonenkontextBodyParams[],
    ): Promise<DbiamPersonenkontextBodyParams[]> {
        let mergedPersonenkontexte: DbiamPersonenkontextBodyParams[] = personenkontexte;
        if (operationContext === OperationContext.PERSON_HINZUFÜGEN) {
            const existingPKs: DbiamPersonenkontextBodyParams[] = await this.personenkontextRepo.findByPerson(personId);
            mergedPersonenkontexte = existingPKs.concat(personenkontexte);
        }
        return mergedPersonenkontexte;
    }

    private async applyEscalatedPermissionsIfNeeded(
        operationContext: OperationContext,
        permissions: IPersonPermissions,
    ): Promise<IPersonPermissions> {
        return operationContext === OperationContext.PERSON_HINZUFÜGEN
            ? this.escalatedPersonPermissionsFactory.fromPermissions(permissions, [
                  {
                      orgaId: 'ROOT',
                      systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN],
                  } satisfies EscalatedPermissionAtOrga,
              ])
            : permissions;
    }

    // Checks if the rolle can be assigned to the target organisation
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
            case OperationContext.PERSON_HINZUFÜGEN:
                return this.checkAddPermissions(permissions, organisationId);
            default:
                return Err(new MissingPermissionsError('Unauthorized operation'));
        }
    }

    /**
     * Checks if the provided permissions are sufficient to add persons to the organisation.
     *
     * @param permissions The caller's permissions
     * @param organisationId The target organisation ID
     * @returns Success or a permission error
     */
    public async checkAddPermissions(
        permissions: IPersonPermissions,
        organisationId: string,
    ): Promise<Result<void, DomainError>> {
        const hasPermissionAtOrga: boolean = await permissions.hasSystemrechteAtOrganisation(organisationId, [
            RollenSystemRecht.LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN,
        ]);

        if (!hasPermissionAtOrga) {
            return Err(new MissingPermissionsError('Unauthorized to add persons to the organisation'));
        }

        return Ok(undefined);
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
        const hasUnauthorizedGatedRolle: boolean = (
            await Promise.all(
                Array.from(rollen.values()).map((rolle: Rolle<true>) =>
                    permissions.hasPermissionForRolleMerkmale(rolle.merkmale, organisationId),
                ),
            )
        ).some((hasPermission: boolean) => !hasPermission);
        if (hasUnauthorizedGatedRolle) {
            return Err(new MissingPermissionsError('Unauthorized to assign MPT/Pilot-Rollen at the organisation'));
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

    private isLimitedCreationAllowedForRollen(rollen: Iterable<Rolle<true>>, allowedRollenArten: RollenArt[]): boolean {
        return Array.from(rollen).every(
            (rolle: Rolle<true>) =>
                allowedRollenArten.includes(rolle.rollenart) ||
                RollenmerkmalSystemrechtPaar.gatedMerkmaleOf(rolle.merkmale).length > 0,
        );
    }
}
