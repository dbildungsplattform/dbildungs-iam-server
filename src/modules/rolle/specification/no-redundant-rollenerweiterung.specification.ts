import { Rolle } from '../domain/rolle.js';
import { Rollenerweiterung } from '../domain/rollenerweiterung.js';

export class NoRedundantRollenerweiterung {
    public isSatisfiedBy(rollenerweiterung: Rollenerweiterung<boolean>, rolle: Rolle<true>): boolean {
        return !rolle.serviceProviderIds.includes(rollenerweiterung.serviceProviderId);
    }
}
