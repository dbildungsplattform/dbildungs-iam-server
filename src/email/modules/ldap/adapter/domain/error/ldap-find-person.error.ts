import { DomainError } from '../../../../../../shared/error/domain.error.js';

export class LdapFindPersonError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super(`LDAP error: Finding lehrer FAILED`, 'LDAP_LEHRER_SEARCH_FAILED', details);
    }
}
