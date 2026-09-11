import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { Err, Ok, UnionToResult } from '../../../shared/util/result.js';
import { findAllowedRollen } from '../../../shared/util/rollen.helper.js';
import { PermittedOrgas } from '../../authentication/domain/person-permissions.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { PersonLandesbediensteterSearchService } from '../../person/person-landesbedienstete-search/person-landesbediensteter-search.service.js';
import { DbiamPersonenkontextBodyParams } from '../../personenkontext/api/param/dbiam-personenkontext.body.params.js';
import { DbiamPersonenkontextFactory } from '../../personenkontext/domain/dbiam-personenkontext.factory.js';
import { PersonenkontexteUpdateError } from '../../personenkontext/domain/error/personenkontexte-update.error.js';
import { PersonenkontextWorkflowSharedKernel } from '../../personenkontext/domain/personenkontext-workflow-shared-kernel.js';
import { Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { PersonenkontexteUpdate } from '../../personenkontext/domain/personenkontexte-update.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenSystemRecht, RollenSystemRechtEnum } from '../../rolle/domain/systemrecht.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { EscalatedPermissionAtOrga } from '../../permission/escalated-person-permissions.js';
import { EscalatedPersonPermissionsFactory } from '../../permission/escalated-person-permissions.factory.js';

export class LandesbediensteterWorkflowAggregate {
    public selectedOrganisationId?: string;

    public selectedRolleIds?: string[];

    private constructor(
        private readonly rolleRepo: RolleRepo,
        private readonly organisationRepository: OrganisationRepository,
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly dbiamPersonenkontextFactory: DbiamPersonenkontextFactory,
        private readonly personRepo: PersonRepository,
        private readonly landesbediensteteSearchService: PersonLandesbediensteterSearchService,
        private readonly personenkontextWorkflowSharedKernel: PersonenkontextWorkflowSharedKernel,
        private readonly escalatedPersonPermissionsFactory: EscalatedPersonPermissionsFactory,
    ) {}

    public static createNew(
        rolleRepo: RolleRepo,
        organisationRepository: OrganisationRepository,
        personenkontextRepo: DBiamPersonenkontextRepo,
        dbiamPersonenkontextFactory: DbiamPersonenkontextFactory,
        personRepo: PersonRepository,
        landesbediensteteSearchService: PersonLandesbediensteterSearchService,
        personenkontextWorkflowSharedKernel: PersonenkontextWorkflowSharedKernel,
        escalatedPersonPermissionsFactory: EscalatedPersonPermissionsFactory,
    ): LandesbediensteterWorkflowAggregate {
        return new LandesbediensteterWorkflowAggregate(
            rolleRepo,
            organisationRepository,
            personenkontextRepo,
            dbiamPersonenkontextFactory,
            personRepo,
            landesbediensteteSearchService,
            personenkontextWorkflowSharedKernel,
            escalatedPersonPermissionsFactory,
        );
    }

    // Initialize the aggregate with the selected Organisation and Rolle
    public initialize(organisationId?: string, rolleIds?: string[]): void {
        this.selectedOrganisationId = organisationId;
        this.selectedRolleIds = rolleIds;
    }

    // Finds all SSKs that the admin can see
    public async findAllSchulstrukturknoten(
        permissions: IPersonPermissions,
        organisationName: string | undefined,
        organisationId?: string, // Add organisationId as an optional parameter
        limit?: number,
    ): Promise<Organisation<true>[]> {
        const permittedOrgas: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN],
            true,
        );

        // If there are no permitted orgas, return an empty array early
        if (!permittedOrgas.all && permittedOrgas.orgaIds.length === 0) {
            return [];
        }

        // Fetch organisations based on the permitted organization IDs and the search string
        const allOrganisationsExceptKlassen: Organisation<true>[] =
            await this.organisationRepository.findByNameOrKennungAndExcludeByOrganisationType(
                OrganisationsTyp.KLASSE,
                organisationName,
                permittedOrgas.all ? undefined : permittedOrgas.orgaIds, // Only fetch permitted organizations if restricted
                limit,
            );

        // If no organizations were found, return an empty array
        if (allOrganisationsExceptKlassen.length === 0) {
            return [];
        }

        // Return only the orgas that the admin have rights on
        let filteredOrganisations: Organisation<boolean>[] = allOrganisationsExceptKlassen.filter(
            (orga: Organisation<true>) => permittedOrgas.all || permittedOrgas.orgaIds.includes(orga.id),
        );

        // If organisationId is provided and it's not in the filtered results, fetch it explicitly
        if (
            this.selectedOrganisationId &&
            !filteredOrganisations.find((orga: Organisation<true>) => orga.id === organisationId)
        ) {
            const selectedOrg: Option<Organisation<true>> = await this.organisationRepository.findById(
                this.selectedOrganisationId,
            );
            if (selectedOrg) {
                filteredOrganisations = [selectedOrg, ...filteredOrganisations]; // Add the selected org at the beginning
            }
        }

        // Sort the filtered organizations, handling undefined kennung and name
        filteredOrganisations.sort((a: Organisation<boolean>, b: Organisation<boolean>) => {
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
        return filteredOrganisations;
    }

    public async findRollenForOrganisation(
        permissions: IPersonPermissions,
        rolleName?: string,
        rollenIds?: string[],
        limit?: number,
    ): Promise<Rolle<true>[]> {
        return findAllowedRollen({
            organisationId: this.selectedOrganisationId,
            permissionsCheck: () =>
                permissions.hasSystemrechtAtOrganisation(
                    this.selectedOrganisationId!,
                    RollenSystemRecht.LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN,
                ),
            organisationRepository: this.organisationRepository,
            rolleRepo: this.rolleRepo,
            checkReferences: this.checkReferences.bind(this),
            rolleName,
            rollenIds,
            limit,
        });
    }

    // Verifies if the selected rolle and organisation can together be assigned to a kontext
    // Also verifies again if the organisationId is allowed to be assigned by the admin
    public async canCommit(permissions: IPersonPermissions): Promise<Result<void, DomainError>> {
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
                this.selectedOrganisationId,
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
        newPersonenkontexte: DbiamPersonenkontextBodyParams[],
        permissions: IPersonPermissions,
        personalnummer?: string,
    ): Promise<Result<Personenkontext<true>[], DomainError>> {
        // Check permissions
        const hasSystemrecht: boolean = await Promise.all(
            newPersonenkontexte.map((pk: DbiamPersonenkontextBodyParams) =>
                permissions.hasSystemrechtAtOrganisation(
                    pk.organisationId,
                    RollenSystemRecht.LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN,
                ),
            ),
        ).then((checkResult: boolean[]) => checkResult.every(Boolean));

        if (!hasSystemrecht) {
            return Err(
                new MissingPermissionsError('Not allowed to add Landesbedienstete to the requested organisations.'),
            );
        }

        const person: Option<Person<true>> = await this.personRepo.findById(personId);
        if (!person) {
            return Err(new EntityNotFoundError('Person', personId));
        }

        const searchable: Result<void, DomainError> =
            await this.landesbediensteteSearchService.personIsSearchable(person);
        if (!searchable.ok) {
            return Err(new EntityNotFoundError('Person', personId));
        }

        const existingPKs: DbiamPersonenkontextBodyParams[] = await this.personenkontextRepo.findByPerson(personId);

        /* We must grant PERSONEN_VERWALTEN on the ROOT level instead of only on the existing kontexts

        Reason:
        EscalatedPermission.canModifyPerson is executed and it is possible that the Landesbedienstster has no kontexte in the database.

        As a result, the caller would not be allowed to modify the person based on
        school-level permissions alone, because there are no associated contexts to
        validate against.

        Granting PERSONEN_VERWALTEN on ROOT ensures the caller can modify the person
        regardless of which contexts will be created afterward. */
        const escalatedPermissions: IPersonPermissions = await this.escalatedPersonPermissionsFactory.fromPermissions(
            permissions,
            [
                {
                    orgaId: 'ROOT',
                    systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN],
                } satisfies EscalatedPermissionAtOrga,
            ],
        );

        const pkUpdate: PersonenkontexteUpdate = this.dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
            personId,
            lastModified,
            count,
            existingPKs.concat(newPersonenkontexte),
            escalatedPermissions,
            personalnummer,
        );
        const updateResult: Personenkontext<true>[] | PersonenkontexteUpdateError = await pkUpdate.update();

        return UnionToResult(updateResult);
    }

    // Checks if the rolle can be assigned to the target organisation
    public async checkReferences(organisationId: string, rolleId: string): Promise<Result<void, DomainError>> {
        return this.personenkontextWorkflowSharedKernel.checkReferences(organisationId, rolleId);
    }

    public async checkPermissions(
        permissions: IPersonPermissions,
        organisationId: string,
    ): Promise<Result<void, DomainError>> {
        // Check if logged in person has permission
        const hasPermissionAtOrga: boolean = await permissions.hasSystemrechteAtOrganisation(organisationId, [
            RollenSystemRecht.LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN,
        ]);

        // Missing permission on orga
        if (!hasPermissionAtOrga) {
            return Err(new MissingPermissionsError('Unauthorized to add persons to the organisation'));
        }

        return Ok(undefined);
    }
}
