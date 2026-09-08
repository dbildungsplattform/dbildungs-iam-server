import { SharedDomainError } from './shared-domain.error.js';

export class EntityCouldNotBeCreated extends SharedDomainError {
    public constructor(entityName: string, details?: unknown[] | Record<string, unknown>) {
        super(`${entityName} could not be created`, 'ENTITY_COULD_NOT_BE_CREATED', details);
    }
}
