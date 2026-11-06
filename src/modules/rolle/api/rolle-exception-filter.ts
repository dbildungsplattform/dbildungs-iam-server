import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { DbiamRolleError, RolleErrorI18nTypes } from './dbiam-rolle.error.js';
import { RolleDomainError } from '../domain/rolle-domain.error.js';
import { RolleHatPersonenkontexteError } from '../domain/rolle-hat-personenkontexte.error.js';
import { UpdateMerkmaleError } from '../domain/update-merkmale.error.js';
import { NameForRolleWithTrailingSpaceError } from '../domain/name-with-trailing-space.error.js';
import { RolleUpdateOutdatedError } from '../domain/update-outdated.error.js';
import { RolleNameNotUniqueOnSskError } from '../specification/error/rolle-name-not-unique-on-ssk.error.js';
import { ServiceProviderNichtNachtraeglichZuweisbarError } from '../specification/error/service-provider-nicht-nachtraeglich-zuweisbar.error.js';
import { ServiceProviderNichtVerfuegbarFuerRollenerweiterungError } from '../specification/error/service-provider-nicht-verfuegbar-fuer-rollenerweiterung.error.js';
import { NoRedundantRollenerweiterungError } from '../specification/error/no-redundant-rollenerweiterung.error.js';
import { ServiceProviderProvidedOutOfTreeError } from '../domain/service-provider-provided-out-of-tree.error.js';
import { RollenartNotAllowedForSPError } from '../domain/rollenart-not-allowed-for-sp.error.js';

@Catch(RolleDomainError)
export class RolleExceptionFilter implements ExceptionFilter<RolleDomainError> {
    private ERROR_MAPPINGS: Map<string, DbiamRolleError> = new Map([
        [
            RolleHatPersonenkontexteError.name,
            new DbiamRolleError({
                code: 400,
                i18nKey: RolleErrorI18nTypes.ROLLE_HAT_PERSONENKONTEXTE_ERROR,
            }),
        ],
        [
            UpdateMerkmaleError.name,
            new DbiamRolleError({
                code: 400,
                i18nKey: RolleErrorI18nTypes.UPDATE_MERKMALE_ERROR,
            }),
        ],
        [
            NameForRolleWithTrailingSpaceError.name,
            new DbiamRolleError({
                code: 400,
                i18nKey: RolleErrorI18nTypes.ROLLENNAME_ENTHAELT_LEERZEICHEN,
            }),
        ],
        [
            RolleUpdateOutdatedError.name,
            new DbiamRolleError({
                code: 400,
                i18nKey: RolleErrorI18nTypes.NEWER_VERSION_OF_ROLLE_AVAILABLE,
            }),
        ],
        [
            RolleNameNotUniqueOnSskError.name,
            new DbiamRolleError({
                code: 400,
                i18nKey: RolleErrorI18nTypes.ROLLE_NAME_UNIQUE_ON_SSK,
            }),
        ],
        [
            RollenartNotAllowedForSPError.name,
            new DbiamRolleError({
                code: 400,
                i18nKey: RolleErrorI18nTypes.ROLLENART_NOT_ALLOWED_FOR_SERVICE_PROVIDER,
            }),
        ],
        [
            ServiceProviderNichtNachtraeglichZuweisbarError.name,
            new DbiamRolleError({
                code: 400,
                i18nKey: RolleErrorI18nTypes.SERVICE_PROVIDER_NICHT_NACHTRAEGLICH_ZUWEISBAR,
            }),
        ],
        [
            NoRedundantRollenerweiterungError.name,
            new DbiamRolleError({
                code: 400,
                i18nKey: RolleErrorI18nTypes.NO_REDUNDANT_ROLLENERWEITERUNG,
            }),
        ],
        [
            ServiceProviderNichtVerfuegbarFuerRollenerweiterungError.name,
            new DbiamRolleError({
                code: 400,
                i18nKey: RolleErrorI18nTypes.SERVICE_PROVIDER_NICHT_VERFUEGBAR_FUER_ROLLENERWEITERUNG,
            }),
        ],
        [
            ServiceProviderProvidedOutOfTreeError.name,
            new DbiamRolleError({
                code: 400,
                i18nKey: RolleErrorI18nTypes.SERVICE_PROVIDER_PROVIDED_OUT_OF_TREE,
            }),
        ],
    ]);

    public catch(exception: RolleDomainError, host: ArgumentsHost): void {
        const ctx: ReturnType<ArgumentsHost['switchToHttp']> = host.switchToHttp();
        const response: Response = ctx.getResponse<Response>();

        const dbiamRolleError: DbiamRolleError = this.mapDomainErrorToDbiamError(exception);

        response.status(dbiamRolleError.code);
        response.json(dbiamRolleError);
    }

    private mapDomainErrorToDbiamError(error: RolleDomainError): DbiamRolleError {
        return (
            this.ERROR_MAPPINGS.get(error.constructor.name) ??
            new DbiamRolleError({
                code: 500,
                i18nKey: RolleErrorI18nTypes.ROLLE_ERROR,
            })
        );
    }
}
