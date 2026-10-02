import { DomainError } from '../../../../../../shared/error/domain.error.js';

export class LdapPersonInvalidDNError extends DomainError {
    public constructor(dn: string, details?: unknown[] | Record<string, unknown>) {
        super(`LDAP error: Could not parse person DN "${dn}"`, 'LDAP_PERSON_DN_PARSE', details);
    }
}
