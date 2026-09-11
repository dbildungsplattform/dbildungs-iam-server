import { Injectable } from '@nestjs/common';
import { Err, Ok } from '../../../shared/util/result.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { InvalidLogoCombinationError } from './errors/invalid-logo-combination.error.js';
import {
    ServiceProviderKategorie,
    ServiceProviderMerkmal,
    ServiceProviderSystem,
    ServiceProviderTarget,
} from './service-provider.enum.js';
import { ServiceProvider } from './service-provider.js';

@Injectable()
export class ServiceProviderFactory {
    public construct(
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
        keycloakClient: string | undefined,
    ): Result<ServiceProvider<true>, InvalidLogoCombinationError> {
        if (!ServiceProvider.isValidLogoCombination(logoId, logo, logoMimeType)) {
            return Err(new InvalidLogoCombinationError('Cannot construct ServiceProvider with both logoId and logo'));
        }
        return Ok(
            ServiceProvider.construct(
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
                keycloakClient,
            ),
        );
    }

    public createNew(
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
        keycloakClient: string | undefined,
    ): Result<ServiceProvider<false>, InvalidLogoCombinationError> {
        if (!ServiceProvider.isValidLogoCombination(logoId, logo, logoMimeType)) {
            return Err(new InvalidLogoCombinationError('Cannot construct ServiceProvider with both logoId and logo'));
        }
        return Ok(
            ServiceProvider.createNew(
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
                keycloakClient,
            ),
        );
    }
}
