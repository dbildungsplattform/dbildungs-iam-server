import { OrganisationSpecificationError } from '../../specification/error/organisation-specification.error.js';

export class OrganisationHasOrganisationsbeziehungenError extends OrganisationSpecificationError {
    public constructor(details?: unknown[] | Record<string, undefined>) {
        super(
            `Organisation Entity could not be deleted because it has organisational relationships`,
            undefined,
            details,
        );
    }
}
