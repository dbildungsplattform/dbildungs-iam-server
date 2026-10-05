import { RollenArt } from './rolle.enums.js';
import { RollenerweiterungDomainError } from './rollenerweiterung-domain.error.js';

export class RollenartNotAllowedForSPError extends RollenerweiterungDomainError {
    public constructor(rollenart: RollenArt, serviceProviderId: string) {
        super('Rollenart not allowed for Service provider', serviceProviderId, [rollenart, serviceProviderId]);
    }
}
