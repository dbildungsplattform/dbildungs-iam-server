import { CompositeSpecification } from '../../specification/specifications.js';
import { type Rolle } from '../domain/rolle.js';
import { type Rollenerweiterung } from '../domain/rollenerweiterung.js';

export class NoRedundantRollenerweiterung extends CompositeSpecification<Rollenerweiterung<boolean>> {
    public constructor() {
        super();
    }

    public async isSatisfiedBy(rollenerweiterung: Rollenerweiterung<boolean>): Promise<boolean> {
        const rolle: Option<Rolle<true>> = await rollenerweiterung.getRolle();
        if (!rolle) {
            return false;
        }
        if (rolle.serviceProviderIds.includes(rollenerweiterung.serviceProviderId)) {
            return false;
        }
        return true;
    }
}
