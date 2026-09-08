import { SharedDomainError } from './shared-domain.error.js';

export class MissingAttributeError extends SharedDomainError {
    public constructor(message: string, details?: unknown[] | Record<string, unknown>) {
        super(message, 'MISSING_ATTRIBUTE', details);
    }
}
