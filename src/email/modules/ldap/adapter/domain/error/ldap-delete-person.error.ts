import { DomainError } from "../../../../../../shared/error/domain.error.js";

export class LdapDeletePersonError extends DomainError {
    public constructor(details?: unknown[] | Record<string, undefined>) {
        super('LDAP delete FAILED',  'LDAP_DELETE_FAILED', details);
    }
}
