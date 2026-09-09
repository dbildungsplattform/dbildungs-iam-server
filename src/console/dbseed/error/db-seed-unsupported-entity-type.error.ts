import { DomainError } from '../../../shared/error/domain.error.js';

export class DbSeedUnsupportedEntityTypeError extends DomainError {
    public constructor(entityName: string, details?: unknown[] | Record<string, unknown>) {
        super(`Unsupported EntityName / EntityType: ${entityName}`, 'DB_SEED_UNSUPPORTED_ENTITY_TYPE_ERROR', {
            entityName,
            details,
        });
    }
}
