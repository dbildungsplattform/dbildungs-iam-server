import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { InvalidLogoCombinationError } from './errors/invalid-logo-combination.error.js';
import {
    ServiceProviderKategorie,
    ServiceProviderMerkmal,
    ServiceProviderSystem,
    ServiceProviderTarget,
} from './service-provider.enum.js';

const MERKMALE_REQUIRING_VERFUEGBAR_FUER_ROLLENERWEITERUNG: ServiceProviderMerkmal[] = [
    ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG,
    ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ROLLENVERWALTUNG,
];

export type ServiceProviderUpdateParams = Partial<
    Pick<ServiceProvider<true>, 'name' | 'url' | 'kategorie' | 'merkmale' | 'rollenartenWhitelist' | 'requires2fa'> & {
        logoId: Option<number>;
    }
>;

export class ServiceProvider<WasPersisted extends boolean> {
    protected constructor(
        public id: Persisted<string, WasPersisted>,
        public createdAt: Persisted<Date, WasPersisted>,
        public updatedAt: Persisted<Date, WasPersisted>,
        public name: string,
        public target: ServiceProviderTarget,
        public url: string | undefined,
        public kategorie: ServiceProviderKategorie,
        public providedOnSchulstrukturknoten: string,
        public logoId: number | undefined,
        public logo: Buffer | undefined,
        public logoMimeType: string | undefined,
        public keycloakGroup: string | undefined,
        public keycloakRole: string | undefined,
        public externalSystem: ServiceProviderSystem,
        public requires2fa: boolean,
        public vidisAngebotId: string | undefined,
        public merkmale: ServiceProviderMerkmal[],
        public rollenartenWhitelist: RollenArt[],
    ) {
        this.merkmale = ServiceProvider.removeDependentMerkmaleWithoutVerfuegbarFuerRollenerweiterung(merkmale);
    }

    public static construct<WasPersisted extends boolean = false>(
        id: string,
        createdAt: Date,
        updatedAt: Date,
        name: string,
        target: ServiceProviderTarget,
        url: string | undefined,
        kategorie: ServiceProviderKategorie,
        providedOnSchulstrukturknoten: string,
        logoId: number | undefined,
        logo: Buffer | undefined,
        logoMimeType: string | undefined,
        keycloakGroup: string | undefined,
        keycloakRole: string | undefined,
        externalSystem: ServiceProviderSystem,
        requires2fa: boolean,
        vidisAngebotId: string | undefined,
        merkmale: ServiceProviderMerkmal[],
        rollenartenWhitelist: RollenArt[],
    ): ServiceProvider<WasPersisted> {
        return new ServiceProvider(
            id,
            createdAt,
            updatedAt,
            name,
            target,
            url,
            kategorie,
            providedOnSchulstrukturknoten,
            logoId,
            logo,
            logoMimeType,
            keycloakGroup,
            keycloakRole,
            externalSystem,
            requires2fa,
            vidisAngebotId,
            merkmale,
            rollenartenWhitelist,
        );
    }

    public static createNew(
        name: string,
        target: ServiceProviderTarget,
        url: string | undefined,
        kategorie: ServiceProviderKategorie,
        providedOnSchulstrukturknoten: string,
        logoId: number | undefined,
        logo: Buffer | undefined,
        logoMimeType: string | undefined,
        keycloakGroup: string | undefined,
        keycloakRole: string | undefined,
        externalSystem: ServiceProviderSystem,
        requires2fa: boolean,
        vidisAngebotId: string | undefined,
        merkmale: ServiceProviderMerkmal[],
        rollenartenWhitelist: RollenArt[],
    ): ServiceProvider<false> {
        return new ServiceProvider(
            undefined,
            undefined,
            undefined,
            name,
            target,
            url,
            kategorie,
            providedOnSchulstrukturknoten,
            logoId,
            logo,
            logoMimeType,
            keycloakGroup,
            keycloakRole,
            externalSystem,
            requires2fa,
            vidisAngebotId,
            merkmale,
            rollenartenWhitelist,
        );
    }

    /** logoId can be set to null to clear it. Unsafe fields (kategorie, merkmale, rollenartenWhitelist, requires2fa) require caller to have checked permissions. */
    public update(update: ServiceProviderUpdateParams): Option<InvalidLogoCombinationError> {
        if (!ServiceProvider.isValidLogoCombination(update.logoId, this.logo, this.logoMimeType)) {
            return new InvalidLogoCombinationError('Cannot set logoId, if there already is a logo');
        }
        if (update.logoId === null) {
            this.logoId = undefined;
        } else if (update.logoId !== undefined) {
            this.logoId = update.logoId;
        }
        if (update.name !== undefined) {
            this.name = update.name;
        }
        if (update.url !== undefined) {
            this.url = update.url;
        }
        if (update.kategorie !== undefined) {
            this.kategorie = update.kategorie;
        }
        if (update.merkmale !== undefined) {
            this.merkmale = ServiceProvider.removeDependentMerkmaleWithoutVerfuegbarFuerRollenerweiterung(
                update.merkmale,
            );
        }
        if (update.rollenartenWhitelist !== undefined) {
            this.rollenartenWhitelist = update.rollenartenWhitelist;
        }
        if (update.requires2fa !== undefined) {
            this.requires2fa = update.requires2fa;
        }
        return;
    }

    public static isValidLogoCombination(
        logoId: Option<number>,
        logo: Option<Buffer>,
        logoMimeType: Option<string>,
    ): boolean {
        const logoIdProvided: boolean = logoId !== undefined && logoId !== null;
        const logoProvided: boolean = logo !== undefined && logo !== null;
        const logoMimeTypeProvided: boolean = logoMimeType !== undefined && logoMimeType !== null;

        const validLogoIdCombination: boolean = logoIdProvided && !logoProvided && !logoMimeTypeProvided;
        const validLogoDataCombination: boolean = !logoIdProvided && logoProvided && logoMimeTypeProvided;
        const noLogoCombination: boolean = !logoIdProvided && !logoProvided && !logoMimeTypeProvided;
        return validLogoIdCombination || validLogoDataCombination || noLogoCombination;
    }

    private static removeDependentMerkmaleWithoutVerfuegbarFuerRollenerweiterung(
        merkmale: ServiceProviderMerkmal[],
    ): ServiceProviderMerkmal[] {
        if (merkmale.includes(ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG)) {
            return merkmale;
        }

        return merkmale.filter(
            (merkmal: ServiceProviderMerkmal) =>
                !MERKMALE_REQUIRING_VERFUEGBAR_FUER_ROLLENERWEITERUNG.includes(merkmal),
        );
    }
}
