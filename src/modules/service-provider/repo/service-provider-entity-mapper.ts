import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { ServiceProviderMerkmal } from '../domain/service-provider.enum.js';
import { ServiceProvider } from '../domain/service-provider.js';
import { ServiceProviderMerkmalEntity } from './service-provider-merkmal.entity.js';
import { ServiceProviderRollenartWhitelistEntity } from './service-provider-rollenart-whitelist.entity.js';
import { ServiceProviderEntity } from './service-provider.entity.js';

// Disable explicit types here because it's virtually impossible to do this correctly
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function mapAggregateToData(serviceProvider: ServiceProvider<boolean>) {
    // eslint-disable-next-line @typescript-eslint/typedef
    const merkmale = serviceProvider.merkmale.map((merkmal: ServiceProviderMerkmal) => ({
        serviceProvider: serviceProvider.id,
        merkmal,
    }));

    // eslint-disable-next-line @typescript-eslint/typedef
    const rollenartenWhitelist = serviceProvider.rollenartenWhitelist.map((rollenart: RollenArt) => ({
        serviceProvider: serviceProvider.id,
        rollenart,
    }));

    return {
        // Don't assign createdAt and updatedAt, they are auto-generated!
        id: serviceProvider.id,
        name: serviceProvider.name,
        target: serviceProvider.target,
        url: serviceProvider.url,
        kategorie: serviceProvider.kategorie,
        providedOnSchulstrukturknoten: serviceProvider.providedOnSchulstrukturknoten,
        logoId: serviceProvider.logoId,
        logo: serviceProvider.logo,
        logoMimeType: serviceProvider.logoMimeType,
        keycloakGroup: serviceProvider.keycloakGroup,
        keycloakRole: serviceProvider.keycloakRole,
        externalSystem: serviceProvider.externalSystem,
        requires2fa: serviceProvider.requires2fa,
        vidisAngebotId: serviceProvider.vidisAngebotId,
        keycloakClient: serviceProvider.keycloakClient,
        merkmale,
        rollenartenWhitelist,
    };
}

export function mapEntityToAggregate(entity: ServiceProviderEntity): ServiceProvider<boolean> {
    const merkmale: ServiceProviderMerkmal[] = entity.merkmale.map(
        (merkmalEntity: ServiceProviderMerkmalEntity) => merkmalEntity.merkmal,
    );
    const rollenartenWhitelist: RollenArt[] = entity.rollenartenWhitelist.map(
        (rollenartWhitelistEntity: ServiceProviderRollenartWhitelistEntity) => rollenartWhitelistEntity.rollenart,
    );

    return ServiceProvider.construct(
        entity.id,
        entity.createdAt,
        entity.updatedAt,
        entity.name,
        entity.target,
        entity.url,
        entity.kategorie,
        entity.providedOnSchulstrukturknoten,
        entity.logoId,
        entity.logo,
        entity.logoMimeType,
        entity.keycloakGroup,
        entity.keycloakRole,
        entity.externalSystem,
        entity.requires2fa,
        entity.vidisAngebotId,
        merkmale,
        rollenartenWhitelist,
        entity.keycloakClient,
    );
}
