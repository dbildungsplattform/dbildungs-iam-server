import { DomainError } from '../../../shared/error/domain.error.js';

export class DbSeedNoDataError extends DomainError {
    public constructor(directory: string, details?: unknown[] | Record<string, unknown>) {
        super(`No seeding data in the directory ${directory}!`, 'DB_SEED_NO_DATA_ERROR', {
            directory,
            details,
        });
    }
}
