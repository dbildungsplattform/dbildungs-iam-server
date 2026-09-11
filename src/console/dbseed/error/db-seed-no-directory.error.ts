import { DomainError } from '../../../shared/error/domain.error.js';

export class DbSeedNoDirectoryError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super(`No directory provided!`, 'DB_SEED_NO_DIRECTORY_PROVIDED_ERROR', details);
    }
}
