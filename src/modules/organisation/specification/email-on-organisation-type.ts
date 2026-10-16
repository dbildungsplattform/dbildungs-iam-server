import { CompositeSpecification } from '../../specification/specifications.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';

export class EmailAdressOnOrganisationTyp extends CompositeSpecification<Organisation<boolean>> {
    // eslint-disable-next-line @typescript-eslint/require-await
    public async isSatisfiedBy(t: Organisation<boolean>): Promise<boolean> {
        if (t.emailAdress && t.typ === OrganisationsTyp.KLASSE) {
            return false;
        } else {
            return true;
        }
    }
}
