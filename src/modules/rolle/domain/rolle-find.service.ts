import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { intersection } from 'lodash-es';
import { ServerConfig } from '../../../shared/config/index.js';
import { PortalConfig } from '../../../shared/config/portal.config.js';
import { mapStringsToRollenArt } from '../../../shared/config/utils.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { OrganisationID, RolleID } from '../../../shared/types/aggregate-ids.types.js';
import { intersectPermittedAndRequestedOrgas, PermittedOrgas } from '../../authentication/domain/person-permissions.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RolleFindByParameters, RolleRepo } from '../repo/rolle.repo.js';
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

@Injectable()
export class RolleFindService {
    public constructor(
        private readonly rolleRepo: RolleRepo,
        private readonly organisationRepository: OrganisationRepository,
        private readonly configService: ConfigService<ServerConfig>,
    ) {}

    public async findRollenAvailableForErweiterung(
        params: FindRollenWithPermissionsParams & { requestedSystemrechte?: RollenSystemRecht[] },
    ): Promise<Counted<Rolle<true>>> {
        const permittedOrgas: PermittedOrgas = await params.permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.ROLLEN_ERWEITERN],
            true,
        );
        if (permittedOrgas.all === false && permittedOrgas.orgaIds.length === 0) {
            return [[], 0];
        }

        let permittedAndRequestedOrganisationenIds: OrganisationID[] | undefined;
        if (params.organisationIds && params.organisationIds.length > 0) {
            permittedAndRequestedOrganisationenIds = intersectPermittedAndRequestedOrgas(
                permittedOrgas,
                params.organisationIds,
            );
        } else if (permittedOrgas.all === false) {
            permittedAndRequestedOrganisationenIds = permittedOrgas.orgaIds;
        }

        let permittedAndRequestedOrganisationenIdsWithParents: OrganisationID[] | undefined;
        if (permittedAndRequestedOrganisationenIds !== undefined) {
            permittedAndRequestedOrganisationenIdsWithParents = await this.getOrganisationIdsWithParents(
                permittedAndRequestedOrganisationenIds,
            );
            if (permittedAndRequestedOrganisationenIdsWithParents.length === 0) {
                return [[], 0];
            }
        }

        // Only honor a request to include MPT rollen if the caller actually holds the Right
        const wantsMptRollen: boolean =
            params.requestedSystemrechte?.includes(RollenSystemRecht.MPT_ROLLEN_VERWALTEN) ?? false;
        let hasMptRollenVerwaltenPermission: boolean = false;
        if (wantsMptRollen) {
            const mptPermittedOrgas: PermittedOrgas = await params.permissions.getOrgIdsWithSystemrecht(
                [RollenSystemRecht.MPT_ROLLEN_VERWALTEN],
                true,
            );
            hasMptRollenVerwaltenPermission = mptPermittedOrgas.all || mptPermittedOrgas.orgaIds.length > 0;
        }

        // we can assume that MPT_ROLLEN_VERWALTEN is not exclusive to a single orga here, since matchAll on
        // permissions.getOrgIdsWithSystemrecht is true by default
        const excludeMerkmale: RollenMerkmal[] | undefined = hasMptRollenVerwaltenPermission
            ? undefined
            : [RollenMerkmal.MPT_ROLLE];

        const queryParams: RolleFindByParameters = {
            searchStr: params.searchStr,
            allowedOrganisationIds: permittedAndRequestedOrganisationenIdsWithParents,
            limit: params.limit,
            offset: params.offset,
            excludeMerkmale,
        };

        if (permittedAndRequestedOrganisationenIds !== undefined && permittedAndRequestedOrganisationenIds.length > 0) {
            const organisationsTypen: OrganisationsTyp[] =
                await this.organisationRepository.findDistinctOrganisationsTypen(
                    permittedAndRequestedOrganisationenIds,
                );
            const rollenArtenForOrganisationsTypen: RollenArt[] =
                this.mapOrganisationsTypenToRollenArten(organisationsTypen);
            queryParams.rollenArten = params.rollenArten
                ? intersection(params.rollenArten, rollenArtenForOrganisationsTypen)
                : rollenArtenForOrganisationsTypen;
        } else {
            queryParams.rollenArten = params.rollenArten;
        }

        return this.rolleRepo.findBy(queryParams);
    }

    public async findRollenAvailableForImportPersonenkontext(
        params: FindRollenWithPermissionsParams,
    ): Promise<Counted<Rolle<true>>> {
        const permittedOrgas: PermittedOrgas = await params.permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.IMPORT_DURCHFUEHREN],
            true,
            false,
        );
        if (permittedOrgas.all === false && permittedOrgas.orgaIds.length === 0) {
            return [[], 0];
        }
        if (params.organisationIds === undefined || params.organisationIds.length === 0) {
            return [[], 0];
        }

        let organisationIdsWithParents: OrganisationID[] | undefined;

        if (permittedOrgas.all === true) {
            organisationIdsWithParents = await this.getOrganisationIdsWithParents(params.organisationIds);
        } else {
            const intersectedOrganisationIds: OrganisationID[] = intersectPermittedAndRequestedOrgas(
                permittedOrgas,
                params.organisationIds,
            );
            if (intersectedOrganisationIds.length === 0) {
                return [[], 0];
            }
            organisationIdsWithParents = await this.getOrganisationIdsWithParents(intersectedOrganisationIds);
        }

        const [candidateRollen]: Counted<Rolle<true>> = await this.rolleRepo.findBy({
            searchStr: params.searchStr,
            allowedOrganisationIds: organisationIdsWithParents,
            rollenArten: params.rollenArten,
            excludeMerkmale: [RollenMerkmal.MPT_ROLLE],
        });

        const paramOrgas: Organisation<true>[] = Array.from(
            (await this.organisationRepository.findByIds(params.organisationIds ?? [])).values(),
        );

        let allowedRollen: Rolle<true>[] = (
            await Promise.all(
                candidateRollen.map(async (rolle: Rolle<true>) => {
                    const canBeAssignedToAnyTargetOrga: boolean = (
                        await Promise.all(
                            paramOrgas.map(async (organisation: Organisation<true>) => {
                                const canAssignResult: Result<void, Error> =
                                    await rolle.canBeAssignedToOrga(organisation);
                                return canAssignResult.ok;
                            }),
                        )
                    ).some(Boolean);

                    return canBeAssignedToAnyTargetOrga ? rolle : null;
                }),
            )
        ).filter((rolle: Rolle<true> | null): rolle is Rolle<true> => rolle !== null);

        const total: number = allowedRollen.length;
        const offset: number = params.offset ?? 0;
        const limit: number | undefined = params.limit;

        if (limit !== undefined) {
            allowedRollen = allowedRollen.slice(offset, offset + limit);
        } else if (offset > 0) {
            allowedRollen = allowedRollen.slice(offset);
        }

        return [allowedRollen, total];
    }

    public async findMptRollenAuthorized(
        permissions: IPersonPermissions,
        includeTechnische: boolean,
        searchStr?: string,
        limit?: number,
        offset?: number,
        organisationIds?: OrganisationID[],
        rolleIds?: RolleID[],
    ): Promise<Counted<Rolle<true>>> {
        const orgIdsWithRecht: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.MPT_ROLLEN_VERWALTEN],
            true,
        );

        // Narrow the requested organisation IDs using the allowed organisations
        let filteredRequestedOrgaIds: OrganisationID[] | undefined;
        if (organisationIds && organisationIds.length > 0) {
            filteredRequestedOrgaIds = intersectPermittedAndRequestedOrgas(orgIdsWithRecht, organisationIds);
        } else if (!orgIdsWithRecht.all) {
            filteredRequestedOrgaIds = orgIdsWithRecht.orgaIds;
        }

        if (filteredRequestedOrgaIds && filteredRequestedOrgaIds.length === 0) {
            return [[], 0];
        }

        let allowedOrganisationIds: OrganisationID[] | undefined = filteredRequestedOrgaIds;
        let rollenartFilter: RollenArt[] | undefined;
        if (filteredRequestedOrgaIds) {
            const [orgaTypes, orgaIdsWithParents]: [OrganisationsTyp[], OrganisationID[]] = await Promise.all([
                this.organisationRepository.findDistinctOrganisationsTypen(filteredRequestedOrgaIds),
                this.getOrganisationIdsWithParents(filteredRequestedOrgaIds),
            ]);

            // Get organisations to create rollenart filter
            rollenartFilter = Array.from(
                OrganisationMatchesRollenart.getAllowedRollenartenForOrganisationTypes(orgaTypes),
            );

            // Set allowed orgas
            allowedOrganisationIds = orgaIdsWithParents;
        }

        return this.rolleRepo.findBy({
            includeTechnische,
            searchStr,
            limit,
            offset,
            allowedOrganisationIds,
            rolleIds,
            requireMerkmale: [RollenMerkmal.MPT_ROLLE],
            orderBy: 'artAndName',
            rollenArten: rollenartFilter,
        });
    }

    public async findRollenAvailableForPersonenkontextCreation(
        params: FindRollenForPersonenkontextCreationWithPermissionsParams,
    ): Promise<Counted<Rolle<true>>> {
        const organisation: Option<Organisation<true>> = await this.organisationRepository.findById(
            params.organisationId,
        );
        if (!organisation) {
            return [[], 0];
        }

        if (!(await params.permissions.hasSystemrechtAtOrganisation(params.organisationId, params.systemrecht))) {
            return [[], 0];
        }

        const [allowedRollenarten, allowedRollenartenForMPTRollen]: [Array<RollenArt>, Array<RollenArt>] =
            this.getAllowedRollenArtenForPersonenkontextCreation(params, organisation);
        if (allowedRollenartenForMPTRollen.length === 0) {
            return [[], 0];
        }

        const hasMPTPermission: boolean = await params.permissions.hasSystemrechtAtOrganisation(
            params.organisationId,
            RollenSystemRecht.MPT_ROLLEN_VERWALTEN,
        );

        const allowedOrganisationIds: Array<OrganisationID> = await this.getOrganisationIdsWithParents([
            params.organisationId,
        ]);

        const rollen: Counted<Rolle<true>> = await this.rolleRepo.findRollenAvailableForPersonenkontextCreation({
            organisationId: params.organisationId,
            allowedOrganisationIds,
            allowedRollenarten,
            mpt: hasMPTPermission
                ? {
                      allowedRollenarten: allowedRollenartenForMPTRollen,
                  }
                : undefined,
            stickyRollenIds: params.rollenIds,
            limit: params.limit,
            offset: params.offset,
            searchStr: params.rolleName,
        });

        return rollen;
    }

    /**
     * Returns two arrays of allowed rollenarten based on parameters. The latter is the more general one, while the first may be narrowed based on users permissions and LIMITED_ROLLENART_ALLOWLIST
     * @param params
     * @param organisation
     * @returns [allowedRollenarten, allowedRollenartenForMPTRollen]
     */
    private getAllowedRollenArtenForPersonenkontextCreation(
        params: FindRollenForPersonenkontextCreationWithPermissionsParams,
        organisation: Organisation<true>,
    ): [Array<RollenArt>, Array<RollenArt>] {
        if (!organisation.typ) {
            return [[], []];
        }

        const rollenartenForOrganisation: Array<RollenArt> = Array.from(
            OrganisationMatchesRollenart.getAllowedRollenartenForOrganisationsTyp(organisation.typ),
        );
        const allowedRollenartenForMPTRollen: Array<RollenArt> =
            params.rollenartOfUser && rollenartenForOrganisation.includes(params.rollenartOfUser)
                ? [params.rollenartOfUser]
                : rollenartenForOrganisation;

        let eingeschraenkteRollenarten: Array<RollenArt> | undefined;
        if (params.systemrecht === RollenSystemRecht.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN) {
            const portalConfig: PortalConfig = this.configService.getOrThrow<PortalConfig>('PORTAL');
            eingeschraenkteRollenarten = mapStringsToRollenArt(portalConfig.LIMITED_ROLLENART_ALLOWLIST ?? []);
        }
        const allowedRollenarten: Array<RollenArt> = eingeschraenkteRollenarten
            ? intersection(allowedRollenartenForMPTRollen, eingeschraenkteRollenarten)
            : allowedRollenartenForMPTRollen;

        return [allowedRollenarten, allowedRollenartenForMPTRollen];
    }

    private async getOrganisationIdsWithParents(organisationIds: OrganisationID[]): Promise<OrganisationID[]> {
        const organisationIdsWithParents: Set<OrganisationID> = new Set(organisationIds);
        const parents: Organisation<true>[] = await this.organisationRepository.findParentOrgasForIds(organisationIds);
        parents.forEach((parent: Organisation<true>) => organisationIdsWithParents.add(parent.id));
        return Array.from(organisationIdsWithParents);
    }

    private mapOrganisationsTypenToRollenArten(organisationenTypen: OrganisationsTyp[]): RollenArt[] {
        return Array.from(
            organisationenTypen.reduce<Set<RollenArt>>(
                (rollenArten: Set<RollenArt>, organisationsTyp: OrganisationsTyp) => {
                    OrganisationMatchesRollenart.getAllowedRollenartenForOrganisationsTyp(organisationsTyp).forEach(
                        (rollenart: RollenArt) => rollenArten.add(rollenart),
                    );
                    return rollenArten;
                },
                new Set<RollenArt>(),
            ),
        );
    }
}
