import { DomainError } from './domain.error.js';

export class SchulconnexPushError extends DomainError {
    public constructor(message: string, details?: unknown[] | Record<string, unknown>) {
        super(message, 'SCHULCONNEX_PUSH_ERROR', details);
    }
}
