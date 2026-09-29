import { DomainError } from '../../error/domain.error.js';

export class ScopeBaseNestedError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super(
            'Scope where operator is already set. Scope Operator can not be nested',
            'SCOPE_BASE_NESTED_ERROR',
            details,
        );
    }
}
