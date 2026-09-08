import { DomainError } from '../../../../shared/error/domain.error.js';

export class ExternalIdMigrationLdapFailedError extends DomainError {
    public constructor(
        spshPersonId: string,
        ownRollbackFailed: boolean,
        details?: unknown[] | Record<string, unknown>,
    ) {
        super(
            `Migrating externalId in LDAP for spshPersonId: ${spshPersonId} failed` +
                (ownRollbackFailed ? ', reverting OX also failed, manual cleanup required' : ', OX was reverted'),
            ownRollbackFailed ? 'EXTERNAL_ID_MIGRATION_INCONSISTENT_STATE' : 'EXTERNAL_ID_MIGRATION_LDAP_FAILED',
            details,
        );
    }
}
