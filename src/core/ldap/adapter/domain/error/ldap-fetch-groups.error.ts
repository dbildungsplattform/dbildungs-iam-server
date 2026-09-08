import { DomainError } from '../../../../../shared/error/index.js';
import { PersonID, PersonUsername } from '../../../../../shared/types/aggregate-ids.types.js';

export class LdapFetchGroupsError extends DomainError {
    public constructor(
        username: PersonUsername,
        personId?: PersonID,
        details?: unknown[] | Record<string, unknown>,
    ) {
        const message: string = personId
            ? `LDAP: Fetching groups failed, personId:${personId}, username:${username}`
            : `LDAP: Error while searching for groups for person: ${username}`
        super(
            message,
            'LDAP_FETCH_GROUPS_ERROR',
            details,
        );
    }
}
