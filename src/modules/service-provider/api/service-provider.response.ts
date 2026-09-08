import { ApiProperty } from '@nestjs/swagger';
import { RollenArt, RollenArtTypName } from '../../rolle/domain/rolle.enums.js';

import {
    ServiceProviderKategorie,
    ServiceProviderKategorieTypName,
    ServiceProviderMerkmal,
    ServiceProviderMerkmalTypName,
    ServiceProviderTarget,
    ServiceProviderTargetTypName,
} from '../domain/service-provider.enum.js';
import { ServiceProvider } from '../domain/service-provider.js';

export class ServiceProviderResponse {
    @ApiProperty()
    public id: string;

    @ApiProperty()
    public name: string;

    @ApiProperty({ enum: ServiceProviderTarget, enumName: ServiceProviderTargetTypName })
    public target: ServiceProviderTarget;

    @ApiProperty({ description: 'Can be undefined, if `target` is not equal to `URL`', required: false })
    public url?: string;

    @ApiProperty({ enum: ServiceProviderKategorie, enumName: ServiceProviderKategorieTypName })
    public kategorie: ServiceProviderKategorie;

    @ApiProperty({ description: 'Optional logoId for use with standard logos', required: false })
    public logoId?: number;

    @ApiProperty({ description: 'Indicates if a custom logo is available for fetching', required: true })
    public hasLogo: boolean;

    @ApiProperty({ description: 'Indicates if 2FA is required', required: true })
    public requires2fa: boolean;

    @ApiProperty({ enum: ServiceProviderMerkmal, enumName: ServiceProviderMerkmalTypName, isArray: true })
    public merkmale: ServiceProviderMerkmal[];

    @ApiProperty({ enum: RollenArt, enumName: RollenArtTypName, isArray: true })
    public rollenartenWhitelist: RollenArt[];

    public constructor(serviceProvider: ServiceProvider<true>) {
        this.id = serviceProvider.id;
        this.name = serviceProvider.name;
        this.target = serviceProvider.target;
        this.url = serviceProvider.url;
        this.kategorie = serviceProvider.kategorie;
        this.logoId = serviceProvider.logoId;
        this.hasLogo = !!serviceProvider.logoMimeType; // serviceProvider.logo might not be loaded, so just check the mime-type
        this.requires2fa = serviceProvider.requires2fa;
        this.merkmale = serviceProvider.merkmale;
        this.rollenartenWhitelist = serviceProvider.rollenartenWhitelist;
    }
}
