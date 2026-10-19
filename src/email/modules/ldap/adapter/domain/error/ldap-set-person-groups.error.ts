import { DomainError } from '../../../../../../shared/error/domain.error.js';

export class LdapSetPersonGroupsError extends DomainError {
    public constructor(personDN: string, details?: unknown[] | Record<string, undefined>) {
        super(`LDAP adding/removing person ${personDN} to/from groups FAILED`, 'LDAP_SET_GROUPS_FAILED', details);
    }
}
