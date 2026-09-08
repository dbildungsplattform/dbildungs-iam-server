import { DomainError } from '../../../../shared/error/domain.error.js';

export class ExternalIdMigrationDbFailedError extends DomainError {
    public constructor(
        spshPersonId: string,
        ownRollbackFailed: boolean,
        details?: unknown[] | Record<string, unknown>,
    ) {
        super(
            `Migrating externalId in DB for spshPersonId: ${spshPersonId} failed` +
                (ownRollbackFailed
                    ? ', reverting OX and/or LDAP also failed, manual cleanup required'
                    : ', OX and LDAP were reverted'),
            ownRollbackFailed ? 'EXTERNAL_ID_MIGRATION_INCONSISTENT_STATE' : 'EXTERNAL_ID_MIGRATION_DB_FAILED',
            details,
        );
    }
}
