import { OrganisationSpecificationError } from './organisation-specification.error.js';

export class RelationshipSearchUnsupportedOrganisationTypeError extends OrganisationSpecificationError {
    public constructor(organisationId: string, organisationType: string) {
        super(`Organisation type ${organisationType} does not support relationship candidate search`, organisationId);
    }
}
