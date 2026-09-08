import { DomainError } from "../../../../../shared/error/domain.error.js";

export class LdapExecuteWithRetryFallbackError extends DomainError {
    public constructor(
        details?: unknown[] | Record<string, unknown>,
    ) {
        super('executeWithRetry default fallback', 'LDAP_EXECUTE_WITH_RETRY_FALLBACK_ERROR', details);
    }
}
