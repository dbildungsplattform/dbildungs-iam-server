import { DomainError } from '../../../../shared/error/domain.error.js';

export class LdapEventInvalidUemLdapOuError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super('Invalid UEM LDAP OU', 'LDAP_EVENT_INVALID_UEM_LDAP_OU', details);
    }
}
