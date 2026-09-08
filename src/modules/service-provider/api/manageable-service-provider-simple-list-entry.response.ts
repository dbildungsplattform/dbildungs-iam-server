import { ApiProperty } from '@nestjs/swagger';
import { Organisation } from '../../organisation/domain/organisation.js';
import { RollenArt, RollenArtTypName } from '../../rolle/domain/rolle.enums.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import {
    ServiceProviderKategorie,
    ServiceProviderKategorieTypName,
    ServiceProviderMerkmal,
    ServiceProviderMerkmalTypName,
} from '../domain/service-provider.enum.js';
import { ServiceProvider } from '../domain/service-provider.js';
import { ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount } from '../domain/types.js';
import { OrganisationRefResponse } from './organisation-ref.response.js';
import { RolleRefResponse } from './rolle-ref.response.js';

/**
 * Used for the service provider list that can be accessed by admins.
 * Only contains a flag that specifies wether some rollenerweiterungen exist.
 */
export class ManageableServiceProviderSimpleListEntryResponse {
    @ApiProperty()
    public id: string;

    @ApiProperty()
    public name: string;

    @ApiProperty({ type: OrganisationRefResponse })
    public administrationsebene: OrganisationRefResponse;

    @ApiProperty({ enum: ServiceProviderKategorie, enumName: ServiceProviderKategorieTypName })
    public kategorie: ServiceProviderKategorie;

    @ApiProperty()
    public requires2fa: boolean;

    @ApiProperty({ required: false })
    public vidisAngebotId?: string;

    @ApiProperty({ enum: ServiceProviderMerkmal, enumName: ServiceProviderMerkmalTypName, isArray: true })
    public merkmale: ServiceProviderMerkmal[];

    @ApiProperty({ enum: RollenArt, enumName: RollenArtTypName, isArray: true })
    public rollenartenWhitelist: RollenArt[];

    @ApiProperty()
    public hasRollenerweiterungen: boolean;

    @ApiProperty({ type: RolleRefResponse, isArray: true })
    public rollen: RolleRefResponse[];

    @ApiProperty()
    public hasSomeVerwaltenPermission: boolean;

    public constructor(
        serviceProvider: ServiceProvider<true>,
        organisation: Organisation<true>,
        rollen: Rolle<true>[],
        hasRollenerweiterungen: boolean,
        hasSomeVerwaltenPermission: boolean,
    ) {
        this.id = serviceProvider.id;
        this.name = serviceProvider.name;
        this.administrationsebene = {
            id: organisation.id,
            name: organisation.name ?? '',
            kennung: organisation.kennung,
        };
        this.kategorie = serviceProvider.kategorie;
        this.requires2fa = serviceProvider.requires2fa;
        this.vidisAngebotId = serviceProvider.vidisAngebotId;
        this.merkmale = serviceProvider.merkmale;
        this.rollenartenWhitelist = serviceProvider.rollenartenWhitelist;
        this.hasRollenerweiterungen = hasRollenerweiterungen;
        this.rollen = rollen.map((r: Rolle<true>) => ({ id: r.id, name: r.name }));
        this.hasSomeVerwaltenPermission = hasSomeVerwaltenPermission;
    }

    public static fromManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount(
        manageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount: ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount,
    ): ManageableServiceProviderSimpleListEntryResponse {
        return new ManageableServiceProviderSimpleListEntryResponse(
            manageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount.serviceProvider,
            manageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount.organisation,
            manageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount.rollen,
            manageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount.hasRollenerweiterungen,
            manageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount.hasSomeVerwaltenPermission,
        );
    }
}
