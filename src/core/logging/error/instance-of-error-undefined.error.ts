import { DomainError } from '../../../shared/error/domain.error.js';

export class InstanceOfErrorUndefinedError extends DomainError {
    public constructor(details?: unknown[] | Record<string, undefined>) {
        super('Parameter was UNDEFINED when calling instanceOfError', 'INSTANCE_OF_ERROR_UNDEFINED', details);
    }
}
