import { OrganisationSpecificationError } from './organisation-specification.error.js';

export class KennungOnlyForSchuleError extends OrganisationSpecificationError {
    public constructor() {
        super('Only organisations of type SCHULE can have a kennung', undefined);
    }
}
