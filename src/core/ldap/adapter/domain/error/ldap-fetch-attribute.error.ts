import { DomainError } from '../../../../../shared/error/index.js';
import { type PersonID, type PersonUsername } from '../../../../../shared/types/aggregate-ids.types.js';

export class LdapFetchAttributeError extends DomainError {
    public constructor(
        attributeName: string,
        username: PersonUsername,
        personId: PersonID | undefined,
        details?: unknown[] | Record<string, unknown>,
    ) {
        super(
            `Error while fetching attribute:${attributeName}, username:${username}, personId:${personId}`,
            'LDAP_FETCH_ATTRIBUTE_ERROR',
            details,
        );
    }
}
