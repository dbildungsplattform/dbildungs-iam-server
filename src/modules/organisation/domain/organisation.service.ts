import { Injectable } from '@nestjs/common';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import {
    DomainError,
    EntityCouldNotBeCreated,
    EntityCouldNotBeUpdated,
    EntityNotFoundError,
    MissingPermissionsError,
} from '../../../shared/error/index.js';
import { Paged } from '../../../shared/paging/paged.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { ScopeOperator } from '../../../shared/persistence/index.js';
import { OrganisationID } from '../../../shared/types/aggregate-ids.types.js';
import { NameValidator } from '../../../shared/validation/name-validator.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { OrganisationScope } from '../persistence/organisation.scope.js';
import { EmailAdressOnOrganisationTyp } from '../specification/email-on-organisation-type.js';
import { EmailAdressOnOrganisationTypError } from '../specification/error/email-adress-on-organisation-typ-error.js';
import { KennungRequiredForSchuleError } from '../specification/error/kennung-required-for-schule.error.js';
import { KennungForOrganisationWithTrailingSpaceError } from '../specification/error/kennung-with-trailing-space.error.js';
import { KlasseNurVonSchuleAdministriertError } from '../specification/error/klasse-nur-von-schule-administriert.error.js';
import { KlasseWithoutNumberOrLetterError } from '../specification/error/klasse-without-number-or-letter.error.js';
import { KlassenNameAnSchuleEindeutigError } from '../specification/error/klassen-name-an-schule-eindeutig.error.js';
import { NameRequiredForSchuleError } from '../specification/error/name-required-for-schule.error.js';
import { NameForOrganisationWithTrailingSpaceError } from '../specification/error/name-with-trailing-space.error.js';
import { OrganisationSpecificationError } from '../specification/error/organisation-specification.error.js';
import { OrganisationsOnDifferentSubtreesError } from '../specification/error/organisations-on-different-subtrees.error.js';
import { SchuleKennungEindeutigError } from '../specification/error/schule-kennung-eindeutig.error.js';
import { SchuleUnterTraegerError } from '../specification/error/schule-unter-traeger.error.js';
import { SchultraegerNameEindeutigError } from '../specification/error/SchultraegerNameEindeutigError.js';
import { TraegerUnterRootChildError } from '../specification/error/traeger-unter-root-child.error.js';
import { ZyklusInOrganisationenError } from '../specification/error/zyklus-in-organisationen.error.js';
import { KennungRequiredForSchule } from '../specification/kennung-required-for-schule.js';
import { KlasseNurVonSchuleAdministriert } from '../specification/klasse-nur-von-schule-administriert.js';
import { KlassenNameAnSchuleEindeutig } from '../specification/klassen-name-an-schule-eindeutig.js';
import { NameRequiredForSchule } from '../specification/name-required-for-schule.js';
import { OrganisationsOnSameSubtree } from '../specification/organisations-on-same-subtree.js';
import { SchuleKennungEindeutig } from '../specification/schule-kennung-eindeutig.js';
import { SchuleUnterTraeger } from '../specification/schule-unter-traeger.js';
import { TraegerNameUniqueInSubtree } from '../specification/traeger-name-unique-in-subtree.js';
import { TraegerUnterRootChild } from '../specification/traeger-unter-root-child.js';
import { ZyklusInOrganisationen } from '../specification/zyklus-in-organisationen.js';
import { OrganisationZuordnungVerschiebenError } from './organisation-zuordnung-verschieben.error.js';
import { OrganisationsTyp } from './organisation.enums.js';
import { Organisation } from './organisation.js';

@Injectable()
export class OrganisationService {
    public constructor(
        private readonly logger: ClassLogger,
        private readonly organisationRepo: OrganisationRepository,
    ) {}

    private async logCreation(
        permissions: IPersonPermissions,
        organisation: Organisation<boolean>,
        error?: Error,
    ): Promise<void> {
        if (organisation.typ === OrganisationsTyp.KLASSE) {
            if (organisation.zugehoerigZu) {
                const school: Option<Organisation<true>> = await this.organisationRepo.findById(
                    organisation.zugehoerigZu,
                );
                const schoolName: string = school?.name ?? 'SCHOOL_NOT_FOUND';
                if (error) {
                    this.logger.error(
                        `Admin: ${permissions.personFields.id}) hat versucht eine neue Klasse ${organisation.name} (${schoolName}) anzulegen. Fehler: ${error.message}`,
                    );
                } else {
                    this.logger.info(
                        `Admin: ${permissions.personFields.id}) hat eine neue Klasse angelegt: ${organisation.name} (${schoolName}).`,
                    );
                }
            }
        }
        if (organisation.typ === OrganisationsTyp.SCHULE) {
            if (error) {
                this.logger.error(
                    `Admin: ${permissions.personFields.id}) hat versucht eine neue Schule ${organisation.name} anzulegen. Fehler: ${error.message}`,
                );
            } else {
                this.logger.info(
                    `Admin: ${permissions.personFields.id}) hat eine neue Schule angelegt: ${organisation.name}.`,
                );
            }
        }
    }

    private async logUpdate(
        permissions: IPersonPermissions,
        organisation: Organisation<boolean>,
        error?: Error,
    ): Promise<void> {
        if (organisation.typ === OrganisationsTyp.KLASSE) {
            if (organisation.zugehoerigZu) {
                const school: Option<Organisation<true>> = await this.organisationRepo.findById(
                    organisation.zugehoerigZu,
                );
                let schoolName: string = 'SCHOOL_NOT_FOUND';
                if (school) {
                    if (school.name) {
                        schoolName = school.name;
                    }
                }

                if (error) {
                    this.logger.error(
                        `Admin: ${permissions.personFields.id}) hat versucht eine Klasse ${organisation.name} (${schoolName}) zu verändern. Fehler: ${error.message}`,
                    );
                } else {
                    this.logger.info(
                        `Admin: ${permissions.personFields.id}) hat eine Klasse geändert: ${organisation.name} (${schoolName}).`,
                    );
                }
            }
        }
        if (organisation.typ === OrganisationsTyp.SCHULE) {
            if (error) {
                this.logger.error(
                    `Admin: ${permissions.personFields.id}) hat versucht eine Schule ${organisation.name} zu verändern. Fehler: ${error.message}`,
                );
            } else {
                this.logger.info(
                    `Admin: ${permissions.personFields.id}) hat eine Schule geändert: ${organisation.name}.`,
                );
            }
        }
    }

    public async createOrganisation(
        organisationDo: Organisation<false>,
        permissions: IPersonPermissions,
    ): Promise<Result<Organisation<true>, DomainError>> {
        if (organisationDo.administriertVon && !(await this.organisationRepo.exists(organisationDo.administriertVon))) {
            const error: DomainError = new EntityNotFoundError('Organisation', organisationDo.administriertVon);
            await this.logCreation(permissions, organisationDo, error);
            return {
                ok: false,
                error: error,
            };
        }

        if (organisationDo.zugehoerigZu && !(await this.organisationRepo.exists(organisationDo.zugehoerigZu))) {
            const error: DomainError = new EntityNotFoundError('Organisation', organisationDo.zugehoerigZu);
            await this.logCreation(permissions, organisationDo, error);
            return {
                ok: false,
                error: error,
            };
        }

        const validationFieldnamesResult: void | DomainError = this.validateFieldNames(organisationDo);
        if (validationFieldnamesResult) {
            const error: DomainError = validationFieldnamesResult;
            await this.logCreation(permissions, organisationDo, error);
            return { ok: false, error: error };
        }

        let validationResult: Result<void, DomainError> = await this.validateKennungRequiredForSchule(organisationDo);
        if (!validationResult.ok) {
            const error: DomainError = validationResult.error;
            await this.logCreation(permissions, organisationDo, error);
            return { ok: false, error: error };
        }
        validationResult = await this.validateNameRequiredForSchule(organisationDo);
        if (!validationResult.ok) {
            const error: DomainError = validationResult.error;
            await this.logCreation(permissions, organisationDo, error);
            return { ok: false, error: error };
        }
        validationResult = await this.validateSchuleKennungUnique(organisationDo);
        if (!validationResult.ok) {
            const error: DomainError = validationResult.error;
            await this.logCreation(permissions, organisationDo, error);
            return { ok: false, error: error };
        }
        validationResult = await this.validateEmailAdressOnOrganisationTyp(organisationDo);
        if (!validationResult.ok) {
            const error: DomainError = validationResult.error;
            await this.logCreation(permissions, organisationDo, error);
            return { ok: false, error: error };
        }

        const validateKlassen: Result<boolean, DomainError> = await this.validateKlassenSpecifications(organisationDo);
        if (!validateKlassen.ok) {
            const error: DomainError = validateKlassen.error;
            await this.logCreation(permissions, organisationDo, error);
            return { ok: false, error: error };
        }

        const validateSchultraeger: Result<void, DomainError> =
            await this.validateSchultraegerSpecifications(organisationDo);
        if (!validateSchultraeger.ok) {
            const error: DomainError = validateSchultraeger.error;
            await this.logCreation(permissions, organisationDo, error);
            return { ok: false, error: error };
        }

        const organisation: Organisation<true> | OrganisationSpecificationError =
            await this.organisationRepo.save(organisationDo);
        if (organisation instanceof Organisation) {
            await this.logCreation(permissions, organisation);
            return { ok: true, value: organisation };
        }

        const error: DomainError = new EntityCouldNotBeCreated(`Organization could not be created`);
        await this.logCreation(permissions, organisationDo, error);
        return { ok: false, error: error };
    }

    public async updateOrganisation(
        organisationDo: Organisation<true>,
        permissions: IPersonPermissions,
    ): Promise<Result<Organisation<true>, DomainError>> {
        const storedOrganisation: Option<Organisation<true>> = await this.organisationRepo.findById(organisationDo.id);
        if (!storedOrganisation) {
            const error: DomainError = new EntityNotFoundError('Organisation', organisationDo.id);
            await this.logUpdate(permissions, organisationDo, error);
            return { ok: false, error: error };
        }

        const validationFieldnamesResult: void | DomainError = this.validateFieldNames(organisationDo);
        if (validationFieldnamesResult) {
            const error: DomainError = validationFieldnamesResult;
            await this.logUpdate(permissions, organisationDo, error);
            return { ok: false, error: error };
        }

        let validationResult: Result<void, DomainError> = await this.validateKennungRequiredForSchule(organisationDo);
        if (!validationResult.ok) {
            const error: DomainError = validationResult.error;
            await this.logUpdate(permissions, organisationDo, error);
            return { ok: false, error: error };
        }
        validationResult = await this.validateNameRequiredForSchule(organisationDo);
        if (!validationResult.ok) {
            const error: DomainError = validationResult.error;
            await this.logUpdate(permissions, organisationDo, error);
            return { ok: false, error: error };
        }
        validationResult = await this.validateSchuleKennungUnique(organisationDo);
        if (!validationResult.ok) {
            const error: DomainError = validationResult.error;
            await this.logUpdate(permissions, organisationDo, error);
            return { ok: false, error: error };
        }
        validationResult = await this.validateEmailAdressOnOrganisationTyp(organisationDo);
        if (!validationResult.ok) {
            const error: DomainError = validationResult.error;
            await this.logUpdate(permissions, organisationDo, error);
            return { ok: false, error: error };
        }

        const validateKlassen: Result<boolean, DomainError> = await this.validateKlassenSpecifications(organisationDo);
        if (!validateKlassen.ok) {
            const error: DomainError = validateKlassen.error;
            await this.logUpdate(permissions, organisationDo, error);
            return { ok: false, error: error };
        }

        const organisation: Organisation<true> | OrganisationSpecificationError =
            await this.organisationRepo.save(organisationDo);
        if (organisation instanceof Organisation) {
            await this.logUpdate(permissions, organisation);
            return { ok: true, value: organisation };
        }

        const error: DomainError = new EntityCouldNotBeUpdated(`Organization could not be updated`, organisationDo.id);
        await this.logUpdate(permissions, organisationDo, error);
        return {
            ok: false,
            error: error,
        };
    }

    private async validateEmailAdressOnOrganisationTyp(
        organisation: Organisation<boolean>,
    ): Promise<Result<void, DomainError>> {
        const emailAdressOnOrganisationTyp: EmailAdressOnOrganisationTyp = new EmailAdressOnOrganisationTyp();
        if (!(await emailAdressOnOrganisationTyp.isSatisfiedBy(organisation))) {
            return { ok: false, error: new EmailAdressOnOrganisationTypError() };
        }
        return { ok: true, value: undefined };
    }

    private async validateKennungRequiredForSchule(
        organisation: Organisation<boolean>,
    ): Promise<Result<void, DomainError>> {
        const kennungRequiredForSchule: KennungRequiredForSchule = new KennungRequiredForSchule();
        if (!(await kennungRequiredForSchule.isSatisfiedBy(organisation))) {
            return { ok: false, error: new KennungRequiredForSchuleError() };
        }

        return { ok: true, value: undefined };
    }

    private async validateNameRequiredForSchule(
        organisation: Organisation<boolean>,
    ): Promise<Result<void, DomainError>> {
        const nameRequiredForSchule: NameRequiredForSchule = new NameRequiredForSchule();
        if (!(await nameRequiredForSchule.isSatisfiedBy(organisation))) {
            return { ok: false, error: new NameRequiredForSchuleError() };
        }

        return { ok: true, value: undefined };
    }

    private async validateSchuleKennungUnique(organisation: Organisation<boolean>): Promise<Result<void, DomainError>> {
        const schuleKennungEindeutig: SchuleKennungEindeutig = new SchuleKennungEindeutig(this.organisationRepo);
        if (!(await schuleKennungEindeutig.isSatisfiedBy(organisation))) {
            return { ok: false, error: new SchuleKennungEindeutigError() };
        }

        return { ok: true, value: undefined };
    }

    public async findOrganisationById(id: string): Promise<Result<Organisation<true>, DomainError>> {
        const organisation: Option<Organisation<true>> = await this.organisationRepo.findById(id);
        if (organisation) {
            return { ok: true, value: organisation };
        }
        return { ok: false, error: new EntityNotFoundError('Organization', id) };
    }

    public async setZugehoerigZu(
        parentId: string,
        childId: string,
        permissions: IPersonPermissions,
    ): Promise<Result<void, DomainError>> {
        const orgas: Map<OrganisationID, Organisation<true>> = await this.organisationRepo.findByIds([
            childId,
            parentId,
        ]);

        const childOrga: Option<Organisation<true>> = orgas.get(childId);
        const newParentOrga: Option<Organisation<true>> = orgas.get(parentId);

        if (!childOrga || !childOrga.zugehoerigZu) {
            return {
                ok: false,
                error: new EntityNotFoundError('Organisation', childId),
            };
        }

        if (!newParentOrga) {
            return {
                ok: false,
                error: new EntityNotFoundError('Organisation', parentId),
            };
        }

        // Check Systemrechte
        const hasSystemrechteAtParentOrgas: boolean = await Promise.all([
            permissions.hasSystemrechtAtOrganisation(childOrga.zugehoerigZu, RollenSystemRecht.SCHULTRAEGER_VERWALTEN), // Check at old parent
            permissions.hasSystemrechtAtOrganisation(parentId, RollenSystemRecht.SCHULTRAEGER_VERWALTEN), // Check at new parent
        ]).then((v: boolean[]) => v.every(Boolean));

        if (!hasSystemrechteAtParentOrgas) {
            return {
                ok: false,
                error: new MissingPermissionsError('Not allowed to edit organisations'),
            };
        }

        // Check child orga type
        if (childOrga.typ !== OrganisationsTyp.SCHULE) {
            return {
                ok: false,
                error: new OrganisationZuordnungVerschiebenError(childId, childOrga.typ),
            };
        }

        // MUST be called before zugehoerigZu is altered
        const validationResult: Result<boolean, DomainError> = await this.validateZugehoerigZu(
            childOrga,
            newParentOrga,
        );
        if (!validationResult.ok) {
            return { ok: false, error: validationResult.error };
        }

        childOrga.zugehoerigZu = parentId;

        try {
            await this.organisationRepo.save(childOrga);
            return { ok: true, value: undefined };
        } catch (e) {
            this.logger.logUnknownAsError('Could not update organisation', e);
            return { ok: false, error: new EntityCouldNotBeUpdated('Organisation', childId) };
        }
    }

    private async validateZugehoerigZu(
        childOrganisation: Organisation<true>,
        parentOrganisation: Organisation<true>,
    ): Promise<Result<boolean, OrganisationSpecificationError>> {
        //check version from DB before zugehoerigZu is altered
        const organisationsOnSameSubtree: boolean = await new OrganisationsOnSameSubtree(
            this.organisationRepo,
        ).isSatisfiedBy([childOrganisation, parentOrganisation]);
        if (!organisationsOnSameSubtree) {
            return {
                ok: false,
                error: new OrganisationsOnDifferentSubtreesError(),
            };
        }

        childOrganisation.zugehoerigZu = parentOrganisation.id;

        const validateStructureSpecifications: Result<boolean, OrganisationSpecificationError> =
            await this.validateStructureSpecifications(childOrganisation);
        if (!validateStructureSpecifications.ok) {
            return { ok: false, error: validateStructureSpecifications.error };
        }

        return { ok: true, value: true };
    }

    private async validateKlassenSpecifications(
        childOrganisation: Organisation<boolean>,
    ): Promise<Result<boolean, OrganisationSpecificationError>> {
        const klasseNurVonSchuleAdministriert: KlasseNurVonSchuleAdministriert = new KlasseNurVonSchuleAdministriert(
            this.organisationRepo,
        );
        if (!(await klasseNurVonSchuleAdministriert.isSatisfiedBy(childOrganisation))) {
            return { ok: false, error: new KlasseNurVonSchuleAdministriertError(childOrganisation.id ?? undefined) };
        }
        const klassenNameAnSchuleEindeutig: KlassenNameAnSchuleEindeutig = new KlassenNameAnSchuleEindeutig(
            this.organisationRepo,
        );
        if (!(await klassenNameAnSchuleEindeutig.isSatisfiedBy(childOrganisation))) {
            return { ok: false, error: new KlassenNameAnSchuleEindeutigError(childOrganisation.id ?? undefined) };
        }
        return { ok: true, value: true };
    }

    private async validateSchultraegerSpecifications(
        organisationDo: Organisation<false>,
    ): Promise<Result<void, DomainError>> {
        // Only validate for Schulträger
        if (organisationDo.typ !== OrganisationsTyp.TRAEGER) {
            return { ok: true, value: undefined };
        }

        const traegerUnterRootChild: TraegerUnterRootChild<false> = new TraegerUnterRootChild(this.organisationRepo);
        if (!(await traegerUnterRootChild.isSatisfiedBy(organisationDo))) {
            return { ok: false, error: new TraegerUnterRootChildError(organisationDo.id ?? undefined) };
        }

        const traegerNameUniqueInSubtree: TraegerNameUniqueInSubtree<false> = new TraegerNameUniqueInSubtree(
            this.organisationRepo,
        );
        if (!(await traegerNameUniqueInSubtree.isSatisfiedBy(organisationDo))) {
            return { ok: false, error: new SchultraegerNameEindeutigError(organisationDo.id ?? undefined) };
        }

        return { ok: true, value: undefined };
    }

    private async validateStructureSpecifications(
        childOrganisation: Organisation<true>,
    ): Promise<Result<boolean, OrganisationSpecificationError>> {
        const schuleUnterTraeger: SchuleUnterTraeger = new SchuleUnterTraeger(this.organisationRepo);
        if (!(await schuleUnterTraeger.isSatisfiedBy(childOrganisation))) {
            return { ok: false, error: new SchuleUnterTraegerError(childOrganisation.id) };
        }
        const zyklusInOrganisationen: ZyklusInOrganisationen = new ZyklusInOrganisationen(this.organisationRepo);
        if (await zyklusInOrganisationen.isSatisfiedBy(childOrganisation)) {
            return { ok: false, error: new ZyklusInOrganisationenError(childOrganisation.id) };
        }
        return { ok: true, value: true };
    }

    private validateFieldNames(organisation: Organisation<boolean>): void | OrganisationSpecificationError {
        if (
            organisation.name &&
            organisation.typ === OrganisationsTyp.KLASSE &&
            !NameValidator.hasLetterOrNumber(organisation.name)
        ) {
            return new KlasseWithoutNumberOrLetterError();
        }

        if (organisation.name && !NameValidator.isNameValid(organisation.name)) {
            return new NameForOrganisationWithTrailingSpaceError();
        }

        if (organisation.kennung && !NameValidator.isNameValid(organisation.kennung)) {
            return new KennungForOrganisationWithTrailingSpaceError();
        }

        return undefined;
    }

    public async findAllAdministriertVon(
        parentOrganisationID: string,
        searchFilter?: string,
        offset?: number,
        limit?: number,
    ): Promise<Paged<Organisation<true>>> {
        const scope: OrganisationScope = new OrganisationScope()
            .setScopeWhereOperator(ScopeOperator.AND)
            .findAdministrierteVon(parentOrganisationID)
            .searchStringAdministriertVon(searchFilter)
            .paged(offset, limit);

        const [organisations, total]: Counted<Organisation<true>> = await this.organisationRepo.findBy(scope);

        return {
            total,
            offset: offset ?? 0,
            limit: limit ?? total,
            items: organisations,
            pageTotal: organisations.length,
        };
    }

    public async findAllZugehoerigZu(
        parentOrganisationID: string,
        offset?: number,
        limit?: number,
    ): Promise<Paged<Organisation<true>>> {
        const scope: OrganisationScope = new OrganisationScope()
            .findZugehoerigeZu(parentOrganisationID)
            .paged(offset, limit);

        const [organisations, total]: Counted<Organisation<true>> = await this.organisationRepo.findBy(scope);

        return {
            total,
            offset: offset ?? 0,
            limit: limit ?? total,
            items: organisations,
            pageTotal: organisations.length,
        };
    }

    public async findOrganisationByIdAndAnyMatchingPermissions(
        permissions: IPersonPermissions,
        organisationId: OrganisationID,
    ): Promise<Result<Organisation<true>, EntityNotFoundError | MissingPermissionsError>> {
        const [organisations]: [Organisation<true>[], total: number, pageTotal: number] =
            await this.organisationRepo.findAuthorized(
                permissions,
                [
                    RollenSystemRecht.SCHULTRAEGER_VERWALTEN,
                    RollenSystemRecht.SCHULEN_VERWALTEN,
                    RollenSystemRecht.KLASSEN_VERWALTEN,
                ],
                { organisationIds: [organisationId], limit: 1, matchAllSystemrechte: false },
            );
        const organisation: Option<Organisation<true>> = organisations[0];
        if (organisation?.id !== organisationId) {
            return { ok: false, error: new EntityNotFoundError('Organisation', organisationId) };
        }

        const systemrecht: Option<RollenSystemRecht> = this.findSystemRechtForOrganisationsTyp(organisation.typ);
        if (!systemrecht) {
            return {
                ok: false,
                error: new MissingPermissionsError('Permission to manage organisation does not exist'),
            };
        }

        if (await permissions.hasSystemrechtAtOrganisation(organisationId, systemrecht)) {
            return {
                ok: true,
                value: organisation,
            };
        } else {
            return { ok: false, error: new MissingPermissionsError('Not permitted to manage organisation') };
        }
    }

    private findSystemRechtForOrganisationsTyp(typ?: OrganisationsTyp): Option<RollenSystemRecht> {
        switch (typ) {
            case OrganisationsTyp.TRAEGER:
                return RollenSystemRecht.SCHULTRAEGER_VERWALTEN;
            case OrganisationsTyp.SCHULE:
                return RollenSystemRecht.SCHULEN_VERWALTEN;
            case OrganisationsTyp.KLASSE:
                return RollenSystemRecht.KLASSEN_VERWALTEN;
            default:
                return;
        }
    }
}
