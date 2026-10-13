import { DomainError } from '../../../../../../shared/error/domain.error.js';

export class LdapModifyGroupError extends DomainError {
    public constructor(groupId: string, details?: unknown[] | Record<string, undefined>) {
        super(`LDAP modify for group ${groupId} FAILED`, 'LDAP_MODIFY_FAILED', details);
    }
}
