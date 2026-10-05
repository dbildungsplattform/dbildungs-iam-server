import { IsArray, IsEnum } from 'class-validator';
import { RollenArt } from '../../modules/rolle/domain/rolle.enums.js';

export class PortalConfig {
    @IsArray()
    @IsEnum(RollenArt, { each: true })
    public readonly LIMITED_ROLLENART_ALLOWLIST!: RollenArt[];
}
