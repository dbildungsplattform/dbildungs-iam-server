import { DomainError } from '../../../../../shared/error/index.js';

export class LdapUpdateGroupError extends DomainError {
    public constructor(
        groupDn: string,
        details?: unknown[] | Record<string, unknown>,
    ) {
        super(
            `LDAP: Error while updating member data for group: ${groupDn}`,
            'LDAP_UPDATE_GROUPS_ERROR',
            details,
        );
    }
}
