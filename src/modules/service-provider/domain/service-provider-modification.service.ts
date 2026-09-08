import { Injectable } from '@nestjs/common';
import { difference, isEqual } from 'lodash-es';

import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { ServiceProviderID } from '../../../shared/types/aggregate-ids.types.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../../rolle/repo/rollenerweiterung.repo.js';
import { ServiceProviderInternalRepo } from '../repo/service-provider.internal.repo.js';
import { ServiceProviderPropertyPermissions, ServiceProviderRepo } from '../repo/service-provider.repo.js';
import { DuplicateNameError } from '../specification/error/duplicate-name.error.js';
import { NameUniqueAtOrgaSpecification } from '../specification/name-unique-at-orga.specification.js';
import { AttachedRollenError } from './errors/attached-rollen.error.js';
import { AttachedRollenerweiterungenError } from './errors/attached-rollenerweiterungen.error.js';
import { InvalidLogoCombinationError } from './errors/invalid-logo-combination.error.js';
import { VidisServiceProviderImmutableError } from './errors/vidis-service-provider-immutable.error.js';
import { ServiceProviderKategorie, ServiceProviderMerkmal } from './service-provider.enum.js';
import { ServiceProvider, ServiceProviderUpdateParams } from './service-provider.js';

/**
 * Used when person doesn't have full rights to create/update serviceprovider.
 * - Use these values as default, when creating service providers
 * - Use the keys to copy values of existing service provider, when updating
 */
const SP_EINGESCHRAENKT_DEFAULTS: Pick<
    ServiceProvider<true>,
    'merkmale' | 'rollenartenWhitelist' | 'requires2fa' | 'kategorie'
> = {
    merkmale: [
        ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
        ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR,
        ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG,
        ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ROLLENVERWALTUNG,
    ],
    rollenartenWhitelist: [],
    requires2fa: false,
    kategorie: ServiceProviderKategorie.SCHULISCH,
};

@Injectable()
export class ServiceProviderModificationService {
    public constructor(
        private readonly serviceProviderRepo: ServiceProviderRepo,
        private readonly serviceProviderInternalRepo: ServiceProviderInternalRepo,
        private readonly rolleRepo: RolleRepo,
        private readonly rollenerweiterungRepo: RollenerweiterungRepo,
    ) {}

    public async create(
        permissions: IPersonPermissions,
        serviceProvider: ServiceProvider<false>,
    ): Promise<Result<ServiceProvider<true>, DomainError>> {
        const permissionsResult: Result<ServiceProviderPropertyPermissions, DomainError> =
            await this.serviceProviderRepo.getPermissionsForServiceProvider(permissions, serviceProvider);

        // Not allowed to modify this serviceprovider
        if (!permissionsResult.ok) {
            return permissionsResult;
        }

        const duplicateNameError: Option<DuplicateNameError> = await this.validateUniqueName(serviceProvider);
        if (duplicateNameError) {
            return Err(duplicateNameError);
        }

        // Assign defaults if person only has partial system rights
        if (permissionsResult.value === ServiceProviderPropertyPermissions.EINGESCHRAENKT) {
            // returned error can't happen because SP_EINGESCHRAENKT_DEFAULTS does not include any logo
            serviceProvider.update(SP_EINGESCHRAENKT_DEFAULTS);
        }

        const persistedServiceProvider: ServiceProvider<true> =
            await this.serviceProviderInternalRepo.persistAndFlush(serviceProvider);

        return Ok(persistedServiceProvider);
    }

    public async update(
        permissions: IPersonPermissions,
        serviceProvider: ServiceProvider<true>,
    ): Promise<Result<ServiceProvider<true>, DomainError>> {
        const permissionsResult: Result<ServiceProviderPropertyPermissions, DomainError> =
            await this.serviceProviderRepo.getPermissionsForServiceProvider(permissions, serviceProvider);
        if (!permissionsResult.ok) {
            return permissionsResult;
        }

        const existingProvider: Option<ServiceProvider<true>> = await this.serviceProviderRepo.findById(
            serviceProvider.id,
        );
        if (!existingProvider) {
            return Err(new EntityNotFoundError('ServiceProvider', serviceProvider.id));
        }

        const frozenProperties: ServiceProviderUpdateParams = {
            requires2fa: existingProvider.requires2fa,
        };
        if (permissionsResult.value === ServiceProviderPropertyPermissions.EINGESCHRAENKT) {
            frozenProperties.kategorie = existingProvider.kategorie;
            frozenProperties.merkmale = existingProvider.merkmale;
            frozenProperties.rollenartenWhitelist = existingProvider.rollenartenWhitelist;
        }
        const updateError: Option<InvalidLogoCombinationError> = serviceProvider.update(frozenProperties);
        if (updateError) {
            return Err(updateError);
        }

        const duplicateNameError: Option<DuplicateNameError> = await this.validateUniqueName(serviceProvider);
        if (duplicateNameError) {
            return Err(duplicateNameError);
        }

        const hasRollenartenWhitelistChanged: boolean = !isEqual(
            existingProvider.rollenartenWhitelist,
            serviceProvider.rollenartenWhitelist,
        );
        const forbiddenRollenarten: RollenArt[] =
            serviceProvider.rollenartenWhitelist.length === 0
                ? []
                : difference(Object.values(RollenArt), serviceProvider.rollenartenWhitelist);
        if (hasRollenartenWhitelistChanged && forbiddenRollenarten.length > 0) {
            const attachedRollenError: Option<AttachedRollenError> = await this.getAttachedRollenError(
                serviceProvider.id,
                'Cannot update rollenartenWhitelist with conflicting rollenarten attached to rollen',
                forbiddenRollenarten,
            );
            if (attachedRollenError) {
                return Err(attachedRollenError);
            }
        }

        const hasVerfuegbarFuerRollenerweiterungMerkmalBeenRemoved: boolean =
            !serviceProvider.merkmale.includes(ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG) &&
            existingProvider.merkmale.includes(ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG);
        if (hasVerfuegbarFuerRollenerweiterungMerkmalBeenRemoved) {
            await this.rollenerweiterungRepo.deleteByServiceProviderIdAndRollenarten(serviceProvider.id);
        } else if (hasRollenartenWhitelistChanged && forbiddenRollenarten.length > 0) {
            await this.rollenerweiterungRepo.deleteByServiceProviderIdAndRollenarten(
                serviceProvider.id,
                forbiddenRollenarten,
            );
        }

        const persistedServiceProvider: ServiceProvider<true> =
            await this.serviceProviderInternalRepo.persistAndFlush(serviceProvider);

        return Ok(persistedServiceProvider);
    }

    public async deleteByIdAuthorized(
        permissions: IPersonPermissions,
        id: ServiceProviderID,
    ): Promise<
        Result<
            void,
            | EntityNotFoundError
            | MissingPermissionsError
            | AttachedRollenError
            | AttachedRollenerweiterungenError
            | VidisServiceProviderImmutableError
        >
    > {
        const serviceProvider: Option<ServiceProvider<true>> = await this.serviceProviderRepo.findById(id);
        if (!serviceProvider) {
            return Err(new EntityNotFoundError('ServiceProvider', id));
        }

        if (serviceProvider.vidisAngebotId) {
            return Err(
                new VidisServiceProviderImmutableError(
                    'ServiceProvider linked to VIDIS cannot be updated or deleted',
                    id,
                ),
            );
        }

        const attachedRollenError: Option<AttachedRollenError> = await this.getAttachedRollenError(
            id,
            'ServiceProvider has attached Rollen and cannot be deleted',
        );
        if (attachedRollenError) {
            return Err(attachedRollenError);
        }

        const rollenerweiterungen: Record<ServiceProviderID, number> =
            await this.rollenerweiterungRepo.countByServiceProviderIds([id]);
        const hasAttachedRollenerweiterungen: boolean = (rollenerweiterungen[id] ?? 0) > 0;
        if (hasAttachedRollenerweiterungen) {
            return Err(
                new AttachedRollenerweiterungenError(
                    'ServiceProvider has attached Rollenerweiterungen and cannot be deleted',
                    id,
                ),
            );
        }

        return this.serviceProviderRepo.deleteByIdAuthorized(permissions, id);
    }

    private async getAttachedRollenError(
        serviceProviderId: ServiceProviderID,
        message: string,
        rollenarten?: RollenArt[],
    ): Promise<Option<AttachedRollenError>> {
        const hasAttachedRollen: boolean = await this.rolleRepo.existsForServiceProviderId(
            serviceProviderId,
            rollenarten,
        );
        if (hasAttachedRollen) {
            return new AttachedRollenError(message, serviceProviderId);
        }

        return;
    }

    private async validateUniqueName(
        serviceProvider: ServiceProvider<true> | ServiceProvider<false>,
    ): Promise<Option<DuplicateNameError>> {
        if (
            !(await new NameUniqueAtOrgaSpecification(this.serviceProviderInternalRepo).isSatisfiedBy(serviceProvider))
        ) {
            return new DuplicateNameError(
                `Duplicate name error: ${serviceProvider.name}`,
                serviceProvider.id ?? undefined,
            );
        }

        return;
    }
}
