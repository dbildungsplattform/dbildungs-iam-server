import { DomainError } from '../../../../../../shared/error/domain.error.js';

export class LdapAddPersonToGroupError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super(`LDAP error: Adding person from group FAILED`, 'LDAP_ADD_PERSON_TO_GROUP_FAILED', details);
    }
}
