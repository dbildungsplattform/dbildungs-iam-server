import { DomainError } from '../../error/domain.error.js';

export class EnvToBooleanError extends DomainError {
    public constructor(key: string, value: string, details?: unknown[] | Record<string, undefined>) {
        super(
            `Expected environment variable "${key}" to be "true" or "false", received "${value}".`,
            'ENV_TO_BOOLEAN_ERROR',
            details,
        );
    }
}
