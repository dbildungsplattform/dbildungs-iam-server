import { RollenArt } from '../../../modules/rolle/domain/rolle.enums.js';
import {
    ServiceProviderKategorie,
    ServiceProviderMerkmal,
    ServiceProviderSystem,
    ServiceProviderTarget,
} from '../../../modules/service-provider/domain/service-provider.enum.js';

export class ServiceProviderFile {
    public id!: number;

    public overrideId?: string;

    public name!: string;

    public target!: ServiceProviderTarget;

    public url?: string;

    public providedOnSchulstrukturknoten!: number;

    public kategorie!: ServiceProviderKategorie;

    public logoId?: number;

    public logoBase64?: string;

    public logoMimeType?: string;

    public keycloakGroup?: string;

    public keycloakRole?: string;

    public externalSystem?: ServiceProviderSystem;

    public requires2fa!: boolean;

    public vidisAngebotId?: string;

    public keycloakClient?: string;

    public merkmale?: ServiceProviderMerkmal[];

    public rollenartenWhitelist?: RollenArt[];
}
