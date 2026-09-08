import { DomainError } from "../../../../../shared/error/domain.error.js";

export class LdapGroupNotFound extends DomainError {
    public constructor(
        groupId: string,
        details?: unknown[] | Record<string, unknown>,
    ) {
        super(`LDAP: Group ${groupId} not found`, 'LDAP_GROUP_NOT_FOUND', details);
    }
}
