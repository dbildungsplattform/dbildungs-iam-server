import { type RollenArt, type RollenMerkmal } from '../../../modules/rolle/domain/rolle.enums.js';
import { type RollenSystemRechtEnum } from '../../../modules/rolle/domain/systemrecht.js';

export class RolleFile {
    public id?: number;

    public overrideId?: string;

    public name!: string;

    public administeredBySchulstrukturknoten!: number;

    public rollenart!: RollenArt;

    public merkmale!: RollenMerkmal[];

    public systemrechte!: RollenSystemRechtEnum[];

    public serviceProviderIds!: number[];

    public istTechnisch?: boolean;
}
