import { DomainError } from '../../../../../shared/error/domain.error.js';

export class LdapExecuteWithRetryError extends DomainError {
    public constructor(message: string, details?: unknown[] | Record<string, unknown>) {
        super(`Function returned error: ${message}`, 'LDAP_EXECUTE_WITH_RETRY_ERROR', details);
    }
}
