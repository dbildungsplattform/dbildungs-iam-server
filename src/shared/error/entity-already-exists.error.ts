import { SharedDomainError } from './shared-domain.error.js';

export class EntityAlreadyExistsError extends SharedDomainError {
    public constructor(message: string, details?: unknown[] | Record<string, unknown>) {
        super(message, 'ENTITY_ALREADY_EXISTS', details);
    }
}
