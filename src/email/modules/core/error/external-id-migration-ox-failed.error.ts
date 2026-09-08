import { DomainError } from '../../../../shared/error/domain.error.js';

export class ExternalIdMigrationOxFailedError extends DomainError {
    public constructor(spshPersonId: string, details?: unknown[] | Record<string, unknown>) {
        super(
            `Migrating externalId in OX for spshPersonId: ${spshPersonId} failed, no changes were made`,
            'EXTERNAL_ID_MIGRATION_OX_FAILED',
            details,
        );
    }
}
