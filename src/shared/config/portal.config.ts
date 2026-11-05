import { IsArray, IsEnum } from 'class-validator';
import { RollenArt } from '../../modules/rolle/domain/rolle.enums.js';

export class PortalConfig {
    @IsArray()
    @IsEnum(RollenArt, { each: true })
    public readonly EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN_ROLLENART_ALLOWLIST_EXCEPT_MPT!: RollenArt[];
}
