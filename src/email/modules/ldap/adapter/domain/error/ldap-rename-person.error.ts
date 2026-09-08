import { DomainError } from '../../../../../../shared/error/domain.error.js';

export class LdapRenamePersonError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super(`LDAP error: Renaming person FAILED`, 'LDAP_PERSON_RENAME_FAILED', details);
    }
}
