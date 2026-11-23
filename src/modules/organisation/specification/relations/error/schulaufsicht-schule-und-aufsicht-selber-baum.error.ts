import { OrganisationSpecificationError } from '../../error/organisation-specification.error.js';
import { OrganisationSpecificationErrorI18nTypes } from '../../../api/dbiam-organisation.error.js';

export class SchulaufsichtSchuleUndAufsichtSelberBaumError extends OrganisationSpecificationError {
    public constructor(entityId?: string, details?: unknown[] | Record<string, undefined>) {
        super(
            `Organisation with ID ${entityId} could not be updated because it violates ${OrganisationSpecificationErrorI18nTypes.SCHULAUFSICHT_SCHULE_UND_AUFSICHT_SELBER_BAUM} specification`,
            entityId,
            details,
        );
    }
}
