import { SharedDomainError } from './shared-domain.error.js';

export class UserExternalDataWorkflowError extends SharedDomainError {
    public constructor(message: string, details?: unknown[] | Record<string, unknown>) {
        super(message, 'USER_EXTERNALDATA_WORKFLOW', details);
    }
}
