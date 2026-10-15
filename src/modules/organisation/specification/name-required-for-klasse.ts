import { CompositeSpecification } from '../../specification/specifications.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';

export class NameRequiredForKlasse extends CompositeSpecification<Organisation<boolean>> {
    // eslint-disable-next-line @typescript-eslint/require-await
    public async isSatisfiedBy(t: Organisation<boolean>): Promise<boolean> {
        if (t.typ === OrganisationsTyp.KLASSE) {
            return !!t.name;
        } else {
            return true;
        }
    }
}
