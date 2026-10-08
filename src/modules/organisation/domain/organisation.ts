import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { KlassenNameAnSchuleEindeutigError } from '../specification/error/klassen-name-an-schule-eindeutig.error.js';
import { NameRequiredForKlasseError } from '../specification/error/name-required-for-klasse.error.js';
import { OrganisationSpecificationError } from '../specification/error/organisation-specification.error.js';
import { NameRequiredForKlasse } from '../specification/name-required-for-klasse.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { NameValidator } from '../../../shared/validation/name-validator.js';
import { KennungForOrganisationWithTrailingSpaceError } from '../specification/error/kennung-with-trailing-space.error.js';
import { NameForOrganisationWithTrailingSpaceError } from '../specification/error/name-with-trailing-space.error.js';
import { OrganisationsTyp, Traegerschaft } from './organisation.enums.js';
import { SchultraegerNameEindeutigError } from '../specification/error/SchultraegerNameEindeutigError.js';
import { TraegerNameUniqueInSubtree } from '../specification/traeger-name-unique-in-subtree.js';
import { TraegerUnterRootChild } from '../specification/traeger-unter-root-child.js';
import { TraegerUnterRootChildError } from '../specification/error/traeger-unter-root-child.error.js';

export class Organisation<WasPersisted extends boolean> {
    private constructor(
        public id: Persisted<string, WasPersisted>,
        public createdAt: Persisted<Date, WasPersisted>,
        public updatedAt: Persisted<Date, WasPersisted>,
        public version: Persisted<number, WasPersisted>,
        public itslearningEnabled: boolean,
        public name: string,
        public typ: OrganisationsTyp,
        public administriertVon?: string,
        public zugehoerigZu?: string,
        public kennung?: string,
        public namensergaenzung?: string,
        public kuerzel?: string,
        public traegerschaft?: Traegerschaft,
        public emailDomain?: string,
        public emailAdress?: string,
    ) {}

    public static construct<WasPersisted extends boolean = false>(
        id: Persisted<string, WasPersisted>,
        createdAt: Persisted<Date, WasPersisted>,
        updatedAt: Persisted<Date, WasPersisted>,
        version: number,
        name: string,
        typ: OrganisationsTyp,
        administriertVon?: string,
        zugehoerigZu?: string,
        kennung?: string,
        namensergaenzung?: string,
        kuerzel?: string,
        traegerschaft?: Traegerschaft,
        emailDomain?: string,
        emailAdress?: string,
        itslearningEnabled: boolean = false,
    ): Organisation<WasPersisted> {
        return new Organisation(
            id,
            createdAt,
            updatedAt,
            version,
            itslearningEnabled,
            name,
            typ,
            administriertVon,
            zugehoerigZu,
            kennung,
            namensergaenzung,
            kuerzel,
            traegerschaft,
            emailDomain,
            emailAdress,
        );
    }

    public static createNew(
        name: string,
        typ: OrganisationsTyp,
        administriertVon?: string,
        zugehoerigZu?: string,
        kennung?: string,
        namensergaenzung?: string,
        kuerzel?: string,
        traegerschaft?: Traegerschaft,
        emailDomain?: string,
        emailAdress?: string,
        itslearningEnabled: boolean = false,
    ): Organisation<false> | DomainError {
        const organisation: Organisation<false> = new Organisation(
            undefined,
            undefined,
            undefined,
            undefined,
            itslearningEnabled,
            name,
            typ,
            administriertVon,
            zugehoerigZu,
            kennung,
            namensergaenzung,
            kuerzel,
            traegerschaft,
            emailDomain,
            emailAdress,
        );

        const validationError: void | OrganisationSpecificationError = organisation.validateFieldNames();
        if (validationError) {
            return validationError;
        }

        return organisation;
    }

    public async checkKlasseSpecifications(
        organisationRepository: OrganisationRepository,
    ): Promise<undefined | OrganisationSpecificationError> {
        const validationError: void | OrganisationSpecificationError = this.validateFieldNames();
        if (validationError) {
            return validationError;
        }
        const nameRequiredForKlasse: NameRequiredForKlasse = new NameRequiredForKlasse();
        if (!(await nameRequiredForKlasse.isSatisfiedBy(this))) {
            return new NameRequiredForKlasseError();
        }
        //Refactor this to use KlassenNameAnSchuleEindeutig when ticket SPSH-738 is merged
        if (!(await this.validateClassNameIsUniqueOnSchool(organisationRepository))) {
            return new KlassenNameAnSchuleEindeutigError(this.id ?? undefined);
        }

        return undefined;
    }

    public async checkSchultraegerSpecifications(
        organisationRepository: OrganisationRepository,
    ): Promise<undefined | OrganisationSpecificationError> {
        const validationError: void | OrganisationSpecificationError = this.validateFieldNames();
        if (validationError) {
            return validationError;
        }

        const traegerUnterRootChild: TraegerUnterRootChild<WasPersisted> = new TraegerUnterRootChild(
            organisationRepository,
        );
        if (!(await traegerUnterRootChild.isSatisfiedBy(this))) {
            if (this.id) {
                return new TraegerUnterRootChildError(this.id);
            }
        }

        const traegerNameUniqueInSubtree: TraegerNameUniqueInSubtree<WasPersisted> = new TraegerNameUniqueInSubtree(
            organisationRepository,
        );
        if (!(await traegerNameUniqueInSubtree.isSatisfiedBy(this))) {
            if (this.id) {
                return new SchultraegerNameEindeutigError(this.id);
            }
        }

        return undefined;
    }

    private async validateClassNameIsUniqueOnSchool(organisationRepository: OrganisationRepository): Promise<boolean> {
        if (this.typ !== OrganisationsTyp.KLASSE) {
            return true;
        }
        if (!this.administriertVon) {
            return false;
        }
        const parent: Option<Organisation<true>> = await organisationRepository.findById(this.administriertVon);
        if (!parent) {
            return false;
        }
        //check that parent is of type SCHULE is done in a different specification
        const otherChildOrgas: Organisation<true>[] = await organisationRepository.findChildOrgasForIds([parent.id]);
        for (const otherChildOrga of otherChildOrgas) {
            if (otherChildOrga.typ === OrganisationsTyp.KLASSE) {
                if (otherChildOrga.name === this.name) {
                    return false;
                } //not satisfied if another Klasse already has same name
            }
        }
        return true;
    }

    private validateFieldNames(): void | OrganisationSpecificationError {
        if (this.name && !NameValidator.isNameValid(this.name)) {
            return new NameForOrganisationWithTrailingSpaceError();
        }

        if (this.kennung && !NameValidator.isNameValid(this.kennung)) {
            return new KennungForOrganisationWithTrailingSpaceError();
        }

        return undefined;
    }

    public setVersionForUpdate(version: number): void {
        this.version = version;
    }
}
