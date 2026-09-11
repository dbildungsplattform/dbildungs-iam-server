import { DomainError } from '../../shared/error/domain.error.js';

export class DbMigrationNameEndingError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super(`Not all migrations end with a S or D`, 'DB_MIGRATION_NAME_ENDING_ERROR', details);
    }
}
