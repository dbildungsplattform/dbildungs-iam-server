import { DomainError } from '../../../shared/error/domain.error.js';

export class InstanceOfErrorStringError extends DomainError {
    public constructor(details?: unknown[] | Record<string, undefined>) {
        super(
            'Type of parameter was String when calling instanceOfError, that may not have been intentional',
            'INSTANCE_OF_ERROR_STRING',
            details,
        );
    }
}
