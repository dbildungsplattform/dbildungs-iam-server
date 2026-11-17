import { OrganisationSpecificationError } from '../../error/organisation-specification.error.js';
import { OrganisationSpecificationErrorI18nTypes } from '../../../api/dbiam-organisation.error.js';

export class SchultraegerSchuleUndTraegerSelberBaumError extends OrganisationSpecificationError {
    public constructor(entityId?: string, details?: unknown[] | Record<string, undefined>) {
        super(
            `Organisation with ID ${entityId} could not be updated because it violates ${OrganisationSpecificationErrorI18nTypes.SCHULTRAEGER_SCHULE_UND_TRAEGER_SELBER_BAUM} specification`,
            entityId,
            details,
        );
    }
}
