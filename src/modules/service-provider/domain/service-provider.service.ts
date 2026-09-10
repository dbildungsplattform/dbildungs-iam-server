import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { uniq } from 'lodash-es';
import { FeatureFlagConfig } from '../../../shared/config/featureflag.config.js';
import { ServerConfig } from '../../../shared/config/server.config.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { OrganisationID, RolleID, ServiceProviderID } from '../../../shared/types/aggregate-ids.types.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { PermittedOrgas } from '../../authentication/domain/person-permissions.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { Rollenerweiterung } from '../../rolle/domain/rollenerweiterung.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../../rolle/repo/rollenerweiterung.repo.js';
import { ServiceProviderRepo } from '../repo/service-provider.repo.js';
import { ServiceProviderMerkmal } from './service-provider.enum.js';
import { ServiceProvider } from './service-provider.js';
import {
    ManageableServiceProviderDetailsWithReferencedObjects,
    ManageableServiceProviderFilter,
    ManageableServiceProviderWithReferencedObjects,
    ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount,
    RollenerweiterungForManageableServiceProvider,
} from './types.js';

@Injectable()
export class ServiceProviderService {
    private readonly isFeatureRolleErweiternEnabled: boolean;

    public constructor(
        private readonly rolleRepo: RolleRepo,
        private readonly rollenerweiterungRepo: RollenerweiterungRepo,
        private readonly serviceProviderRepo: ServiceProviderRepo,
        private readonly organisationRepo: OrganisationRepository,
        configService: ConfigService<ServerConfig>,
    ) {
        const featureFlags: FeatureFlagConfig = configService.getOrThrow<FeatureFlagConfig>('FEATUREFLAG');
        this.isFeatureRolleErweiternEnabled = featureFlags.FEATURE_FLAG_ROLLE_ERWEITERN;
    }

    public async getServiceProvidersByRolleIds(rolleIds: string[]): Promise<ServiceProvider<true>[]> {
        const rollen: Map<string, Rolle<true>> = await this.rolleRepo.findByIds(uniq(rolleIds));
        const serviceProviderIds: Array<string> = uniq(
            Array.from(rollen.values()).flatMap((rolle: Rolle<true>) => rolle.serviceProviderIds),
        );
        const serviceProviders: Map<string, ServiceProvider<true>> = await this.serviceProviderRepo.findByIds(
            serviceProviderIds,
        );

        return Array.from(serviceProviders.values());
    }

    public async getServiceProvidersByOrganisationenAndRollen(
        ids: Array<{ organisationId: string; rolleId: string }>,
    ): Promise<ServiceProvider<true>[]> {
        const uniqueRollenIds: RolleID[] = uniq(
            ids.map((idTuple: { organisationId: string; rolleId: string }) => idTuple.rolleId),
        );
        const rollen: Map<string, Rolle<true>> = await this.rolleRepo.findByIds(uniqueRollenIds);
        const serviceProviderIds: Set<ServiceProviderID> = new Set();
        for (const rolle of rollen.values()) {
            for (const id of rolle.serviceProviderIds) {
                serviceProviderIds.add(id);
            }
        }

        if (this.isFeatureRolleErweiternEnabled) {
            const rollenerweiterungen: Array<Rollenerweiterung<true>> =
                await this.rollenerweiterungRepo.findManyByOrganisationAndRolle(ids);
            for (const rollenerweiterung of rollenerweiterungen) {
                serviceProviderIds.add(rollenerweiterung.serviceProviderId);
            }
        }

        const serviceProviders: Map<string, ServiceProvider<true>> = await this.serviceProviderRepo.findByIds(
            Array.from(serviceProviderIds),
        );

        return Array.from(serviceProviders.values());
    }

    public async findManageableById(
        permissions: IPersonPermissions,
        id: ServiceProviderID,
    ): Promise<Option<ManageableServiceProviderDetailsWithReferencedObjects>> {
        const serviceProvider: Option<ServiceProvider<true>> = await this.serviceProviderRepo.findById(id);
        if (!serviceProvider) {
            return;
        }

        const systemrechte: RollenSystemRecht[] = [];
        if (
            await permissions.hasSystemrechtAtOrganisation(
                serviceProvider.providedOnSchulstrukturknoten,
                RollenSystemRecht.ANGEBOTE_VERWALTEN,
            )
        ) {
            systemrechte.push(RollenSystemRecht.ANGEBOTE_VERWALTEN);
        }
        if (
            await permissions.hasSystemrechtAtOrganisation(
                serviceProvider.providedOnSchulstrukturknoten,
                RollenSystemRecht.ANGEBOTE_EINGESCHRAENKT_VERWALTEN,
            )
        ) {
            systemrechte.push(RollenSystemRecht.ANGEBOTE_EINGESCHRAENKT_VERWALTEN);
        }

        const orgasWithRollenErweiternPermission: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht([
            RollenSystemRecht.ROLLEN_ERWEITERN,
        ]);
        if (
            orgasWithRollenErweiternPermission.all ||
            orgasWithRollenErweiternPermission.orgaIds.includes(serviceProvider.providedOnSchulstrukturknoten)
        ) {
            systemrechte.push(RollenSystemRecht.ROLLEN_ERWEITERN);
        } else {
            const parents: Organisation<true>[] = await this.organisationRepo.findParentOrgasForIds(
                orgasWithRollenErweiternPermission.orgaIds,
            );
            if (
                Array.isArray(parents) &&
                parents.some(
                    (parent: Organisation<true>) => parent.id === serviceProvider.providedOnSchulstrukturknoten,
                )
            ) {
                systemrechte.push(RollenSystemRecht.ROLLEN_ERWEITERN);
            }
        }

        if (systemrechte.length === 0) {
            return;
        }

        const enrichedServiceProvider: ManageableServiceProviderWithReferencedObjects = (
            await this.getOrganisationRollenAndRollenerweiterungenForServiceProviders([serviceProvider])
        )[0]!;

        const result: ManageableServiceProviderDetailsWithReferencedObjects = {
            ...enrichedServiceProvider,
            relevantSystemrechte: systemrechte,
        };

        return result;
    }

    public async findAuthorized(
        permissions: IPersonPermissions,
        filter?: ManageableServiceProviderFilter,
    ): Promise<Counted<ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount>> {
        const permittedOrgas: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.ANGEBOTE_VERWALTEN],
            true,
        );

        const [serviceProviders, count]: Counted<ServiceProvider<true>> =
            await this.serviceProviderRepo.findByOrganisationsWithMerkmale(
                permittedOrgas.all ? 'all' : permittedOrgas.orgaIds,
                filter,
            );

        const enrichedServiceProviders: ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount[] =
            await this.getRollenAndRollenerweiterungCountForServiceProviders(serviceProviders, 20, permittedOrgas);

        return [enrichedServiceProviders, count];
    }

    public async findManageableLandRoot(
        permissions: IPersonPermissions,
        searchString?: string,
        limit?: number,
        offset?: number,
    ): Promise<Result<Counted<ServiceProvider<true>>, MissingPermissionsError>> {
        const permittedOrgas: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht([
            RollenSystemRecht.ANGEBOTE_VERWALTEN,
        ]);

        if (!permittedOrgas.all) {
            return Err(new MissingPermissionsError('Root-level ANGEBOTE_VERWALTEN required'));
        }

        const orgIds: OrganisationID[] = await this.organisationRepo.findIdsByTypen([
            OrganisationsTyp.LAND,
            OrganisationsTyp.ROOT,
        ]);

        const counted: Counted<ServiceProvider<true>> =
            await this.serviceProviderRepo.findBySchulstrukturknotenPaginated(orgIds, searchString, limit, offset);

        return Ok(counted);
    }

    public async getAuthorizedForRollenErweiternWithMerkmalRollenerweiterung(
        organisationId: OrganisationID,
        permissions: IPersonPermissions,
        limit?: number,
        offset?: number,
    ): Promise<Result<Counted<ManageableServiceProviderWithReferencedObjects>, MissingPermissionsError>> {
        const hasPermission: boolean = await permissions.hasSystemrechtAtOrganisation(
            organisationId,
            RollenSystemRecht.ROLLEN_ERWEITERN,
        );
        if (!hasPermission) {
            return {
                ok: false,
                error: new MissingPermissionsError('Rollen Erweitern Systemrecht Required For This Endpoint'),
            };
        }
        const parents: Organisation<true>[] = await this.organisationRepo.findParentOrgasForIds([organisationId]);
        const organisationWithParentsIds: OrganisationID[] = [
            organisationId,
            ...parents.map((orga: Organisation<true>) => orga.id),
        ];
        const result: Counted<ServiceProvider<true>> = await this.serviceProviderRepo.findByOrgasWithMerkmal(
            organisationWithParentsIds,
            ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
            limit,
            offset,
        );

        const [serviceProviders, total]: [ServiceProvider<true>[], number] = result;

        // Calculate permitted orgas for delete
        const permittedOrgas: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.ANGEBOTE_VERWALTEN, RollenSystemRecht.ANGEBOTE_EINGESCHRAENKT_VERWALTEN],
            true,
            false,
        );
        const enrichedServiceProviders: ManageableServiceProviderWithReferencedObjects[] =
            await this.getOrganisationRollenAndRollenerweiterungenForServiceProviders(
                serviceProviders,
                20,
                organisationId,
                permittedOrgas,
            );

        return { ok: true, value: [enrichedServiceProviders, total] };
    }

    public async findAllowedProvidersForRollenerweiterungAtOrga(
        organisationId: OrganisationID,
        permissions: IPersonPermissions,
    ): Promise<Counted<ServiceProvider<true>>> {
        const permittedOrgas: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.ROLLEN_ERWEITERN],
            true,
        );
        if (!permittedOrgas.all && !permittedOrgas.orgaIds.includes(organisationId)) {
            return [[], 0];
        }
        const parents: Organisation<true>[] = await this.organisationRepo.findParentOrgasForIds([organisationId]);
        const organisationWithParentsIds: OrganisationID[] = [
            organisationId,
            ...parents.map((orga: Organisation<true>) => orga.id),
        ];
        const serviceProviders: Counted<ServiceProvider<true>> = await this.serviceProviderRepo.findByOrgasWithMerkmal(
            organisationWithParentsIds,
            ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
        );

        return serviceProviders;
    }

    private async getRollenAndRollenerweiterungCountForServiceProviders(
        serviceProviders: ServiceProvider<true>[],
        limitRoles?: number,
        permittedOrgas?: PermittedOrgas,
    ): Promise<ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount[]> {
        const serviceProvidersIds: ServiceProviderID[] = serviceProviders.map((sp: ServiceProvider<true>) => sp.id);

        let permittedOrgaSet: Set<string> = new Set();
        if (permittedOrgas && !permittedOrgas.all) {
            permittedOrgaSet = new Set(permittedOrgas.orgaIds);
        }

        const [rollen, rollenerweiterungenCount, organisationen]: [
            Map<ServiceProviderID, Rolle<true>[]>,
            Record<ServiceProviderID, number>,
            Map<OrganisationID, Organisation<true>>,
        ] = await Promise.all([
            this.rolleRepo.findByServiceProviderIds(serviceProvidersIds, limitRoles),
            this.rollenerweiterungRepo.countByServiceProviderIds(serviceProvidersIds),
            this.organisationRepo.findByIds(
                serviceProviders.map((sp: ServiceProvider<true>) => sp.providedOnSchulstrukturknoten),
            ),
        ]);

        const serviceProvidersWithData: ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount[] =
            serviceProviders.map((serviceProvider: ServiceProvider<true>) => {
                return {
                    serviceProvider,
                    organisation: organisationen.get(serviceProvider.providedOnSchulstrukturknoten)!,
                    rollen: rollen.get(serviceProvider.id) ?? [],
                    hasRollenerweiterungen: (rollenerweiterungenCount[serviceProvider.id] ?? 0) > 0,
                    hasSomeVerwaltenPermission:
                        permittedOrgas?.all || permittedOrgaSet.has(serviceProvider.providedOnSchulstrukturknoten),
                };
            });

        return serviceProvidersWithData;
    }

    private async getOrganisationRollenAndRollenerweiterungenForServiceProviders(
        serviceProviders: ServiceProvider<true>[],
        limitRoles?: number,
        organisationId?: OrganisationID,
        permittedOrgas?: PermittedOrgas,
    ): Promise<ManageableServiceProviderWithReferencedObjects[]> {
        const serviceProvidersIds: ServiceProviderID[] = serviceProviders.map((sp: ServiceProvider<true>) => sp.id);

        const [rollen, rollenerweiterungen, organisationen]: [
            Map<ServiceProviderID, Rolle<true>[]>,
            Map<ServiceProviderID, Rollenerweiterung<true>[]>,
            Map<OrganisationID, Organisation<true>>,
        ] = await Promise.all([
            this.rolleRepo.findByServiceProviderIds(serviceProvidersIds, limitRoles),
            this.rollenerweiterungRepo.findByServiceProviderIds(serviceProvidersIds, organisationId),
            this.organisationRepo.findByIds(
                serviceProviders.map((sp: ServiceProvider<true>) => sp.providedOnSchulstrukturknoten),
            ),
        ]);

        let permittedOrgaSet: Set<string> = new Set();
        if (permittedOrgas) {
            if (!permittedOrgas.all) {
                permittedOrgaSet = new Set(permittedOrgas.orgaIds);
            }
        }

        const serviceProvidersWithData: ManageableServiceProviderWithReferencedObjects[] = serviceProviders.map(
            (serviceProvider: ServiceProvider<true>) => {
                return {
                    serviceProvider,
                    organisation: organisationen.get(serviceProvider.providedOnSchulstrukturknoten)!,
                    rollen: rollen.get(serviceProvider.id) ?? [],
                    rollenerweiterungen: rollenerweiterungen.get(serviceProvider.id) ?? [],
                    hasSomeVerwaltenPermission:
                        permittedOrgas?.all || permittedOrgaSet.has(serviceProvider.providedOnSchulstrukturknoten),
                };
            },
        );

        // Call the third method internally to enrich rollenerweiterungen with names
        const allRollenerweiterungen: Rollenerweiterung<true>[] = serviceProvidersWithData
            .map((spWithData: ManageableServiceProviderWithReferencedObjects) => spWithData.rollenerweiterungen)
            .flat();

        const rollenerweiterungenWithNames: RollenerweiterungForManageableServiceProvider[] =
            await this.getRollenerweiterungenForManageableServiceProvider(allRollenerweiterungen);

        // Attach enriched rollenerweiterungen to each service provider
        return serviceProvidersWithData.map((spWithData: ManageableServiceProviderWithReferencedObjects) => ({
            ...spWithData,
            rollenerweiterungenWithName: rollenerweiterungenWithNames
                .filter(
                    (re: RollenerweiterungForManageableServiceProvider) =>
                        re.serviceProviderId === spWithData.serviceProvider.id,
                )
                .sort(
                    (
                        a: RollenerweiterungForManageableServiceProvider,
                        b: RollenerweiterungForManageableServiceProvider,
                    ) => a.rolle.name.localeCompare(b.rolle.name),
                ),
        }));
    }

    private async getRollenerweiterungenForManageableServiceProvider(
        rollenerweiterungen: Rollenerweiterung<true>[],
    ): Promise<RollenerweiterungForManageableServiceProvider[]> {
        if (rollenerweiterungen.length === 0) {
            return [];
        }

        const [organisationen, rollen]: [Map<OrganisationID, Organisation<true>>, Map<RolleID, Rolle<true>>] =
            await Promise.all([
                this.organisationRepo.findByIds(
                    rollenerweiterungen.map(
                        (rollenerweiterung: Rollenerweiterung<true>) => rollenerweiterung.organisationId,
                    ),
                ),
                this.rolleRepo.findByIds(
                    rollenerweiterungen.map((rollenerweiterung: Rollenerweiterung<true>) => rollenerweiterung.rolleId),
                ),
            ]);

        return rollenerweiterungen.map((rollenerweiterung: Rollenerweiterung<true>) => ({
            serviceProviderId: rollenerweiterung.serviceProviderId,
            organisation: organisationen.get(rollenerweiterung.organisationId)!,
            rolle: rollen.get(rollenerweiterung.rolleId)!,
        }));
    }
}
