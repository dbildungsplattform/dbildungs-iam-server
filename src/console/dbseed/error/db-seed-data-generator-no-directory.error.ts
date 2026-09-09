import { DomainError } from '../../../shared/error/domain.error.js';

export class DbSeedDataGeneratorNoDirectoryError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super(`No directory provided!`, 'DB_SEED_DATA_GENERATOR_NO_DIRECTORY_PROVIDED_ERROR', details);
    }
}
