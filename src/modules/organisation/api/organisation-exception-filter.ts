import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { OrganisationUpdateOutdatedError } from '../domain/orga-update-outdated.error.js';
import { OrganisationIstBereitsZugewiesenError } from '../domain/organisation-ist-bereits-zugewiesen.error.js';
import { OrganisationZuordnungVerschiebenError } from '../domain/organisation-zuordnung-verschieben.error.js';
import { OrganisationHasChildrenError } from '../organisation-delete/errors/organisation-has-children.error.js';
import { OrganisationHasPersonenkontexteError } from '../organisation-delete/errors/organisation-has-personenkontexte.error.js';
import { OrganisationHasRollenError } from '../organisation-delete/errors/organisation-has-rollen.error.js';
import { OrganisationHasRollenerweiterungError } from '../organisation-delete/errors/organisation-has-rollenerweiterung.error.js';
import { OrganisationHasServiceProvidersError } from '../organisation-delete/errors/organisation-has-service-provider.error.js';
import { OrganisationHasZugehoerigeError } from '../organisation-delete/errors/organisation-has-zugehoerige.error.js';
import { BehoerdeAdministriertVonError } from '../specification/error/behoerde-administriert-von.error.js';
import { BehoerdeNameEindeutigError } from '../specification/error/behoerde-name-eindeutig.error.js';
import { EmailAdressOnOrganisationTypError } from '../specification/error/email-adress-on-organisation-typ-error.js';
import { KennungOnlyForSchuleError } from '../specification/error/kennung-only-for-schule.error.js';
import { KennungRequiredForSchuleError } from '../specification/error/kennung-required-for-schule.error.js';
import { KennungForOrganisationWithTrailingSpaceError } from '../specification/error/kennung-with-trailing-space.error.js';
import { KlasseNurVonSchuleAdministriertError } from '../specification/error/klasse-nur-von-schule-administriert.error.js';
import { KlassenNameAnSchuleEindeutigError } from '../specification/error/klassen-name-an-schule-eindeutig.error.js';
import { NameRequiredForKlasseError } from '../specification/error/name-required-for-klasse.error.js';
import { NameRequiredForSchuleError } from '../specification/error/name-required-for-schule.error.js';
import { NameForOrganisationWithTrailingSpaceError } from '../specification/error/name-with-trailing-space.error.js';
import { NurKlasseKursUnterSchuleError } from '../specification/error/nur-klasse-kurs-unter-schule.error.js';
import { OrganisationSpecificationError } from '../specification/error/organisation-specification.error.js';
import { OrganisationsOnDifferentSubtreesError } from '../specification/error/organisations-on-different-subtrees.error.js';
import { RootOrganisationImmutableError } from '../specification/error/root-organisation-immutable.error.js';
import { SchuleKennungEindeutigError } from '../specification/error/schule-kennung-eindeutig.error.js';
import { SchuleUnterTraegerError } from '../specification/error/schule-unter-traeger.error.js';
import { SchultraegerNameEindeutigError } from '../specification/error/SchultraegerNameEindeutigError.js';
import { TraegerInTraegerError } from '../specification/error/traeger-in-traeger.error.js';
import { ZyklusInOrganisationenError } from '../specification/error/zyklus-in-organisationen.error.js';
import { DbiamOrganisationError, OrganisationSpecificationErrorI18nTypes } from './dbiam-organisation.error.js';

@Catch(OrganisationSpecificationError)
export class OrganisationExceptionFilter implements ExceptionFilter<OrganisationSpecificationError> {
    private ERROR_MAPPINGS: Map<string, DbiamOrganisationError> = new Map([
        [
            KennungOnlyForSchuleError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.KENNUNG_ONLY_FOR_SCHULE,
            }),
        ],
        [
            BehoerdeNameEindeutigError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.BEHOERDE_NAME_EINDEUTIG,
            }),
        ],
        [
            BehoerdeAdministriertVonError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.BEHOERDE_ADMINISTRIERT_VON,
            }),
        ],
        [
            KennungRequiredForSchuleError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.KENNUNG_REQUIRED_FOR_SCHULE,
            }),
        ],
        [
            NameRequiredForSchuleError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.NAME_REQUIRED_FOR_SCHULE,
            }),
        ],
        [
            SchuleKennungEindeutigError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.SCHULE_KENNUNG_EINDEUTIG,
            }),
        ],
        [
            SchuleUnterTraegerError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.SCHULE_UNTER_TRAEGER,
            }),
        ],
        [
            TraegerInTraegerError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.TRAEGER_IN_TRAEGER,
            }),
        ],
        [
            NurKlasseKursUnterSchuleError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.NUR_KLASSE_UNTER_SCHULE,
            }),
        ],
        [
            ZyklusInOrganisationenError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.ZYKLUS_IN_ORGANISATION,
            }),
        ],
        [
            RootOrganisationImmutableError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.ROOT_ORGANISATION_IMMUTABLE,
            }),
        ],
        [
            KlasseNurVonSchuleAdministriertError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.KLASSE_NUR_VON_SCHULE_ADMINISTRIERT,
            }),
        ],
        [
            KlassenNameAnSchuleEindeutigError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.KLASSENNAME_AN_SCHULE_EINDEUTIG,
            }),
        ],
        [
            OrganisationIstBereitsZugewiesenError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.ORGANISATION_IST_BEREITS_ZUGEWIESEN_ERROR,
            }),
        ],
        [
            NameRequiredForKlasseError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.NAME_REQUIRED_FOR_KLASSE,
            }),
        ],
        [
            NameForOrganisationWithTrailingSpaceError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.NAME_ENTHAELT_LEERZEICHEN,
            }),
        ],
        [
            KennungForOrganisationWithTrailingSpaceError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.KENNUNG_ENTHAELT_LEERZEICHEN,
            }),
        ],
        [
            EmailAdressOnOrganisationTypError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.EMAIL_ADRESS_ON_ORGANISATION_TYP,
            }),
        ],
        [
            OrganisationUpdateOutdatedError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.NEWER_VERSION_ORGANISATION,
            }),
        ],
        [
            OrganisationZuordnungVerschiebenError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.ORGANISATION_ZUWEISUNG_FEHLER,
            }),
        ],
        [
            OrganisationsOnDifferentSubtreesError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.ORGANISATION_WECHSELT_TEILBAUM,
            }),
        ],
        [
            SchultraegerNameEindeutigError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.SCHULTRAEGER_NAME_EINDEUTIG,
            }),
        ],
        [
            OrganisationHasChildrenError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.ORGANISATION_HAT_KINDER,
            }),
        ],
        [
            OrganisationHasZugehoerigeError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.ORGANISATION_HAT_ZUGEHOERIGE,
            }),
        ],
        [
            OrganisationHasRollenError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.ORGANISATION_HAT_ROLLEN,
            }),
        ],
        [
            OrganisationHasPersonenkontexteError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.ORGANISATION_HAT_PERSONENKONTEXTE,
            }),
        ],
        [
            OrganisationHasServiceProvidersError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.ORGANISATION_HAT_ANGEBOTE,
            }),
        ],
        [
            OrganisationHasRollenerweiterungError.name,
            new DbiamOrganisationError({
                code: 400,
                i18nKey: OrganisationSpecificationErrorI18nTypes.ORGANISATION_HAT_ROLLENERWEITERUNGEN,
            }),
        ],
    ]);

    public catch(exception: OrganisationSpecificationError, host: ArgumentsHost): void {
        const ctx: ReturnType<ArgumentsHost['switchToHttp']> = host.switchToHttp();
        const response: Response = ctx.getResponse<Response>();
        const status: number = 400; //all errors regarding organisation specifications are BadRequests

        const dbiamOrganisationError: DbiamOrganisationError = this.mapDomainErrorToDbiamError(exception);

        response.status(status);
        response.json(dbiamOrganisationError);
    }

    private mapDomainErrorToDbiamError(error: OrganisationSpecificationError): DbiamOrganisationError {
        return (
            this.ERROR_MAPPINGS.get(error.constructor.name) ??
            new DbiamOrganisationError({
                code: 500,
                i18nKey: OrganisationSpecificationErrorI18nTypes.ORGANISATION_SPECIFICATION_ERROR,
            })
        );
    }
}
