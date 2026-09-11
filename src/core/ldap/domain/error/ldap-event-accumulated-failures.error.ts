import { DomainError } from '../../../../shared/error/domain.error.js';

export class LdapEventAccumulatedFailuresError extends DomainError {
    public constructor(failureReasons: string[], details?: unknown[] | Record<string, unknown>) {
        super(failureReasons.join(', '), 'LDAP_EVENT_ACCUMULATED_FAILURES', details);
    }
}
