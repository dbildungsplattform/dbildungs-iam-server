import { CompositeSpecification } from '../../specification/specifications.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { Organisation } from '../domain/organisation.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';

export class SchuleUnterTraeger extends CompositeSpecification<Organisation<true>> {
    public constructor(private readonly organisationRepo: OrganisationRepository) {
        super();
    }

    public async isSatisfiedBy(t: Organisation<true>): Promise<boolean> {
        if (t.typ !== OrganisationsTyp.SCHULE) {
            return true;
        }
        return (await this.validateAdministriertVon(t)) && (await this.validateZugehoerigZu(t));
    }

    // Schools can only be administered by LAND
    private async validateAdministriertVon(t: Organisation<true>): Promise<boolean> {
        if (!t.administriertVon) {
            return false;
        }
        const parent: Option<Organisation<true>> = await this.organisationRepo.findById(t.administriertVon);
        if (!parent) {
            return false;
        }
        return parent.isLand();
    }

    // Schools can belong to LAND or TRAEGER
    private async validateZugehoerigZu(t: Organisation<true>): Promise<boolean> {
        if (!t.zugehoerigZu) {
            return false;
        }
        const parent: Option<Organisation<true>> = await this.organisationRepo.findById(t.zugehoerigZu);
        if (!parent) {
            return false;
        }
        return parent.typ === OrganisationsTyp.TRAEGER || parent.isLand();
    }
}
