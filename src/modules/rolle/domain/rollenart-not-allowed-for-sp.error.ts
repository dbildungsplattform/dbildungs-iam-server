import { type RollenArt } from './rolle.enums.js';
import { RolleDomainError } from './rolle-domain.error.js';

export class RollenartNotAllowedForSPError extends RolleDomainError {
    public constructor(rollenart: RollenArt, serviceProviderId: string) {
        super('Rollenart not allowed for Service provider', serviceProviderId, [rollenart, serviceProviderId]);
    }
}
