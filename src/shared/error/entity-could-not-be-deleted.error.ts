import { SharedDomainError } from './shared-domain.error.js';

export class EntityCouldNotBeDeleted extends SharedDomainError {
    public constructor(entityName: string, entityId: string, details?: unknown[] | Record<string, unknown>) {
        super(`${entityName} with ID ${entityId} could not be deleted`, 'ENTITY_COULD_NOT_BE_DELETED', details);
    }
}
