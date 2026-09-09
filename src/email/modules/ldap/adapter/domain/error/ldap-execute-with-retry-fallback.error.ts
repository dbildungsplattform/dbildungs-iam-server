import { DomainError } from '../../../../../../shared/error/domain.error.js';

export class LdapExecuteWithRetryFallbackError extends DomainError {
    public constructor(details?: unknown[] | Record<string, undefined>) {
        super('LDAP execute with retry fallback', 'LDAP_EXECUTE_WITH_RETRY_FALLBACK', details);
    }
}
