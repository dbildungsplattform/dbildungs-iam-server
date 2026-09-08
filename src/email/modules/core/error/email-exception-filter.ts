import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { EmailServerCommunicationInternalError } from '../../../../shared/error/email-server-communication-internal.error.js';
import { DomainError } from '../../../../shared/error/index.js';
import { EmailAddressGenerationAttemptsExceededError } from './email-address-generation-attempts-exceeds.error.js';
import { EmailAddressNotFoundError } from './email-address-not-found.error.js';
import { EmailCreationFailedError } from './email-creaton-failed.error.js';
import { EmailDomainNotFoundError } from './email-domain-not-found.error.js';
import { ExternalIdMigrationDbFailedError } from './external-id-migration-db-failed.error.js';
import { ExternalIdMigrationLdapFailedError } from './external-id-migration-ldap-failed.error.js';
import { ExternalIdMigrationOxFailedError } from './external-id-migration-ox-failed.error.js';
import { InconsistentExternalIdForPersonError } from './inconsistent-external-id-for-person.error.js';
import { InconsistentOxUserCounterForPersonError } from './inconsistent-ox-user-counter-for-person.error.js';
import { NoEmailAddressesForPersonError } from './no-email-addresses-for-person.error.js';

@Catch(
    EmailDomainNotFoundError,
    EmailAddressNotFoundError,
    EmailAddressGenerationAttemptsExceededError,
    NoEmailAddressesForPersonError,
    ExternalIdMigrationOxFailedError,
    ExternalIdMigrationLdapFailedError,
    ExternalIdMigrationDbFailedError,
    InconsistentExternalIdForPersonError,
    InconsistentOxUserCounterForPersonError,
)
export class EmailExceptionFilter implements ExceptionFilter<DomainError> {
    private readonly ERROR_MAPPINGS: Map<string, EmailServerCommunicationInternalError> = new Map([
        [
            EmailDomainNotFoundError.name,
            new EmailServerCommunicationInternalError({
                code: 404,
                emailErrorCode: 'EMAIL_DOMAIN_NOT_FOUND',
            }),
        ],
        [
            EmailAddressNotFoundError.name,
            new EmailServerCommunicationInternalError({
                code: 404,
                emailErrorCode: 'EMAIL_ADDRESS_NOT_FOUND',
            }),
        ],
        [
            EmailAddressGenerationAttemptsExceededError.name,
            new EmailServerCommunicationInternalError({
                code: 400,
                emailErrorCode: 'EMAIL_ADDRESS_GENERATION_ATTEMPTS_EXCEEDED',
            }),
        ],
        [
            EmailCreationFailedError.name,
            new EmailServerCommunicationInternalError({
                code: 500,
                emailErrorCode: 'UNKNOWN_ERROR',
            }),
        ],
        [
            NoEmailAddressesForPersonError.name,
            new EmailServerCommunicationInternalError({
                code: 404,
                emailErrorCode: 'NO_EMAIL_ADDRESSES_FOR_PERSON',
            }),
        ],
        [
            ExternalIdMigrationOxFailedError.name,
            new EmailServerCommunicationInternalError({
                code: 500,
                emailErrorCode: 'EXTERNAL_ID_MIGRATION_OX_FAILED',
            }),
        ],
        [
            InconsistentExternalIdForPersonError.name,
            new EmailServerCommunicationInternalError({
                code: 409,
                emailErrorCode: 'INCONSISTENT_EXTERNAL_ID_FOR_PERSON',
            }),
        ],
        [
            InconsistentOxUserCounterForPersonError.name,
            new EmailServerCommunicationInternalError({
                code: 409,
                emailErrorCode: 'INCONSISTENT_OX_USER_COUNTER_FOR_PERSON',
            }),
        ],
    ]);

    // Kept separate from the static map because the emailErrorCode depends on the rollback outcome carried by the error instance
    private mapMigrationErrorWithRollbackState(
        error: ExternalIdMigrationLdapFailedError | ExternalIdMigrationDbFailedError,
        fallbackCode: 'EXTERNAL_ID_MIGRATION_LDAP_FAILED' | 'EXTERNAL_ID_MIGRATION_DB_FAILED',
    ): EmailServerCommunicationInternalError {
        const isInconsistent: boolean = error.code === 'EXTERNAL_ID_MIGRATION_INCONSISTENT_STATE';

        return new EmailServerCommunicationInternalError({
            code: 500,
            emailErrorCode: isInconsistent ? 'EXTERNAL_ID_MIGRATION_INCONSISTENT_STATE' : fallbackCode,
        });
    }

    public catch(exception: DomainError, host: ArgumentsHost): void {
        const ctx: ReturnType<ArgumentsHost['switchToHttp']> = host.switchToHttp();
        const response: Response = ctx.getResponse<Response>();

        const emailError: EmailServerCommunicationInternalError = this.mapDomainErrorToEmailError(exception);

        response.status(emailError.code);
        response.json(emailError);
    }

    private mapDomainErrorToEmailError(error: DomainError): EmailServerCommunicationInternalError {
        if (error instanceof ExternalIdMigrationLdapFailedError) {
            return this.mapMigrationErrorWithRollbackState(error, 'EXTERNAL_ID_MIGRATION_LDAP_FAILED');
        }
        if (error instanceof ExternalIdMigrationDbFailedError) {
            return this.mapMigrationErrorWithRollbackState(error, 'EXTERNAL_ID_MIGRATION_DB_FAILED');
        }

        return (
            this.ERROR_MAPPINGS.get(error.constructor.name) ??
            new EmailServerCommunicationInternalError({
                code: 500,
                emailErrorCode: 'UNKNOWN_ERROR',
            })
        );
    }
}
