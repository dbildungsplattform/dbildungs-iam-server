import { CompositeSpecification } from '../../specification/specifications.js';
import { type Organisation } from '../domain/organisation.js';
import { type OrganisationRepository } from '../persistence/organisation.repository.js';

export class ZyklusInOrganisationen extends CompositeSpecification<Organisation<true>> {
    public constructor(private readonly organisationRepo: OrganisationRepository) {
        super();
    }

    public async isSatisfiedBy(t: Organisation<true>): Promise<boolean> {
        return (await this.validateAdministriertVon(t, [])) || (await this.validateZugehoerigZu(t, []));
    }

    private async validateAdministriertVon(orga: Organisation<true>, list: Organisation<true>[]): Promise<boolean> {
        for (const item of list) {
            if (item.id === orga.id) {
                return true;
            }
        }
        if (orga.administriertVon) {
            const parent: Option<Organisation<true>> = await this.organisationRepo.findById(orga.administriertVon);
            if (parent) {
                list.push(orga);
                return this.validateAdministriertVon(parent, list);
            }
        }
        return false;
    }

    private async validateZugehoerigZu(orga: Organisation<true>, list: Organisation<true>[]): Promise<boolean> {
        for (const item of list) {
            if (item.id === orga.id) {
                return true;
            }
        }
        if (orga.zugehoerigZu) {
            const parent: Option<Organisation<true>> = await this.organisationRepo.findById(orga.zugehoerigZu);
            if (parent) {
                list.push(orga);
                return this.validateZugehoerigZu(parent, list);
            }
        }
        return false;
    }
}
