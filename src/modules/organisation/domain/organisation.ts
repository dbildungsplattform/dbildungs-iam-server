import { type DomainError } from '../../../shared/error/domain.error.js';
import { type OrganisationID } from '../../../shared/types/aggregate-ids.types.js';
import { NameValidator } from '../../../shared/validation/name-validator.js';
import { type OrganisationRepository } from '../persistence/organisation.repository.js';
import { KennungForOrganisationWithTrailingSpaceError } from '../specification/error/kennung-with-trailing-space.error.js';
import { KlassenNameAnSchuleEindeutigError } from '../specification/error/klassen-name-an-schule-eindeutig.error.js';
import { NameRequiredForKlasseError } from '../specification/error/name-required-for-klasse.error.js';
import { NameForOrganisationWithTrailingSpaceError } from '../specification/error/name-with-trailing-space.error.js';
import { type OrganisationSpecificationError } from '../specification/error/organisation-specification.error.js';
import { SchultraegerNameEindeutigError } from '../specification/error/SchultraegerNameEindeutigError.js';
import { TraegerUnterRootChildError } from '../specification/error/traeger-unter-root-child.error.js';
import { NameRequiredForKlasse } from '../specification/name-required-for-klasse.js';
import { TraegerNameUniqueInSubtree } from '../specification/traeger-name-unique-in-subtree.js';
import { TraegerUnterRootChild } from '../specification/traeger-unter-root-child.js';
import { OrganisationsTyp, type Traegerschaft } from './organisation.enums.js';
import { type OrganisationsbeziehungsTyp } from './organisationsbeziehungs-typ.enum.js';

export type Organisationsbeziehung<WasPersisted extends boolean> = {
    id: Persisted<string, WasPersisted>;
    createdAt: Persisted<Date, WasPersisted>;
    updatedAt: Persisted<Date, WasPersisted>;
    quellOrganisationId: OrganisationID;
    zielOrganisationId: OrganisationID;
    typ: OrganisationsbeziehungsTyp;
};

export type Organisationsbeziehungen = Array<Organisationsbeziehung<boolean>>;

export class Organisation<WasPersisted extends boolean, RelationshipsLoaded extends boolean = false> {
    private constructor(
        public id: Persisted<string, WasPersisted>,
        public createdAt: Persisted<Date, WasPersisted>,
        public updatedAt: Persisted<Date, WasPersisted>,
        public version: Persisted<number, WasPersisted>,
        public itslearningEnabled: boolean,
        public name: string,
        public typ: OrganisationsTyp,
        public organisationsbeziehungen: RelationshipsLoaded extends true ? Organisationsbeziehungen : undefined,
        public administriertVon?: string,
        public zugehoerigZu?: string,
        public kennung?: string,
        public namensergaenzung?: string,
        public kuerzel?: string,
        public traegerschaft?: Traegerschaft,
        public emailDomain?: string,
        public emailAdress?: string,
    ) {}

    public static construct<WasPersisted extends boolean = false, RelationshipsLoaded extends boolean = false>(
        id: Persisted<string, WasPersisted>,
        createdAt: Persisted<Date, WasPersisted>,
        updatedAt: Persisted<Date, WasPersisted>,
        version: number,
        name: string,
        typ: OrganisationsTyp,
        organisationsbeziehungen: RelationshipsLoaded extends true ? Organisationsbeziehungen : undefined,
        administriertVon?: string,
        zugehoerigZu?: string,
        kennung?: string,
        namensergaenzung?: string,
        kuerzel?: string,
        traegerschaft?: Traegerschaft,
        emailDomain?: string,
        emailAdress?: string,
        itslearningEnabled: boolean = false,
    ): Organisation<WasPersisted, RelationshipsLoaded> {
        return new Organisation<WasPersisted, RelationshipsLoaded>(
            id,
            createdAt,
            updatedAt,
            version,
            itslearningEnabled,
            name,
            typ,
            organisationsbeziehungen,
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
    ): Organisation<false, false> | DomainError {
        const organisation: Organisation<false, false> = new Organisation<false, false>(
            undefined,
            undefined,
            undefined,
            undefined,
            itslearningEnabled,
            name,
            typ,
            undefined,
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

    public addOrganisationsbeziehung(
        this: Organisation<true, true>,
        zielOrganisationId: OrganisationID,
        typ: OrganisationsbeziehungsTyp,
    ): Organisationsbeziehung<false> {
        const organisationsbeziehung: Organisationsbeziehung<false> = {
            id: undefined,
            createdAt: undefined,
            updatedAt: undefined,
            quellOrganisationId: this.id,
            zielOrganisationId,
            typ,
        };

        this.organisationsbeziehungen.push(organisationsbeziehung);

        return organisationsbeziehung;
    }

    public removeOrganisationsbeziehung(
        this: Organisation<true, true>,
        organisationsbeziehungId: string,
    ): Organisationsbeziehung<boolean> | undefined {
        const index: number = this.organisationsbeziehungen.findIndex(
            (organisationsbeziehung: Organisationsbeziehung<boolean>) =>
                organisationsbeziehung.id === organisationsbeziehungId,
        );
        if (index === -1) {
            return undefined;
        }

        return this.organisationsbeziehungen.splice(index, 1)[0];
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

        // Refactor this to use KlassenNameAnSchuleEindeutig
        // when ticket SPSH-738 is merged.
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

        const traegerUnterRootChild: TraegerUnterRootChild<WasPersisted, RelationshipsLoaded> =
            new TraegerUnterRootChild(organisationRepository);

        if (!(await traegerUnterRootChild.isSatisfiedBy(this))) {
            if (this.id) {
                return new TraegerUnterRootChildError(this.id);
            }
        }

        const traegerNameUniqueInSubtree: TraegerNameUniqueInSubtree<WasPersisted, RelationshipsLoaded> =
            new TraegerNameUniqueInSubtree(organisationRepository);

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

        const parent: Option<Organisation<true, false>> = await organisationRepository.findById(this.administriertVon);

        if (!parent) {
            return false;
        }

        // Checking that the parent is of type SCHULE is done
        // in a different specification.
        const otherChildOrgas: Array<Organisation<true, false>> = await organisationRepository.findChildOrgasForIds([
            parent.id,
        ]);

        for (const otherChildOrga of otherChildOrgas) {
            if (otherChildOrga.typ === OrganisationsTyp.KLASSE && otherChildOrga.name === this.name) {
                return false;
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
