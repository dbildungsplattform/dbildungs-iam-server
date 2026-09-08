import { SharedDomainError } from './shared-domain.error.js';

export class EntityNotFoundError extends SharedDomainError {
    public constructor(
        entityName: string = 'entity',
        id: string = 'ID',
        details?: unknown[] | Record<string, unknown>,
    ) {
        super(`requested ${entityName} with the following ID ${id} was not found`, 'ENTITY_NOT_FOUND', details);
    }
}
