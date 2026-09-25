import { DomainError } from '../../../../../../shared/error/domain.error.js';

export class LdapDeleteGroupError extends DomainError {
    public constructor(groupId: string, details?: unknown[] | Record<string, undefined>) {
        super(`LDAP delete for group ${groupId} FAILED`, 'LDAP_DELETE_FAILED', details);
    }
}
