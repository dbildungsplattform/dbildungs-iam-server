import { DomainError } from "../../../../../shared/error/domain.error.js";

export class LdapBindError extends DomainError {
    public constructor(details?: unknown[] | Record<string, undefined>) {
        super('LDAP bind FAILED',  'LDAP_BIND_FAILED', details);
    }
}
