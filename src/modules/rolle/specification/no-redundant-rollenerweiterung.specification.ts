import { type Rolle } from '../domain/rolle.js';
import { type Rollenerweiterung } from '../domain/rollenerweiterung.js';

export class NoRedundantRollenerweiterung {
    public isSatisfiedBy(rollenerweiterung: Rollenerweiterung<boolean>, rolle: Rolle<true>): boolean {
        return !rolle.serviceProviderIds.includes(rollenerweiterung.serviceProviderId);
    }
}
