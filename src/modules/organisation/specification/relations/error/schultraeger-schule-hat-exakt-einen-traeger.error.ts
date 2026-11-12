import { OrganisationSpecificationError } from '../../error/organisation-specification.error.js';
import { OrganisationSpecificationErrorI18nTypes } from '../../../api/dbiam-organisation.error.js';

export class SchultraegerSchuleHatExaktEinenTraegerError extends OrganisationSpecificationError {
    public constructor(entityId?: string, details?: unknown[] | Record<string, undefined>) {
        super(
            `Organisation with ID ${entityId} could not be updated because it violates ${OrganisationSpecificationErrorI18nTypes.SCHULTRAEGER_SCHULE_HAT_EXAKT_EINEN_TRAEGER} specification`,
            entityId,
            details,
        );
    }
}
