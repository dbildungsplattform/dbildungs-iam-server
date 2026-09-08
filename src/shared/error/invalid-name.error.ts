import { SharedDomainError } from './shared-domain.error.js';

export class InvalidNameError extends SharedDomainError {
    public constructor(message: string, details?: unknown[] | Record<string, unknown>) {
        super(`the name is invalid: ${message}`, 'INVALID_NAME_ERROR', details);
    }
}
