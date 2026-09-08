import { SharedDomainError } from './shared-domain.error.js';

export class ExceedsLimitError extends SharedDomainError {
    public constructor(message: string, details?: unknown[] | Record<string, unknown>) {
        super(message, 'EXCEEDS_LIMIT', details);
    }
}
