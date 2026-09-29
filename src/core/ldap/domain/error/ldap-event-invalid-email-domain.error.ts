import { DomainError } from '../../../../shared/error/domain.error.js';

export class LdapEventInvalidEmailDomainError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super('Invalid email domain', 'LDAP_EVENT_INVALID_EMAIL_DOMAIN', details);
    }
}
