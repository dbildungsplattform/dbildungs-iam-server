import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isIn } from 'class-validator';
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
    GatedRollenFindScope,
    RolleFindByParameters,
    RolleRepo,
} from '../repo/rolle.repo.js';
import { RollenArt, RollenMerkmal } from './rolle.enums.js';
import { Rolle } from './rolle.js';
import { RollenmerkmalSystemrechtPaar } from './rollenmerkmal-systemrecht-paar.js';
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
    rollenartForPerson?: RollenArt;
    rolleName?: string;
    rollenIds?: Array<RolleID>;
    limit?: number;
    offset?: number;
}

export interface FindGatedRollenAuthorizedParams {
    permissions: IPersonPermissions;
    systemrecht: RollenSystemRecht;
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

interface FindRollenForPersonenImportParams {
    permissions: IPersonPermissions;
    organisationId: OrganisationID;
    rollenArten?: Array<RollenArt>;
    searchStr?: string;
    limit?: number;
    offset?: number;
}

export type FindRollenAvailableForErweiterungParams = FindRollenWithPermissionsParams & {
    requestedSystemrechte?: RollenSystemRecht[];
};

export interface FindRollenAvailableForPersonAdministrationParams {
    permissions: IPersonPermissions;
    searchStr?: string;
    organisationIds?: Array<OrganisationID>;
    limit?: number;
    offset?: number;
    requestedSystemrechte?: RollenSystemRecht[];
}

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
            [RollenSystemRecht.ROLLEN_ERWEITERN],
            true,
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
                    const gatedRollenFindScopes: GatedRollenFindScope[] = await this.resolveGatedRollenFindScopes(
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
                        Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                        gatedRollenFindScopes,
                    );
                }
                break;
            case OrganisationBoundsKind.UNBOUNDED:
                {
                    const gatedRollenFindScopes: GatedRollenFindScope[] = await this.resolveGatedRollenFindScopes(
                        params.permissions,
                        params.requestedSystemrechte,
                    );
                    rolleFindByParams = this.createRolleFindByParams(
                        params,
                        {
                            allowedOrganisationIds: undefined,
                            rollenArten: params.rollenArten,
                        },
                        Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                        gatedRollenFindScopes,
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
            Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
        );

        return this.rolleRepo.findBy(rolleFindByParams);
    }

    public async findRollenAvailableForPersonenkontextCreation(
        params: FindRollenForPersonenkontextCreationWithPermissionsParams,
    ): Promise<Counted<Rolle<true>>> {
        if (
            !isIn(params.systemrecht, [
                RollenSystemRecht.PERSONEN_VERWALTEN,
                RollenSystemRecht.PERSONEN_ANLEGEN,
                RollenSystemRecht.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN,
            ])
        ) {
            return [[], 0];
        }
        const permittedOrgas: PermittedOrgas = await params.permissions.getOrgIdsWithSystemrecht([params.systemrecht]);
        const organisationBounds: EmptyOrganisationBounds | BoundedOrganisationBounds =
            await this.resolveOrganisationBoundsWithSelection(permittedOrgas, [params.organisationId]);
        switch (organisationBounds.kind) {
            case OrganisationBoundsKind.EMPTY:
                return [[], 0];
            case OrganisationBoundsKind.BOUNDED:
                break;
        }

        const [allowedRollenarten, allowedRollenartenForGatedRollen]: [Array<RollenArt>, Array<RollenArt>] =
            await this.getAllowedRollenArtenForPersonenkontextCreation(
                params,
                organisationBounds.selectedAndPermittedOrgas,
            );
        if (allowedRollenartenForGatedRollen.length === 0) {
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

        const authorizedGatedMerkmale: RollenMerkmal[] = await params.permissions.getPermittedMerkmaleForOrga(
            params.organisationId,
        );
        if (authorizedGatedMerkmale.length > 0) {
            query.gatedBucket = {
                allowedRollenarten: allowedRollenartenForGatedRollen,
                authorizedMerkmale: authorizedGatedMerkmale,
            };
        }

        return this.rolleRepo.findRollenAvailableForPersonenkontextCreation(query);
    }

    public async findRollenAvailableForPersonAdministration(
        params: FindRollenAvailableForPersonAdministrationParams,
    ): Promise<Counted<Rolle<true>>> {
        const permittedOrgas: PermittedOrgas = await params.permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.PERSONEN_VERWALTEN],
            true,
            true,
        );

        const organisationBounds: OrganisationBounds = await this.resolveOrganisationBounds(
            permittedOrgas,
            params.organisationIds,
        );

        let rollenArten: RollenArt[] | undefined;
        let allowedOrganisationIds: OrganisationID[] | undefined;
        let gatedRollenFindScopes: GatedRollenFindScope[];
        switch (organisationBounds.kind) {
            case OrganisationBoundsKind.BOUNDED:
                rollenArten = await this.resolveAllowedRollenArten(organisationBounds.selectedAndPermittedOrgas);
                allowedOrganisationIds = organisationBounds.selectedAndPermittedOrgasWithParents;
                gatedRollenFindScopes = await this.resolveGatedRollenFindScopes(
                    params.permissions,
                    params.requestedSystemrechte,
                    organisationBounds.selectedAndPermittedOrgas,
                );
                break;
            case OrganisationBoundsKind.UNBOUNDED:
                rollenArten = undefined;
                allowedOrganisationIds = undefined;
                gatedRollenFindScopes = await this.resolveGatedRollenFindScopes(
                    params.permissions,
                    params.requestedSystemrechte,
                );
                break;
            case OrganisationBoundsKind.EMPTY:
                return [[], 0];
        }

        const rolleFindByParams: RolleFindByParameters = this.createRolleFindByParams(
            params,
            { allowedOrganisationIds, rollenArten },
            Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
            gatedRollenFindScopes,
        );

        return this.rolleRepo.findBy(rolleFindByParams);
    }

    /** Returns only Rollen that carry the Merkmal paired with the given gated RollenSystemRecht (e.g. MPT_ROLLEN_ZUORDNEN, PILOT_1_ROLLEN_ZUORDNEN, ...). */
    public async findRollenAuthorizedForGatedSystemrecht(
        params: FindGatedRollenAuthorizedParams,
    ): Promise<Counted<Rolle<true>>> {
        const paar: RollenmerkmalSystemrechtPaar | undefined = RollenmerkmalSystemrechtPaar.bySystemrecht(
            params.systemrecht,
        );
        if (!paar) {
            return [[], 0];
        }

        const orgIdsWithRecht: PermittedOrgas = await params.permissions.getOrgIdsWithSystemrecht(
            [params.systemrecht],
            true,
        );
        const organisationBounds: OrganisationBounds = await this.resolveOrganisationBounds(
            orgIdsWithRecht,
            params.organisationIds,
        );

        const sharedParams: Omit<
            RolleFindByParameters,
            'allowedOrganisationIds' | 'rollenArten' | 'excludeMerkmale' | 'gatedRollenFindScopes'
        > = {
            includeTechnische: false,
            searchStr: params.searchStr,
            limit: params.limit,
            offset: params.offset,
            rolleIds: params.rolleIds,
            requireMerkmale: [paar.merkmal],
            orderBy: 'artAndName',
        };
        let rolleFindByParams: RolleFindByParameters;
        switch (organisationBounds.kind) {
            case OrganisationBoundsKind.EMPTY:
                return [[], 0];
            case OrganisationBoundsKind.BOUNDED:
                {
                    const gatedRollenFindScopes: GatedRollenFindScope[] = await this.resolveGatedRollenFindScopes(
                        params.permissions,
                        Array.from(RollenmerkmalSystemrechtPaar.GATED_SYSTEMRECHTE),
                        organisationBounds.selectedAndPermittedOrgas,
                    );
                    rolleFindByParams = this.createRolleFindByParams(
                        sharedParams,
                        {
                            allowedOrganisationIds: organisationBounds.selectedAndPermittedOrgasWithParents,
                            rollenArten: await this.resolveAllowedRollenArten(
                                organisationBounds.selectedAndPermittedOrgas,
                            ),
                        },
                        Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE).filter(
                            (merkmal: RollenMerkmal) => merkmal !== paar.merkmal,
                        ),
                        gatedRollenFindScopes,
                    );
                }
                break;
            case OrganisationBoundsKind.UNBOUNDED: {
                const gatedRollenFindScopes: GatedRollenFindScope[] = await this.resolveGatedRollenFindScopes(
                    params.permissions,
                    Array.from(RollenmerkmalSystemrechtPaar.GATED_SYSTEMRECHTE),
                );
                rolleFindByParams = this.createRolleFindByParams(
                    sharedParams,
                    {
                        allowedOrganisationIds: undefined,
                        rollenArten: undefined,
                    },
                    Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE).filter(
                        (merkmal: RollenMerkmal) => merkmal !== paar.merkmal,
                    ),
                    gatedRollenFindScopes,
                );
            }
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
        excludeMerkmale: RollenMerkmal[] = [],
        gatedRollenFindScopes?: GatedRollenFindScope[],
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
            excludeMerkmale: excludeMerkmale.length > 0 ? excludeMerkmale : undefined,
        };
        if (gatedRollenFindScopes && gatedRollenFindScopes.length > 0) {
            params.gatedRollenFindScopes = gatedRollenFindScopes;
        }
        return params;
    }

    private async resolveGatedRollenFindScopes(
        permissions: IPersonPermissions,
        requestedSystemrechte: RollenSystemRecht[] = [],
        selectedAndPermittedOrgas?: Array<OrganisationID>,
    ): Promise<GatedRollenFindScope[]> {
        const requestedPairs: RollenmerkmalSystemrechtPaar[] = RollenmerkmalSystemrechtPaar.ALL.filter(
            (paar: RollenmerkmalSystemrechtPaar) => requestedSystemrechte.includes(paar.systemrecht),
        );
        if (requestedPairs.length === 0) {
            return [];
        }

        const permittedOrgasBySystemrecht: PermittedOrgas[] = selectedAndPermittedOrgas
            ? []
            : (
                  await Promise.all(
                      requestedPairs.map((paar: RollenmerkmalSystemrechtPaar) =>
                          permissions.getOrgIdsWithSystemrecht([paar.systemrecht], true),
                      ),
                  )
              ).map((permittedOrgas: PermittedOrgas | undefined) => permittedOrgas ?? { all: false, orgaIds: [] });
        const globallyPermittedMerkmale: RollenMerkmal[] = selectedAndPermittedOrgas
            ? []
            : permittedOrgasBySystemrecht.flatMap((permittedOrgas: PermittedOrgas, index: number) =>
                  permittedOrgas.all ? [requestedPairs[index]!.merkmal] : [],
              );
        const organisationIds: OrganisationID[] = selectedAndPermittedOrgas
            ? selectedAndPermittedOrgas
            : Array.from(
                      new Set(
                          permittedOrgasBySystemrecht.flatMap((permittedOrgas: PermittedOrgas) =>
                          permittedOrgas.all ? [] : permittedOrgas.orgaIds,
                      ),
                  ),
              );
        const organisationMerkmale: Map<OrganisationID, RollenMerkmal[]> = new Map();
        if (selectedAndPermittedOrgas) {
            const merkmalePerOrganisation: RollenMerkmal[][] = await Promise.all(
                organisationIds.map((organisationId: OrganisationID) =>
                    permissions.getPermittedMerkmaleForOrga(organisationId),
                ),
            );
            organisationIds.forEach((organisationId: OrganisationID, index: number) =>
                organisationMerkmale.set(organisationId, merkmalePerOrganisation[index] ?? []),
            );
        }

        const organisationIdsWithParents: Map<OrganisationID, OrganisationID[]> =
            await this.getOrganisationIdsWithParentsById(organisationIds);
        const scopes: GatedRollenFindScope[] = [];
        if (!selectedAndPermittedOrgas && globallyPermittedMerkmale.length > 0) {
            scopes.push({ authorizedMerkmale: globallyPermittedMerkmale });
        }

        for (const organisationId of organisationIds) {
            const authorizedMerkmale: RollenMerkmal[] = requestedPairs
                .filter((_paar: RollenmerkmalSystemrechtPaar, index: number) => {
                    if (selectedAndPermittedOrgas) {
                        return organisationMerkmale.get(organisationId)?.includes(_paar.merkmal) ?? false;
                    }
                    const permittedOrgas: PermittedOrgas = permittedOrgasBySystemrecht[index]!;
                    return (
                        permittedOrgas.all || permittedOrgas.orgaIds.includes(organisationId)
                    );
                })
                .map((paar: RollenmerkmalSystemrechtPaar) => paar.merkmal);
            if (authorizedMerkmale.length === 0) {
                continue;
            }
            scopes.push({
                allowedOrganisationIds: organisationIdsWithParents.get(organisationId) ?? [organisationId],
                authorizedMerkmale,
            });
        }

        return scopes;
    }

    private async getOrganisationIdsWithParentsById(
        organisationIds: OrganisationID[],
    ): Promise<Map<OrganisationID, OrganisationID[]>> {
        if (organisationIds.length === 0) {
            return new Map();
        }
        const organisationsAndParents: Organisation<true>[] =
            (await this.organisationRepository.findParentOrgasForIds(organisationIds)) ?? [];
        const organisationsById: Map<OrganisationID, Organisation<true>> = new Map(
            organisationsAndParents.map((organisation: Organisation<true>) => [organisation.id, organisation]),
        );
        const idsByOrganisation: Map<OrganisationID, OrganisationID[]> = new Map();
        for (const organisationId of organisationIds) {
            const allowedOrganisationIds: Set<OrganisationID> = new Set([organisationId]);
            let currentOrganisation: Organisation<true> | undefined = organisationsById.get(organisationId);
            while (currentOrganisation?.administriertVon) {
                const parentId: OrganisationID = currentOrganisation.administriertVon;
                if (allowedOrganisationIds.has(parentId)) {
                    break;
                }
                allowedOrganisationIds.add(parentId);
                currentOrganisation = organisationsById.get(parentId);
            }
            idsByOrganisation.set(organisationId, Array.from(allowedOrganisationIds));
        }
        return idsByOrganisation;
    }

    /**
     * Returns two arrays of allowed rollenarten based on parameters. The latter is the more general one, while the first may be narrowed based on users permissions and LIMITED_ROLLENART_ALLOWLIST
     * @param params
     * @param organisation
     * @returns [allowedRollenarten, allowedRollenartenForGatedRollen]
     */
    private async getAllowedRollenArtenForPersonenkontextCreation(
        params: FindRollenForPersonenkontextCreationWithPermissionsParams,
        selectedAndPermittedOrgas: Array<OrganisationID>,
    ): Promise<[Array<RollenArt>, Array<RollenArt>]> {
        const rollenArtenForOrganisation: Array<RollenArt> = await this.resolveAllowedRollenArten(
            selectedAndPermittedOrgas,
            params.rollenartForPerson ? [params.rollenartForPerson] : undefined,
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
}
