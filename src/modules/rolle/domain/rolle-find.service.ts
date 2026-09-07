import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { intersection } from 'lodash-es';
import { ServerConfig } from '../../../shared/config/index.js';
import { PortalConfig } from '../../../shared/config/portal.config.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { OrganisationID, RolleID } from '../../../shared/types/aggregate-ids.types.js';
import { intersectPermittedAndRequestedOrgas, PermittedOrgas } from '../../authentication/domain/person-permissions.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import {
    FindRollenAvailableForPersonenkontextCreationParams,
    RolleFindByParameters,
    RolleRepo,
} from '../repo/rolle.repo.js';
import { RollenArt, RollenMerkmal } from './rolle.enums.js';
import { Rolle } from './rolle.js';
import { OrganisationMatchesRollenart } from './specification/organisation-matches-rollenart.js';
import { RollenSystemRecht } from './systemrecht.js';

export interface FindRollenWithPermissionsParams {
    permissions: IPersonPermissions;
    searchStr?: string;
    organisationIds?: Array<OrganisationID>;
    rollenArten?: Array<RollenArt>;
    limit?: number;
    offset?: number;
}

export interface FindRollenForPersonenkontextCreationWithPermissionsParams {
    permissions: IPersonPermissions;
    systemrecht: RollenSystemRecht;
    organisationId: OrganisationID;
    rollenartOfUser?: RollenArt;
    rolleName?: string;
    rollenIds?: Array<RolleID>;
    limit?: number;
    offset?: number;
}

export interface FindMptRollenAuthorizedParams {
    permissions: IPersonPermissions;
    includeTechnische: boolean;
    searchStr?: string;
    limit?: number;
    offset?: number;
    organisationIds?: OrganisationID[];
    rolleIds?: RolleID[];
}

enum OrganisationBoundsKind {
    EMPTY = 'EMPTY',
    BOUNDED = 'BOUNDED',
    UNBOUNDED = 'UNBOUNDED',
}

type EmptyOrganisationBounds = {
    kind: OrganisationBoundsKind.EMPTY;
};

type BoundedOrganisationBounds = {
    selectedAndPermittedOrgas: Array<OrganisationID>;
    selectedAndPermittedOrgasWithParents: Array<OrganisationID>;
    kind: OrganisationBoundsKind.BOUNDED;
};

type UnboundedOrganisationBounds = {
    kind: OrganisationBoundsKind.UNBOUNDED;
};

type OrganisationBounds = EmptyOrganisationBounds | BoundedOrganisationBounds | UnboundedOrganisationBounds;

enum MptPolicy {
    INCLUDE = 'INCLUDE',
    EXCLUDE = 'EXCLUDE',
    REQUIRE = 'REQUIRE',
}

interface FindRollenForPersonenImportParams {
    permissions: IPersonPermissions;
    organisationId: OrganisationID;
    rollenArten?: Array<RollenArt>;
    searchStr?: string;
    limit?: number;
    offset?: number;
}

type FindRollenAvailableForErweiterungParams = FindRollenWithPermissionsParams & {
    requestedSystemrechte?: RollenSystemRecht[];
};

type FindRollenAvailableForPersonAdministrationParams = FindRollenWithPermissionsParams & {
    requestedSystemrechte?: RollenSystemRecht[];
};

@Injectable()
export class RolleFindService {
    public constructor(
        private readonly rolleRepo: RolleRepo,
        private readonly organisationRepository: OrganisationRepository,
        private readonly configService: ConfigService<ServerConfig>,
    ) {}

    public async findRollenAvailableForErweiterung(
        params: FindRollenAvailableForErweiterungParams,
    ): Promise<Counted<Rolle<true>>> {
        const permittedOrgas: PermittedOrgas = await params.permissions.getOrgIdsWithSystemrecht(
            params.requestedSystemrechte ?? [RollenSystemRecht.ROLLEN_ERWEITERN],
            true,
        );

        const organisationBounds: OrganisationBounds = await this.resolveOrganisationBounds(
            permittedOrgas,
            params.organisationIds,
        );

        let rolleFindByParams: RolleFindByParameters;
        switch (organisationBounds.kind) {
            case OrganisationBoundsKind.BOUNDED:
                {
                    const rollenArten: RollenArt[] = await this.resolveAllowedRollenArten(
                        organisationBounds.selectedAndPermittedOrgas,
                        params.rollenArten,
                    );
                    const mptPolicy: MptPolicy = await this.resolveMptPolicy(
                        params.permissions,
                        params.requestedSystemrechte,
                        organisationBounds.selectedAndPermittedOrgas,
                    );
                    rolleFindByParams = this.createRolleFindByParams(
                        params,
                        {
                            allowedOrganisationIds: organisationBounds.selectedAndPermittedOrgasWithParents,
                            rollenArten,
                        },
                        mptPolicy,
                    );
                }
                break;
            case OrganisationBoundsKind.UNBOUNDED:
                {
                    const mptPolicy: MptPolicy = await this.resolveMptPolicy(
                        params.permissions,
                        params.requestedSystemrechte,
                    );
                    rolleFindByParams = this.createRolleFindByParams(
                        params,
                        {
                            allowedOrganisationIds: undefined,
                            rollenArten: params.rollenArten,
                        },
                        mptPolicy,
                    );
                }
                break;
            case OrganisationBoundsKind.EMPTY:
                return [[], 0];
        }

        return this.rolleRepo.findBy(rolleFindByParams);
    }

    public async findRollenAvailableForImportPersonenkontext(
        params: FindRollenForPersonenImportParams,
    ): Promise<Counted<Rolle<true>>> {
        const permittedOrgas: PermittedOrgas = await params.permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.IMPORT_DURCHFUEHREN],
            true,
            false,
        );

        const organisationBounds: EmptyOrganisationBounds | BoundedOrganisationBounds =
            await this.resolveOrganisationBoundsWithSelection(permittedOrgas, [params.organisationId]);

        let rollenArten: RollenArt[];
        let allowedOrganisationIds: OrganisationID[];
        switch (organisationBounds.kind) {
            case OrganisationBoundsKind.BOUNDED:
                rollenArten = await this.resolveAllowedRollenArten(
                    organisationBounds.selectedAndPermittedOrgas,
                    params.rollenArten,
                );
                allowedOrganisationIds = organisationBounds.selectedAndPermittedOrgasWithParents;
                break;
            case OrganisationBoundsKind.EMPTY:
                return [[], 0];
        }
        const rolleFindByParams: RolleFindByParameters = this.createRolleFindByParams(
            params,
            {
                allowedOrganisationIds,
                rollenArten,
            },
            MptPolicy.EXCLUDE,
        );

        return this.rolleRepo.findBy(rolleFindByParams);
    }

    public async findRollenAvailableForPersonenkontextCreation(
        params: FindRollenForPersonenkontextCreationWithPermissionsParams,
    ): Promise<Counted<Rolle<true>>> {
        const permittedOrgas: PermittedOrgas = await params.permissions.getOrgIdsWithSystemrecht([params.systemrecht]);
        const organisationBounds: EmptyOrganisationBounds | BoundedOrganisationBounds =
            await this.resolveOrganisationBoundsWithSelection(permittedOrgas, [params.organisationId]);
        switch (organisationBounds.kind) {
            case OrganisationBoundsKind.EMPTY:
                return [[], 0];
            case OrganisationBoundsKind.BOUNDED:
                break;
        }

        const [allowedRollenarten, allowedRollenartenForMPTRollen]: [Array<RollenArt>, Array<RollenArt>] =
            await this.getAllowedRollenArtenForPersonenkontextCreation(
                params,
                organisationBounds.selectedAndPermittedOrgas,
            );
        if (allowedRollenartenForMPTRollen.length === 0) {
            return [[], 0];
        }

        const query: FindRollenAvailableForPersonenkontextCreationParams = {
            organisationId: params.organisationId,
            allowedRollenarten,
            allowedOrganisationIds: organisationBounds.selectedAndPermittedOrgasWithParents,
            stickyRollenIds: params.rollenIds,
            limit: params.limit,
            offset: params.offset,
            searchStr: params.rolleName,
        };

        const hasMPTPermission: boolean = await params.permissions.hasSystemrechtAtOrganisation(
            params.organisationId,
            RollenSystemRecht.MPT_ROLLEN_VERWALTEN,
        );
        if (hasMPTPermission) {
            query.mpt = {
                allowedRollenarten: allowedRollenartenForMPTRollen,
            };
        }

        return this.rolleRepo.findRollenAvailableForPersonenkontextCreation(query);
    }

    public async findRollenAvailableForPersonAdministration(
        params: FindRollenAvailableForPersonAdministrationParams,
    ): Promise<Counted<Rolle<true>>> {
        const permittedOrgas: PermittedOrgas = await params.permissions.getOrgIdsWithSystemrecht(
            params.requestedSystemrechte ?? [RollenSystemRecht.PERSONEN_VERWALTEN],
            true,
            true,
        );

        const organisationBounds: OrganisationBounds = await this.resolveOrganisationBounds(
            permittedOrgas,
            params.organisationIds,
        );

        let rollenArten: RollenArt[] | undefined;
        let allowedOrganisationIds: OrganisationID[] | undefined;
        let mptPolicy: MptPolicy;
        switch (organisationBounds.kind) {
            case OrganisationBoundsKind.BOUNDED:
                rollenArten = await this.resolveAllowedRollenArten(organisationBounds.selectedAndPermittedOrgas);
                allowedOrganisationIds = organisationBounds.selectedAndPermittedOrgasWithParents;
                mptPolicy = await this.resolveMptPolicy(
                    params.permissions,
                    params.requestedSystemrechte,
                    organisationBounds.selectedAndPermittedOrgas,
                );
                break;
            case OrganisationBoundsKind.UNBOUNDED:
                rollenArten = undefined;
                allowedOrganisationIds = undefined;
                mptPolicy = await this.resolveMptPolicy(params.permissions, params.requestedSystemrechte);
                break;
            case OrganisationBoundsKind.EMPTY:
                return [[], 0];
        }

        const rolleFindByParams: RolleFindByParameters = this.createRolleFindByParams(
            params,
            { allowedOrganisationIds, rollenArten },
            mptPolicy,
        );

        return this.rolleRepo.findBy(rolleFindByParams);
    }

    public async findMptRollenAuthorized(params: FindMptRollenAuthorizedParams): Promise<Counted<Rolle<true>>> {
        const orgIdsWithRecht: PermittedOrgas = await params.permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.MPT_ROLLEN_VERWALTEN],
            true,
        );
        const organisationBounds: OrganisationBounds = await this.resolveOrganisationBounds(
            orgIdsWithRecht,
            params.organisationIds,
        );

        const sharedParams: Omit<RolleFindByParameters, 'allowedOrganisationIds' | 'rollenArten' | 'excludeMerkmale'> =
            {
                includeTechnische: params.includeTechnische,
                searchStr: params.searchStr,
                limit: params.limit,
                offset: params.offset,
                rolleIds: params.rolleIds,
                requireMerkmale: [RollenMerkmal.MPT_ROLLE],
                orderBy: 'artAndName',
            };
        let rolleFindByParams: RolleFindByParameters;
        switch (organisationBounds.kind) {
            case OrganisationBoundsKind.EMPTY:
                return [[], 0];
            case OrganisationBoundsKind.BOUNDED:
                rolleFindByParams = this.createRolleFindByParams(
                    sharedParams,
                    {
                        allowedOrganisationIds: organisationBounds.selectedAndPermittedOrgasWithParents,
                        rollenArten: await this.resolveAllowedRollenArten(organisationBounds.selectedAndPermittedOrgas),
                    },
                    MptPolicy.REQUIRE,
                );
                break;
            case OrganisationBoundsKind.UNBOUNDED:
                rolleFindByParams = this.createRolleFindByParams(
                    sharedParams,
                    {
                        allowedOrganisationIds: undefined,
                        rollenArten: undefined,
                    },
                    MptPolicy.REQUIRE,
                );
        }

        return this.rolleRepo.findBy(rolleFindByParams);
    }

    private createRolleFindByParams(
        {
            includeTechnische,
            searchStr,
            requireMerkmale,
            rolleIds,
            limit,
            offset,
            orderBy,
            merkmale,
        }: Omit<RolleFindByParameters, 'allowedOrganisationIds' | 'rollenArten' | 'excludeMerkmale'>,
        { allowedOrganisationIds, rollenArten }: Pick<RolleFindByParameters, 'allowedOrganisationIds' | 'rollenArten'>,
        mptPolicy: MptPolicy = MptPolicy.EXCLUDE,
    ): RolleFindByParameters {
        const params: RolleFindByParameters = {
            includeTechnische,
            searchStr,
            requireMerkmale,
            rolleIds,
            limit,
            offset,
            orderBy,
            merkmale,
            allowedOrganisationIds,
            rollenArten,
        };
        switch (mptPolicy) {
            case MptPolicy.INCLUDE:
                break;
            case MptPolicy.EXCLUDE:
                params.excludeMerkmale = [RollenMerkmal.MPT_ROLLE];
                break;
            case MptPolicy.REQUIRE:
                params.requireMerkmale = [RollenMerkmal.MPT_ROLLE];
                break;
        }
        return params;
    }

    private async resolveMptPolicy(
        permissions: IPersonPermissions,
        requestedSystemrechte?: RollenSystemRecht[],
        selectedAndPermittedOrgas?: Array<OrganisationID>,
    ): Promise<MptPolicy> {
        const shouldIncludeMptRollen: boolean = await this.shouldIncludeMptRollen(
            permissions,
            requestedSystemrechte,
            selectedAndPermittedOrgas,
        );
        return shouldIncludeMptRollen ? MptPolicy.INCLUDE : MptPolicy.EXCLUDE;
    }

    private async shouldIncludeMptRollen(
        permissions: IPersonPermissions,
        requestedSystemrechte?: RollenSystemRecht[],
        selectedAndPermittedOrgas?: Array<OrganisationID>,
    ): Promise<boolean> {
        const wantsMptRollen: boolean = this.wantsMptRollen(requestedSystemrechte);
        return wantsMptRollen && (await this.hasMPTRollenVerwaltenPermission(permissions, selectedAndPermittedOrgas));
    }

    private wantsMptRollen(requestedSystemrechte: RollenSystemRecht[] = []): boolean {
        return requestedSystemrechte.includes(RollenSystemRecht.MPT_ROLLEN_VERWALTEN);
    }

    /**
     * Returns two arrays of allowed rollenarten based on parameters. The latter is the more general one, while the first may be narrowed based on users permissions and LIMITED_ROLLENART_ALLOWLIST
     * @param params
     * @param organisation
     * @returns [allowedRollenarten, allowedRollenartenForMPTRollen]
     */
    private async getAllowedRollenArtenForPersonenkontextCreation(
        params: FindRollenForPersonenkontextCreationWithPermissionsParams,
        selectedAndPermittedOrgas: Array<OrganisationID>,
    ): Promise<[Array<RollenArt>, Array<RollenArt>]> {
        const rollenArtenForOrganisation: Array<RollenArt> = await this.resolveAllowedRollenArten(
            selectedAndPermittedOrgas,
            params.rollenartOfUser ? [params.rollenartOfUser] : undefined,
        );
        if (rollenArtenForOrganisation.length === 0) {
            return [[], []];
        }

        if (params.systemrecht === RollenSystemRecht.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN) {
            const rollenArtenFromAllowList: Array<RollenArt> = this.getLimitedRollenarten();
            const limitedRollenarten: Array<RollenArt> = intersection(
                rollenArtenForOrganisation,
                rollenArtenFromAllowList,
            );
            return [limitedRollenarten, rollenArtenForOrganisation];
        } else {
            return [rollenArtenForOrganisation, rollenArtenForOrganisation];
        }
    }

    private async resolveAllowedRollenArten(
        orgaIds: Array<OrganisationID>,
        selectedRollenArten?: Array<RollenArt>,
    ): Promise<Array<RollenArt>> {
        const distinctOrganisationsTypen: Array<OrganisationsTyp> =
            await this.organisationRepository.findDistinctOrganisationsTypen(orgaIds);
        const rollenArtenForOrganisationen: Array<RollenArt> = Array.from(
            OrganisationMatchesRollenart.getAllowedRollenartenForOrganisationTypes(distinctOrganisationsTypen),
        );
        if (selectedRollenArten && selectedRollenArten.length > 0) {
            return intersection(rollenArtenForOrganisationen, selectedRollenArten);
        }
        return rollenArtenForOrganisationen;
    }

    private getLimitedRollenarten(): Array<RollenArt> {
        const portalConfig: PortalConfig = this.configService.getOrThrow<PortalConfig>('PORTAL');
        return portalConfig.LIMITED_ROLLENART_ALLOWLIST;
    }

    private async resolveOrganisationBounds(
        permittedOrgas: PermittedOrgas,
        selectedOrgas?: Array<OrganisationID>,
    ): Promise<OrganisationBounds> {
        if (selectedOrgas && selectedOrgas.length > 0) {
            return this.resolveOrganisationBoundsWithSelection(permittedOrgas, selectedOrgas);
        } else {
            return this.resolveOrganisationBoundsWithoutSelection(permittedOrgas);
        }
    }

    private async resolveOrganisationBoundsWithSelection(
        permittedOrgas: PermittedOrgas,
        selectedOrgas: Array<OrganisationID>,
    ): Promise<EmptyOrganisationBounds | BoundedOrganisationBounds> {
        const narrowedSelection: OrganisationID[] = intersectPermittedAndRequestedOrgas(permittedOrgas, selectedOrgas);
        if (narrowedSelection.length === 0) {
            return { kind: OrganisationBoundsKind.EMPTY };
        }

        const selectedOrgasWithParents: OrganisationID[] = await this.getOrganisationIdsWithParents(narrowedSelection);
        if (selectedOrgasWithParents.length === 0) {
            return { kind: OrganisationBoundsKind.EMPTY };
        }

        return {
            selectedAndPermittedOrgas: narrowedSelection,
            selectedAndPermittedOrgasWithParents: selectedOrgasWithParents,
            kind: OrganisationBoundsKind.BOUNDED,
        };
    }

    private async resolveOrganisationBoundsWithoutSelection(
        permittedOrgas: PermittedOrgas,
    ): Promise<OrganisationBounds> {
        if (permittedOrgas.all) {
            return { kind: OrganisationBoundsKind.UNBOUNDED };
        }

        const selectedOrgasWithParents: OrganisationID[] = await this.getOrganisationIdsWithParents(
            permittedOrgas.orgaIds,
        );
        if (selectedOrgasWithParents.length === 0) {
            return { kind: OrganisationBoundsKind.EMPTY };
        }

        return {
            selectedAndPermittedOrgas: permittedOrgas.orgaIds,
            selectedAndPermittedOrgasWithParents: selectedOrgasWithParents,
            kind: OrganisationBoundsKind.BOUNDED,
        };
    }

    private async getOrganisationIdsWithParents(organisationIds: OrganisationID[]): Promise<OrganisationID[]> {
        if (organisationIds.length === 0) {
            return [];
        }

        const organisationIdsWithParents: Set<OrganisationID> = new Set(organisationIds);

        const parents: Organisation<true>[] = await this.organisationRepository.findParentOrgasForIds(organisationIds);
        for (const parent of parents) {
            organisationIdsWithParents.add(parent.id);
        }

        return Array.from(organisationIdsWithParents);
    }

    private async hasMPTRollenVerwaltenPermission(
        permissions: IPersonPermissions,
        organisationIds?: Array<OrganisationID>,
    ): Promise<boolean> {
        if (organisationIds) {
            const individualOrgaPermissions: boolean[] = await Promise.all(
                organisationIds.map((orga: OrganisationID) =>
                    permissions.hasSystemrechtAtOrganisation(orga, RollenSystemRecht.MPT_ROLLEN_VERWALTEN),
                ),
            );
            return individualOrgaPermissions.every(Boolean);
        } else {
            return permissions.hasSystemrechteAtRootOrganisation([RollenSystemRecht.MPT_ROLLEN_VERWALTEN]);
        }
    }
}
