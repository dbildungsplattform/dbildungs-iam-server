import { DomainError } from "../../../../shared/error/domain.error.js";

export class LdapEventOrganisationWithoutKennungError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super('Organisation has no Kennung', 'LDAP_EVENT_ORGANISATION_WITHOUT_KENNUNG', details);
    }
}
