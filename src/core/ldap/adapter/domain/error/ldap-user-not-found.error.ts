import { DomainError } from '../../../../../shared/error/domain.error.js';

export class LdapUserNotFoundError extends DomainError {
    public constructor(username: string, details?: unknown[] | Record<string, unknown>) {
        super(`User not found: ${username}`, 'LDAP_USER_NOT_FOUND', details);
    }
}
