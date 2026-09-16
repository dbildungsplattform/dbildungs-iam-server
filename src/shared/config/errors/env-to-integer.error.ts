import { DomainError } from '../../error/domain.error.js';

export class EnvToIntegerError extends DomainError {
    public constructor(key: string, value: string, details?: unknown[] | Record<string, undefined>) {
        super(
            `Expected environment variable "${key}" to be a valid integer, received "${value}".`,
            'ENV_TO_INTEGER_ERROR',
            details,
        );
    }
}
