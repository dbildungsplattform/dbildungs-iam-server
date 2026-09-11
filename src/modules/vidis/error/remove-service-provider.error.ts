import { DomainError } from '../../../shared/error/domain.error.js';

export class RemoveServiceProviderUnknownError extends DomainError {
    public constructor(message: string, details?: unknown[] | Record<string, unknown>) {
        super(message, 'VIDIS_SYNC_REMOVE_SERVICE_PROVIDERS_MISSING_IN_VIDIS_UNKNOWN_ERROR', details);
    }
}
