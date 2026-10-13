import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../shared/error/domain.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { OrganisationID, RolleID, ServiceProviderID } from '../../../shared/types/aggregate-ids.types.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { RollenArt } from '../domain/rolle.enums.js';
import { Rollenerweiterung } from '../domain/rollenerweiterung.js';
import { RollenSystemRecht } from '../domain/systemrecht.js';
import { InternalRollenerweiterungRepo } from './internal-rollenerweiterung.repo.js';
import { PermittedOrgas } from '../../authentication/domain/person-permissions.js';

/**
 * Authorized repository facade for Rollenerweiterungen.
 *
 * This repository is intended for services outside the Rolle module.
 * It checks the required ROLLEN_ERWEITERN permission and delegates
 * persistence operations to InternalRollenerweiterungRepo.
 */
@Injectable()
export class RollenerweiterungRepo {
    public constructor(private readonly internalRollenerweiterungRepo: InternalRollenerweiterungRepo) {}

    private async checkPermission(
        organisationId: OrganisationID,
        permissions: IPersonPermissions,
    ): Promise<Result<null, MissingPermissionsError>> {
        const hasPermission: boolean = await permissions.hasSystemrechtAtOrganisation(
            organisationId,
            RollenSystemRecht.ROLLEN_ERWEITERN,
        );

        if (!hasPermission) {
            return Err(new MissingPermissionsError('Not authorized'));
        }

        return Ok(null);
    }

    public async existsByOrganisationId(
        organisationId: OrganisationID,
        permissions: IPersonPermissions,
    ): Promise<Result<boolean, MissingPermissionsError>> {
        const permissionResult: Result<null, MissingPermissionsError> = await this.checkPermission(
            organisationId,
            permissions,
        );

        if (!permissionResult.ok) {
            return permissionResult;
        }

        const exists: boolean = await this.internalRollenerweiterungRepo.existsByOrganisationId(organisationId);

        return Ok(exists);
    }

    public async findManyByOrganisationId(
        organisationId: OrganisationID,
        permissions: IPersonPermissions,
        offset?: number,
        limit?: number,
    ): Promise<Result<Rollenerweiterung<true>[], MissingPermissionsError>> {
        const permissionResult: Result<null, MissingPermissionsError> = await this.checkPermission(
            organisationId,
            permissions,
        );

        if (!permissionResult.ok) {
            return permissionResult;
        }

        const rollenerweiterungen: Rollenerweiterung<true>[] =
            await this.internalRollenerweiterungRepo.findManyByOrganisationId(organisationId, offset, limit);

        return Ok(rollenerweiterungen);
    }

    public async findManyByOrganisationAndRolle(
        query: Array<{
            organisationId: OrganisationID;
            rolleId: RolleID;
        }>,
        permissions: IPersonPermissions,
    ): Promise<Result<Rollenerweiterung<true>[], MissingPermissionsError>> {
        const organisationIds: OrganisationID[] = Array.from(
            new Set(
                query.map(
                    ({ organisationId }: { organisationId: OrganisationID; rolleId: RolleID }): OrganisationID =>
                        organisationId,
                ),
            ),
        );

        const permissionResults: Result<null, MissingPermissionsError>[] = await Promise.all(
            organisationIds.map(
                (organisationId: OrganisationID): Promise<Result<null, MissingPermissionsError>> =>
                    this.checkPermission(organisationId, permissions),
            ),
        );

        const missingPermissionResult: Result<null, MissingPermissionsError> | undefined = permissionResults.find(
            (result: Result<null, MissingPermissionsError>): boolean => !result.ok,
        );

        if (missingPermissionResult && !missingPermissionResult.ok) {
            return missingPermissionResult;
        }

        const rollenerweiterungen: Rollenerweiterung<true>[] =
            await this.internalRollenerweiterungRepo.findManyByOrganisationAndRolle(query);

        return Ok(rollenerweiterungen);
    }

    /**
     * Returns the number of references for the given ServiceProviders.
     *
     * This method performs no Rollenerweiterung permission check because it is
     * used only as a technical reference check before deleting a ServiceProvider.
     */
    public async countByServiceProviderIds(
        serviceProviderIds: ServiceProviderID[],
    ): Promise<Record<ServiceProviderID, number>> {
        const result: Record<ServiceProviderID, number> =
            await this.internalRollenerweiterungRepo.countByServiceProviderIds(serviceProviderIds);

        return result;
    }

    public async findByServiceProviderIds(
        serviceProviderIds: ServiceProviderID[],
        permissions: IPersonPermissions,
        requestedOrganisationId?: OrganisationID,
    ): Promise<Result<Map<ServiceProviderID, Rollenerweiterung<true>[]>, MissingPermissionsError>> {
        const permittedOrgas: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.ROLLEN_ERWEITERN, RollenSystemRecht.ANGEBOTE_VERWALTEN],
            false,
            false,
        );

        if (!permittedOrgas.all && permittedOrgas.orgaIds.length === 0) {
            return Err(new MissingPermissionsError('Not authorized'));
        }

        if (
            requestedOrganisationId &&
            !permittedOrgas.all &&
            !permittedOrgas.orgaIds.includes(requestedOrganisationId)
        ) {
            return Err(new MissingPermissionsError('Insufficient permissions for the requested organisationId'));
        }

        const organisationIds: OrganisationID[] | undefined = requestedOrganisationId
            ? [requestedOrganisationId]
            : permittedOrgas.all
              ? undefined
              : permittedOrgas.orgaIds;

        const rollenerweiterungen: Map<ServiceProviderID, Rollenerweiterung<true>[]> =
            await this.internalRollenerweiterungRepo.findByServiceProviderIds(serviceProviderIds, organisationIds);

        return Ok(rollenerweiterungen);
    }

    public async findByServiceProviderIdPagedAndSortedByOrgaKennung(
        serviceProviderId: ServiceProviderID,
        permissions: IPersonPermissions,
        requestedOrganisationIds?: OrganisationID[],
        rolleIds?: RolleID[],
        offset?: number,
        limit?: number,
    ): Promise<Result<Counted<Rollenerweiterung<true>>, MissingPermissionsError>> {
        const permittedOrgas: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.ROLLEN_ERWEITERN, RollenSystemRecht.ANGEBOTE_VERWALTEN],
            false,
            false,
        );
        if (!permittedOrgas.all && permittedOrgas.orgaIds.length === 0) {
            return Err(new MissingPermissionsError('No permission to read Rollenerweiterungen'));
        }

        if (
            requestedOrganisationIds &&
            !permittedOrgas.all &&
            !requestedOrganisationIds.every((organisationId: OrganisationID): boolean =>
                permittedOrgas.orgaIds.includes(organisationId),
            )
        ) {
            return Err(new MissingPermissionsError('Insufficient permissions for the requested organisationId'));
        }

        let filteredOrganisationIds: OrganisationID[] | undefined = permittedOrgas.all
            ? undefined
            : permittedOrgas.orgaIds;

        if (requestedOrganisationIds?.length) {
            filteredOrganisationIds = requestedOrganisationIds;
        }

        const result: Counted<Rollenerweiterung<true>> =
            await this.internalRollenerweiterungRepo.findByServiceProviderIdPagedAndSortedByOrgaKennung(
                serviceProviderId,
                filteredOrganisationIds,
                rolleIds,
                offset,
                limit,
            );

        return Ok(result);
    }

    public async deleteByOrganisationIdAndServiceProviderIds(
        organisationId: OrganisationID,
        serviceProviderIds: ServiceProviderID[],
        permissions: IPersonPermissions,
    ): Promise<Result<null, DomainError | MissingPermissionsError>> {
        const permissionResult: Result<null, MissingPermissionsError> = await this.checkPermission(
            organisationId,
            permissions,
        );

        if (!permissionResult.ok) {
            return permissionResult;
        }

        return this.internalRollenerweiterungRepo.deleteByOrganisationIdAndServiceProviderIds(
            organisationId,
            serviceProviderIds,
        );
    }

    public async deleteByServiceProviderIdAndRollenarten(
        serviceProviderId: ServiceProviderID,
        permissions: IPersonPermissions,
        rollenarten?: RollenArt[],
    ): Promise<Result<null, DomainError | MissingPermissionsError>> {
        const affectedRollenerweiterungen: Rollenerweiterung<true>[] =
            await this.internalRollenerweiterungRepo.findByServiceProviderIdAndRollenarten(
                serviceProviderId,
                rollenarten,
            );

        const affectedOrganisationIds: OrganisationID[] = Array.from(
            new Set(
                affectedRollenerweiterungen.map(
                    (rollenerweiterung: Rollenerweiterung<true>): OrganisationID => rollenerweiterung.organisationId,
                ),
            ),
        );

        const permissionResults: boolean[] = await Promise.all(
            affectedOrganisationIds.map(
                (organisationId: OrganisationID): Promise<boolean> =>
                    permissions.hasSystemrechtAtOrganisation(organisationId, RollenSystemRecht.ROLLEN_ERWEITERN),
            ),
        );

        const isAuthorizedForAllAffectedOrganisations: boolean = permissionResults.every(
            (hasPermission: boolean): boolean => hasPermission,
        );

        if (!isAuthorizedForAllAffectedOrganisations) {
            return Err(new MissingPermissionsError('Not authorized'));
        }

        return this.internalRollenerweiterungRepo.deleteByServiceProviderIdAndRollenarten(
            serviceProviderId,
            rollenarten,
        );
    }
}
