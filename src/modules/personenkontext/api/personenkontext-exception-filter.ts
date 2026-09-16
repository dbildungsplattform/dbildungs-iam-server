import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';

import { DuplicatePersonalnummerError } from '../../../shared/error/duplicate-personalnummer.error.js';
import { OrganisationMatchesRollenartError } from '../../rolle/domain/specification/error/organisation-matches-rollenart.error.js';
import { GleicheRolleAnKlasseWieSchuleError } from '../specification/error/gleiche-rolle-an-klasse-wie-schule.error.js';
import { NurLehrUndLernAnKlasseError } from '../specification/error/nur-lehr-und-lern-an-klasse.error.js';
import { PersonenkontextSpecificationError } from '../specification/error/personenkontext-specification.error.js';
import { RolleNurAnPassendeOrganisationError } from '../specification/error/rolle-nur-an-passende-organisation.js';
import {
    DbiamPersonenkontextError,
    PersonenkontextSpecificationErrorI18nTypes,
} from './dbiam-personenkontext.error.js';
import { PersonalnummerWithoutKoperspflichtError } from '../../../shared/error/personalnummer-without-koperspflicht.error.js';

@Catch(PersonenkontextSpecificationError, DuplicatePersonalnummerError, PersonalnummerWithoutKoperspflichtError)
export class PersonenkontextExceptionFilter implements ExceptionFilter<PersonenkontextSpecificationError> {
    private ERROR_MAPPINGS: Map<string, DbiamPersonenkontextError> = new Map([
        [
            NurLehrUndLernAnKlasseError.name,
            new DbiamPersonenkontextError({
                code: 400,
                i18nKey: PersonenkontextSpecificationErrorI18nTypes.NUR_LEHR_UND_LERN_AN_KLASSE,
            }),
        ],
        [
            GleicheRolleAnKlasseWieSchuleError.name,
            new DbiamPersonenkontextError({
                code: 400,
                i18nKey: PersonenkontextSpecificationErrorI18nTypes.GLEICHE_ROLLE_AN_KLASSE_WIE_SCHULE,
            }),
        ],
        [
            OrganisationMatchesRollenartError.name,
            new DbiamPersonenkontextError({
                code: 400,
                i18nKey: PersonenkontextSpecificationErrorI18nTypes.ORGANISATION_MATCHES_ROLLENART,
            }),
        ],
        [
            RolleNurAnPassendeOrganisationError.name,
            new DbiamPersonenkontextError({
                code: 400,
                i18nKey: PersonenkontextSpecificationErrorI18nTypes.ROLLE_NUR_AN_PASSENDE_ORGANISATION,
            }),
        ],
        [
            DuplicatePersonalnummerError.name,
            new DbiamPersonenkontextError({
                code: 400,
                i18nKey: PersonenkontextSpecificationErrorI18nTypes.PERSONALNUMMER_NICHT_EINDEUTIG,
            }),
        ],
        [
            PersonalnummerWithoutKoperspflichtError.name,
            new DbiamPersonenkontextError({
                code: 400,
                i18nKey: PersonenkontextSpecificationErrorI18nTypes.PERSON_HAT_KEINE_KOPERSPFLICHTIGE_ROLLE,
            })
        ]
    ]);

    public catch(exception: PersonenkontextSpecificationError, host: ArgumentsHost): void {
        const ctx: ReturnType<ArgumentsHost['switchToHttp']> = host.switchToHttp();
        const response: Response = ctx.getResponse<Response>();
        const status: number = 400; //all errors regarding organisation specifications are BadRequests

        const dbiamRolleError: DbiamPersonenkontextError = this.mapDomainErrorToDbiamError(exception);

        response.status(status);
        response.json(dbiamRolleError);
    }

    private mapDomainErrorToDbiamError(error: PersonenkontextSpecificationError): DbiamPersonenkontextError {
        return (
            this.ERROR_MAPPINGS.get(error.constructor.name) ??
            new DbiamPersonenkontextError({
                code: 500,
                i18nKey: PersonenkontextSpecificationErrorI18nTypes.PERSONENKONTEXT_SPECIFICATION_ERROR,
            })
        );
    }
}
