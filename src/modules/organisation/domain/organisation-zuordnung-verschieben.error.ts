import { OrganisationSpecificationError } from '../specification/error/organisation-specification.error.js';
import { type OrganisationsTyp } from './organisation.enums.js';

export class OrganisationZuordnungVerschiebenError extends OrganisationSpecificationError {
    public constructor(orgaId: string, typ?: OrganisationsTyp, details?: unknown[] | Record<string, undefined>) {
        super(`Organisation of type ${typ} can not be moved`, orgaId, details);
    }
}
