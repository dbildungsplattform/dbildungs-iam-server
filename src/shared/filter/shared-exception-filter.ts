import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { DbiamSharedError, SharedErrorI18nTypes } from '../error/dbiam-shared.error.js';
import { ExceedsLimitError } from '../error/exceeds-limit.error.js';
import {
    EmailMicroserviceCommunicationError,
    EntityAlreadyExistsError,
    EntityCouldNotBeCreated,
    EntityCouldNotBeDeleted,
    EntityCouldNotBeUpdated,
    EntityNotFoundError,
    InvalidAttributeLengthError,
    InvalidCharacterSetError,
    InvalidNameError,
    KeycloakClientError,
    MismatchedRevisionError,
    MissingPermissionsError,
    MultipleRollenartenError,
    PersonAlreadyExistsError,
    SharedDomainError,
} from '../error/index.js';
import { MissingAttributeError } from '../error/missing-attribute.error.js';
import { UserExternalDataWorkflowError } from '../error/user-externaldata-workflow.error.js';

@Catch(SharedDomainError)
export class SharedExceptionFilter implements ExceptionFilter<SharedDomainError> {
    private ERROR_MAPPINGS: Map<string, DbiamSharedError> = new Map([
        [
            EntityCouldNotBeCreated.name,
            new DbiamSharedError({
                code: 500,
                i18nKey: SharedErrorI18nTypes.ENTITY_COULD_NOT_BE_CREATED,
            }),
        ],
        [
            EntityCouldNotBeUpdated.name,
            new DbiamSharedError({
                code: 500,
                i18nKey: SharedErrorI18nTypes.ENTITY_COULD_NOT_BE_UPDATED,
            }),
        ],
        [
            EntityCouldNotBeDeleted.name,
            new DbiamSharedError({
                code: 500,
                i18nKey: SharedErrorI18nTypes.ENTITY_COULD_NOT_BE_DELETED,
            }),
        ],
        [
            EntityNotFoundError.name,
            new DbiamSharedError({
                code: 404,
                i18nKey: SharedErrorI18nTypes.ENTITY_NOT_FOUND,
            }),
        ],
        [
            KeycloakClientError.name,
            new DbiamSharedError({
                code: 500,
                i18nKey: SharedErrorI18nTypes.KEYCLOAK_CLIENT_ERROR,
            }),
        ],
        [
            MismatchedRevisionError.name,
            new DbiamSharedError({
                code: 409,
                i18nKey: SharedErrorI18nTypes.MISMATCHED_REVISION,
            }),
        ],
        [
            PersonAlreadyExistsError.name,
            new DbiamSharedError({
                code: 400,
                i18nKey: SharedErrorI18nTypes.PERSON_ALREADY_EXISTS,
            }),
        ],
        [
            EntityAlreadyExistsError.name,
            new DbiamSharedError({
                code: 400,
                i18nKey: SharedErrorI18nTypes.ENTITY_ALREADY_EXISTS,
            }),
        ],
        [
            InvalidAttributeLengthError.name,
            new DbiamSharedError({
                code: 400,
                i18nKey: SharedErrorI18nTypes.INVALID_ATTRIBUTE_LENGTH,
            }),
        ],
        [
            InvalidCharacterSetError.name,
            new DbiamSharedError({
                code: 400,
                i18nKey: SharedErrorI18nTypes.INVALID_CHARACTER_SET,
            }),
        ],
        [
            InvalidNameError.name,
            new DbiamSharedError({
                code: 400,
                i18nKey: SharedErrorI18nTypes.INVALID_NAME,
            }),
        ],
        [
            MissingAttributeError.name,
            new DbiamSharedError({
                code: 400,
                i18nKey: SharedErrorI18nTypes.MISSING_ATTRIBUTE,
            }),
        ],
        [
            MissingPermissionsError.name,
            new DbiamSharedError({
                code: 404,
                i18nKey: SharedErrorI18nTypes.MISSING_PERMISSIONS,
            }),
        ],
        [
            ExceedsLimitError.name,
            new DbiamSharedError({
                code: 400,
                i18nKey: SharedErrorI18nTypes.EXCEEDS_LIMIT,
            }),
        ],
        [
            UserExternalDataWorkflowError.name,
            new DbiamSharedError({
                code: 500,
                i18nKey: SharedErrorI18nTypes.USER_EXTERNAL_DATA_WORKFLOW_ERROR,
            }),
        ],
        [
            EmailMicroserviceCommunicationError.name,
            new DbiamSharedError({
                code: 500,
                i18nKey: SharedErrorI18nTypes.EMAIL_MICROSERVICE_COMMUNICATION_ERROR,
            }),
        ],
        [
            MultipleRollenartenError.name,
            new DbiamSharedError({
                code: 400,
                i18nKey: SharedErrorI18nTypes.MULTIPLE_ROLLENARTEN,
            }),
        ],
    ]);

    public catch(exception: SharedDomainError, host: ArgumentsHost): void {
        const ctx: ReturnType<ArgumentsHost['switchToHttp']> = host.switchToHttp();
        const response: Response = ctx.getResponse<Response>();

        const dbiamSharedError: DbiamSharedError = this.mapDomainErrorToDbiamError(exception);

        response.status(dbiamSharedError.code);
        response.json(dbiamSharedError);
    }

    private mapDomainErrorToDbiamError(error: SharedDomainError): DbiamSharedError {
        return (
            this.ERROR_MAPPINGS.get(error.constructor.name) ??
            new DbiamSharedError({
                code: 500,
                i18nKey: SharedErrorI18nTypes.INTERNAL,
            })
        );
    }
}
