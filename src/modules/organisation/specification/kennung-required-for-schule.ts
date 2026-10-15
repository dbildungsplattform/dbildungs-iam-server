import { CompositeSpecification } from '../../specification/specifications.js';

import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';

/**
 * `Kennung` is only required, if the organisation-type is `SCHULE`
 */
export class KennungRequiredForSchule extends CompositeSpecification<Organisation<boolean>> {
    // eslint-disable-next-line @typescript-eslint/require-await
    public async isSatisfiedBy(t: Organisation<boolean>): Promise<boolean> {
        if (t.typ === OrganisationsTyp.SCHULE) {
            return !!t.kennung;
        } else {
            return true;
        }
    }
}
