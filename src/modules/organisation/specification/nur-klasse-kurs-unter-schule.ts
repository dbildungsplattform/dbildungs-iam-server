import { CompositeSpecification } from '../../specification/specifications.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';
import { type OrganisationRepository } from '../persistence/organisation.repository.js';

export class NurKlasseKursUnterSchule extends CompositeSpecification<Organisation<true>> {
    public constructor(private readonly organisationRepo: OrganisationRepository) {
        super();
    }

    public async isSatisfiedBy(t: Organisation<true>): Promise<boolean> {
        //if type is future type KLASSE or KURS
        if (
            t.typ === OrganisationsTyp.TRAEGER ||
            t.typ === OrganisationsTyp.SCHULE ||
            t.typ === OrganisationsTyp.SONSTIGE ||
            t.typ === OrganisationsTyp.UNBEST ||
            t.typ === OrganisationsTyp.ANBIETER
        ) {
            return (await this.validateAdministriertVon(t)) && (await this.validateZugehoerigZu(t));
        }
        return true;
    }

    private async validateAdministriertVon(t: Organisation<true>): Promise<boolean> {
        if (!t.administriertVon) {
            return true;
        }
        const parent: Option<Organisation<true>> = await this.organisationRepo.findById(t.administriertVon);
        if (!parent) {
            return true;
        }
        return !(parent.typ === OrganisationsTyp.SCHULE);
    }

    private async validateZugehoerigZu(t: Organisation<true>): Promise<boolean> {
        if (!t.zugehoerigZu) {
            return true;
        }
        const parent: Option<Organisation<true>> = await this.organisationRepo.findById(t.zugehoerigZu);
        if (!parent) {
            return true;
        }
        return !(parent.typ === OrganisationsTyp.SCHULE);
    }
}
