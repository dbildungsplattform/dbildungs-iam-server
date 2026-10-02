import { DomainError } from '../../../../../shared/error/index.js';

export class UemLdapOuError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super(`LDAP error: Invalid uemLdapOu for organisation`, 'INVALID_UEM_LDAP_OU', details);
    }
}
