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
import { OrganisationRefResponse } from './organisation-ref.response.js';
import { RolleRefResponse } from './rolle-ref.response.js';
import { RollenSystemRecht, RollenSystemRechtEnum } from '../../rolle/domain/systemrecht.js';

export class ManageableServiceProviderResponse {
    @ApiProperty()
    public id: string;

    @ApiProperty()
    public name: string;

    @ApiProperty({ type: OrganisationRefResponse })
    public administrationsebene: OrganisationRefResponse;

    @ApiProperty({ enum: ServiceProviderKategorie, enumName: ServiceProviderKategorieTypName })
    public kategorie: ServiceProviderKategorie;

    @ApiProperty({ description: 'Optional logoId for use with standard logos' })
    public logoId?: number;

    @ApiProperty()
    public requires2fa: boolean;

    @ApiProperty({ required: false })
    public vidisAngebotId?: string;

    @ApiProperty({ enum: ServiceProviderMerkmal, enumName: ServiceProviderMerkmalTypName, isArray: true })
    public merkmale: ServiceProviderMerkmal[];

    @ApiProperty({ enum: RollenArt, enumName: RollenArtTypName, isArray: true })
    public rollenartenWhitelist: RollenArt[];

    @ApiProperty({ description: 'Can be undefined, if `target` is not equal to `URL`' })
    public url?: string;

    @ApiProperty()
    public hasRollenerweiterung: boolean;

    @ApiProperty({ description: 'Indicates whether the service provider is available for rollenerweiterung.' })
    public availableForRollenerweiterung: boolean;

    @ApiProperty({ type: RolleRefResponse, isArray: true })
    public rollen: RolleRefResponse[];

    @ApiProperty({ enum: RollenSystemRechtEnum, isArray: true })
    public relevantSystemrechte: RollenSystemRechtEnum[];

    public constructor(
        serviceProvider: ServiceProvider<true>,
        organisation: Organisation<true>,
        rollen: Rolle<true>[],
        hasRollenerweiterung: boolean,
        relevantSystemrechte: RollenSystemRecht[],
    ) {
        this.id = serviceProvider.id;
        this.name = serviceProvider.name;
        this.administrationsebene = {
            id: organisation.id,
            name: organisation.name ?? '',
            kennung: organisation.kennung,
        };
        this.kategorie = serviceProvider.kategorie;
        this.logoId = serviceProvider.logoId;
        this.requires2fa = serviceProvider.requires2fa;
        this.vidisAngebotId = serviceProvider.vidisAngebotId;
        this.merkmale = serviceProvider.merkmale;
        this.rollenartenWhitelist = serviceProvider.rollenartenWhitelist;
        this.url = serviceProvider.url;
        this.hasRollenerweiterung = hasRollenerweiterung;
        this.availableForRollenerweiterung = serviceProvider.merkmale.includes(
            ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
        );
        this.rollen = rollen.map((r: Rolle<true>) => ({ id: r.id, name: r.name }));
        this.relevantSystemrechte = relevantSystemrechte.map((recht: RollenSystemRecht) => recht.name);
    }
}
