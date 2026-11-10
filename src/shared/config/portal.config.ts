import { IsArray, IsEnum } from 'class-validator';
import { RollenArt } from '../../modules/rolle/domain/rolle.enums.js';

export class PortalConfig {
    @IsArray()
    @IsEnum(RollenArt, { each: true })
    public readonly ROLLENART_ALLOWLIST_FUER_SYSTEMRECHT_EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN!: RollenArt[];
}
