import { DomainError } from '../../../../../shared/error/index.js';
import { PersonID, PersonUsername } from '../../../../../shared/types/aggregate-ids.types.js';

export class LdapFetchGroupsError extends DomainError {
    public constructor(
        personId: PersonID | undefined,
        username: PersonUsername,
        details?: unknown[] | Record<string, unknown>,
    ) {
        super(
            `LDAP: Fetching groups failed, personId:${personId}, username:${username}`,
            'LDAP_FETCH_GROUPS_ERROR',
            details,
        );
    }
}
