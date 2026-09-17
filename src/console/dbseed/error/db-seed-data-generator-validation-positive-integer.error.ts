import { DomainError } from '../../../shared/error/domain.error.js';

export class DbSeedDataGeneratorValidationPositiveIntegerError extends DomainError {
    public constructor(fieldname: string, details?: unknown[] | Record<string, unknown>) {
        super(
            `The value for ${fieldname} must be at least 0.`,
            'DB_SEED_DATA_GENERATOR_OPTIONS_VALIDATION_ERROR',
            details,
        );
    }
}
