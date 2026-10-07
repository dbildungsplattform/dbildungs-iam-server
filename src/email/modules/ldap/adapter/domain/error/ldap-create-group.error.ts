import { DomainError } from '../../../../../../shared/error/domain.error.js';

export class LdapCreateGroupError extends DomainError {
    public constructor(groupId: string, details?: unknown[] | Record<string, undefined>) {
        super(`LDAP create for group ${groupId} FAILED`, 'LDAP_CREATE_FAILED', details);
    }
}
