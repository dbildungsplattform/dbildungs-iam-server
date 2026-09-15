import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityAlreadyExistsError, EntityNotFoundError } from '../../../shared/error/index.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { NameValidator } from '../../../shared/validation/name-validator.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { NameForRolleWithTrailingSpaceError } from './name-with-trailing-space.error.js';
import { RollenArt, RollenMerkmal } from './rolle.enums.js';
import { ServiceProviderProvidedOutOfTreeError } from './service-provider-provided-out-of-tree.error.js';
import { OrganisationMatchesRollenartError } from './specification/error/organisation-matches-rollenart.error.js';
import { OrganisationMatchesRollenart } from './specification/organisation-matches-rollenart.js';
import { RollenSystemRecht } from './systemrecht.js';

export class Rolle<WasPersisted extends boolean> {
    private constructor(
        public readonly organisationRepo: OrganisationRepository,
        public readonly serviceProviderRepo: ServiceProviderRepo,
        public id: Persisted<string, WasPersisted>,
        public readonly createdAt: Persisted<Date, WasPersisted>,
        public readonly updatedAt: Persisted<Date, WasPersisted>,
        public version: Persisted<number, WasPersisted>,
        public name: string,
        public readonly administeredBySchulstrukturknoten: string,
        public readonly rollenart: RollenArt,
        public merkmale: RollenMerkmal[],
        public systemrechte: RollenSystemRecht[],
        public serviceProviderIds: string[],
        public readonly istTechnisch: boolean,
        public serviceProviderData: ServiceProvider<true>[],
    ) {}

    public static createNew(
        organisationRepo: OrganisationRepository,
        serviceProviderRepo: ServiceProviderRepo,
        name: string,
        administeredBySchulstrukturknoten: string,
        rollenart: RollenArt,
        merkmale: RollenMerkmal[],
        systemrechte: RollenSystemRecht[],
        serviceProviderIds: string[],
        serviceProviderData: ServiceProvider<true>[],
        istTechnisch: boolean,
    ): Rolle<false> | DomainError {
        // Future TODO: Remove this check and make sure all repo saves/updates call rolle.validate()
        // Validate the Rollenname
        if (!NameValidator.isNameValid(name)) {
            return new NameForRolleWithTrailingSpaceError();
        }
        return new Rolle(
            organisationRepo,
            serviceProviderRepo,
            undefined,
            undefined,
            undefined,
            undefined,
            name,
            administeredBySchulstrukturknoten,
            rollenart,
            merkmale,
            systemrechte,
            serviceProviderIds,
            istTechnisch,
            serviceProviderData,
        );
    }

    public static construct<WasPersisted extends boolean = false>(
        organisationRepo: OrganisationRepository,
        serviceProviderRepo: ServiceProviderRepo,
        id: string,
        createdAt: Date,
        updatedAt: Date,
        version: number,
        name: string,
        administeredBySchulstrukturknoten: string,
        rollenart: RollenArt,
        merkmale: RollenMerkmal[],
        systemrechte: RollenSystemRecht[],
        serviceProviderIds: string[],
        istTechnisch: boolean,
        serviceProviderData: ServiceProvider<true>[] | undefined,
    ): Rolle<WasPersisted> {
        return new Rolle(
            organisationRepo,
            serviceProviderRepo,
            id,
            createdAt,
            updatedAt,
            version,
            name,
            administeredBySchulstrukturknoten,
            rollenart,
            merkmale,
            systemrechte,
            serviceProviderIds,
            istTechnisch,
            serviceProviderData ?? [],
        );
    }

    public async canBeAssignedToOrga(
        orga: Organisation<true>,
    ): Promise<Result<void, EntityNotFoundError | OrganisationMatchesRollenartError>> {
        let isCorrectNodeOrSubtree: boolean;
        if (orga.id === this.administeredBySchulstrukturknoten) {
            isCorrectNodeOrSubtree = true;
        } else {
            isCorrectNodeOrSubtree = await this.organisationRepo.isOrgaAParentOfOrgaB(
                this.administeredBySchulstrukturknoten,
                orga.id,
            );
        }
        if (!isCorrectNodeOrSubtree) {
            return Err(new EntityNotFoundError('Rolle', this.id ?? 'undefined')); // Rolle does not exist for the chosen organisation
        }
        const rollenartMatchesOrganisation: OrganisationMatchesRollenart = new OrganisationMatchesRollenart();
        const doesRollenartMatchOrga: boolean = rollenartMatchesOrganisation.isSatisfiedBy(orga, this);
        if (!doesRollenartMatchOrga) {
            return Err(new OrganisationMatchesRollenartError());
        }
        return Ok(undefined);
    }

    public addMerkmal(merkmal: RollenMerkmal): void {
        if (!this.merkmale.includes(merkmal)) {
            this.merkmale.push(merkmal);
        }
    }

    public removeMerkmal(merkmal: RollenMerkmal): void {
        const idx: number = this.merkmale.indexOf(merkmal);
        if (idx !== -1) {
            this.merkmale.splice(idx, 1);
        }
    }

    public addSystemRecht(systemRecht: RollenSystemRecht): void {
        if (!this.systemrechte.includes(systemRecht)) {
            this.systemrechte.push(systemRecht);
        }
    }

    public hasSystemRecht(systemRecht: RollenSystemRecht): boolean {
        return this.systemrechte.includes(systemRecht);
    }

    public hasMerkmal(merkmal: RollenMerkmal): boolean {
        return this.merkmale.includes(merkmal);
    }

    /**
     * Check this Rolle for validity. Currently checks:
     * - Name validity
     * - No duplicate serviceproviders
     * - All serviceproviders exist
     * - All serviceproviders are defined at the Rolle's organisation or above
     */
    public async validate(): Promise<Result<void, DomainError>> {
        // Check Name
        if (!NameValidator.isNameValid(this.name)) {
            return Err(new NameForRolleWithTrailingSpaceError());
        }

        // Check ServiceProviders existance
        const serviceProviderMap: Map<string, ServiceProvider<true>> = await this.serviceProviderRepo.findByIds(
            this.serviceProviderIds,
        );

        const missingIds: string[] = this.serviceProviderIds.filter((id: string) => !serviceProviderMap.has(id));
        if (missingIds.length > 0) {
            return Err(new EntityNotFoundError('ServiceProvider', missingIds.join(', ')));
        }

        // Duplicates
        if (serviceProviderMap.size !== this.serviceProviderIds.length) {
            return Err(new EntityAlreadyExistsError('ServiceProvider'));
        }

        // Check ServiceProvider assignability
        const rolleParentOrganisations: Organisation<true>[] =
            await this.organisationRepo.findParentOrgasForIdSortedByDepthAsc(this.administeredBySchulstrukturknoten);

        for (const serviceProviderId of this.serviceProviderIds) {
            const serviceProvider: ServiceProvider<true> = serviceProviderMap.get(serviceProviderId)!;
            if (
                !rolleParentOrganisations.some(
                    (orga: Organisation<true>) => orga.id === serviceProvider.providedOnSchulstrukturknoten,
                )
            ) {
                return Err(new ServiceProviderProvidedOutOfTreeError(serviceProviderId));
            }
        }

        return Ok();
    }
}
