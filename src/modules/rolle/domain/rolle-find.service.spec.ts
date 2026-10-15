import { faker } from '@faker-js/faker';
import { Test, TestingModule } from '@nestjs/testing';
import { uniq } from 'lodash-es';
import { vi } from 'vitest';

import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { ConfigTestModule, DoFactory } from '../../../../test/utils/index.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { OrganisationID, RolleID } from '../../../shared/types/aggregate-ids.types.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RolleFindByParameters, RolleRepo } from '../repo/rolle.repo.js';
import {
    FindRollenAvailableForErweiterungParams,
    FindRollenWithPermissionsParams,
    RolleFindService,
} from './rolle-find.service.js';
import { RollenArt, RollenMerkmal } from './rolle.enums.js';
import { Rolle } from './rolle.js';
import { RollenmerkmalSystemrechtPaar } from './rollenmerkmal-systemrecht-paar.js';
import { OrganisationMatchesRollenart } from './specification/organisation-matches-rollenart.js';
import { RollenSystemRecht, RollenSystemRechtEnum } from './systemrecht.js';

function createPersonPermissionsMockWithAllGatedMerkmale(): DeepMocked<PersonPermissions> {
    const permissions: DeepMocked<PersonPermissions> = createMock(PersonPermissions);
    permissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
    permissions.getPermittedMerkmaleForOrga.mockResolvedValue(Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE));
    return permissions;
}

function getValidationObjectForPersonAdministrationFindByParams(params: {
    searchStr?: string;
    limit?: number;
    offset?: number;
    expectedOrganisationIds?: Array<OrganisationID>;
    expectedRollenArten?: Array<RollenArt>;
    expectedExcludeMerkmale?: Array<RollenMerkmal>;
}): Partial<RolleFindByParameters> {
    const validatorObject: Partial<RolleFindByParameters> = {
        searchStr: params.searchStr,
        limit: params.limit,
        offset: params.offset,
    };
    if (params.expectedRollenArten) {
        validatorObject.rollenArten = expect.arrayContaining(
            params.expectedRollenArten,
        ) as typeof params.expectedRollenArten;
    }
    if (params.expectedOrganisationIds) {
        validatorObject.allowedOrganisationIds = expect.arrayContaining(
            params.expectedOrganisationIds,
        ) as typeof params.expectedOrganisationIds;
    }
    if (params.expectedExcludeMerkmale) {
        validatorObject.excludeMerkmale = expect.arrayContaining(
            params.expectedExcludeMerkmale,
        ) as typeof params.expectedExcludeMerkmale;
    }
    return validatorObject;
}

describe('RolleFindService', () => {
    let module: TestingModule;
    let rolleFindService: RolleFindService;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let organisationRepoMock: DeepMocked<OrganisationRepository>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule],
            providers: [
                RolleFindService,
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
            ],
        }).compile();
        rolleFindService = module.get(RolleFindService);
        rolleRepoMock = module.get(RolleRepo);
        organisationRepoMock = module.get(OrganisationRepository);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(rolleFindService).toBeDefined();
    });

    describe('findRollenAvailableForErweiterung', () => {
        let permissionsMock: DeepMocked<PersonPermissions>;
        beforeEach(() => {
            permissionsMock = createPersonPermissionsMockWithAllGatedMerkmale();
            permissionsMock.getPermittedMerkmaleForOrga.mockResolvedValue(
                Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
            );
        });

        it('should return empty array if no permitted orgas', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });
            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForErweiterung({
                permissions: permissionsMock,
            });
            expect(result).toEqual([[], 0]);
        });

        it('should call rolleRepo.findBy with correct query', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            const params: FindRollenWithPermissionsParams = {
                permissions: permissionsMock,
                rollenArten: [RollenArt.SYSADMIN],
                limit: 10,
                offset: 0,
            };
            await rolleFindService.findRollenAvailableForErweiterung(params);
            expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    searchStr: params.searchStr,
                    allowedOrganisationIds: undefined,
                    limit: params.limit,
                    offset: params.offset,
                    rollenArten: params.rollenArten,
                    excludeMerkmale: Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                }),
            );
        });

        it('should filter by permitted orgas and requested orgas', async () => {
            const allowedOrgas: Array<Organisation<true>> = DoFactory.createMany(3, true, DoFactory.createOrganisation);
            const requestedOrgas: Organisation<true>[] = allowedOrgas.slice(1);
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: allowedOrgas.map((o: Organisation<true>) => o.id),
            });
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([]);
            organisationRepoMock.findDistinctOrganisationsTypen.mockImplementationOnce((orgaIds: OrganisationID[]) => {
                const s: Set<OrganisationsTyp> = new Set();
                allowedOrgas.forEach((o: Organisation<true>) => {
                    if (orgaIds.includes(o.id)) {
                        s.add(o.typ);
                    }
                });
                return Promise.resolve(Array.from(s));
            });
            const params: FindRollenWithPermissionsParams = {
                permissions: permissionsMock,
                organisationIds: requestedOrgas.map((o: Organisation<true>) => o.id),
            };
            await rolleFindService.findRollenAvailableForErweiterung(params);

            expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                expect.objectContaining<RolleFindByParameters>({
                    allowedOrganisationIds: expect.arrayContaining(
                        requestedOrgas.map((o: Organisation<true>) => o.id),
                    ) as Array<OrganisationID>,
                    rollenArten: expect.arrayContaining(
                        uniq(
                            requestedOrgas
                                .map((o: Organisation<true>) =>
                                    OrganisationMatchesRollenart.getAllowedRollenartenForOrganisationsTyp(o.typ),
                                )
                                .flatMap((set: Set<RollenArt>) => Array.from(set)),
                        ),
                    ) as Array<RollenArt>,
                }),
            );
        });

        it('should filter by permitted orgas if no orgas are requested', async () => {
            const allowedOrgas: Array<Organisation<true>> = DoFactory.createMany(3, true, DoFactory.createOrganisation);
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: allowedOrgas.map((o: Organisation<true>) => o.id),
            });
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([]);
            organisationRepoMock.findDistinctOrganisationsTypen.mockImplementationOnce((orgaIds: OrganisationID[]) => {
                const s: Set<OrganisationsTyp> = new Set();
                allowedOrgas.forEach((o: Organisation<true>) => {
                    if (orgaIds.includes(o.id)) {
                        s.add(o.typ);
                    }
                });
                return Promise.resolve(Array.from(s));
            });
            const params: FindRollenWithPermissionsParams = {
                permissions: permissionsMock,
            };
            await rolleFindService.findRollenAvailableForErweiterung(params);
            expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                expect.objectContaining<RolleFindByParameters>({
                    allowedOrganisationIds: expect.arrayContaining(
                        allowedOrgas.map((o: Organisation<true>) => o.id),
                    ) as Array<OrganisationID>,
                    rollenArten: expect.arrayContaining(
                        uniq(
                            allowedOrgas
                                .map((o: Organisation<true>) =>
                                    OrganisationMatchesRollenart.getAllowedRollenartenForOrganisationsTyp(o.typ),
                                )
                                .flatMap((set: Set<RollenArt>) => Array.from(set)),
                        ),
                    ) as Array<RollenArt>,
                }),
            );
        });

        it('should narrow allowed rollenarten if requested', async () => {
            const allowedOrgas: Array<Organisation<true>> = [
                DoFactory.createOrganisation(true, { typ: OrganisationsTyp.ROOT }),
                DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE }),
                DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SONSTIGE }),
            ];
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: allowedOrgas.map((o: Organisation<true>) => o.id),
            });
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([]);
            organisationRepoMock.findDistinctOrganisationsTypen.mockImplementationOnce((orgaIds: OrganisationID[]) => {
                const s: Set<OrganisationsTyp> = new Set();
                allowedOrgas.forEach((o: Organisation<true>) => {
                    if (orgaIds.includes(o.id)) {
                        s.add(o.typ);
                    }
                });
                return Promise.resolve(Array.from(s));
            });
            const params: FindRollenWithPermissionsParams = {
                permissions: permissionsMock,
                rollenArten: [RollenArt.SYSADMIN],
            };
            await rolleFindService.findRollenAvailableForErweiterung(params);
            expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                expect.objectContaining<RolleFindByParameters>({
                    allowedOrganisationIds: expect.arrayContaining<OrganisationID>(
                        allowedOrgas.map((o: Organisation<true>) => o.id),
                    ) as Array<OrganisationID>,
                    rollenArten: expect.arrayContaining([RollenArt.SYSADMIN]) as Array<RollenArt>,
                }),
            );
        });

        it('should return empty array if filtered organisationenIds is empty', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: ['orga-1'] });
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([]);
            const params: FindRollenWithPermissionsParams = {
                permissions: permissionsMock,
                organisationIds: ['orga-2'],
            };

            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForErweiterung(params);

            expect(result).toEqual([[], 0]);
            expect(rolleRepoMock.findBy).not.toHaveBeenCalled();
        });

        it('should return empty array if allowed organisationIds and rollenarten do not match', async () => {
            const schule: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [schule.id],
            });
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([]);
            organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValueOnce([OrganisationsTyp.SCHULE]);

            const params: FindRollenWithPermissionsParams = {
                permissions: permissionsMock,
                rollenArten: [RollenArt.SYSADMIN],
                organisationIds: [schule.id],
            };

            await rolleFindService.findRollenAvailableForErweiterung(params);

            expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                expect.objectContaining<RolleFindByParameters>({
                    allowedOrganisationIds: [schule.id],
                    rollenArten: [],
                }),
            );
        });

        it('should filter by searchStr if provided', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            const params: FindRollenWithPermissionsParams = {
                permissions: permissionsMock,
                searchStr: 'test',
            };
            await rolleFindService.findRollenAvailableForErweiterung(params);
            expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                expect.objectContaining<RolleFindByParameters>({
                    searchStr: params.searchStr,
                }),
            );
        });

        it('should include MPT rollen when caller has MPT_ROLLEN_ZUORDNEN permission and requests it', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValue(true);
            const params: FindRollenWithPermissionsParams & { requestedSystemrechte?: RollenSystemRecht[] } = {
                permissions: permissionsMock,
                requestedSystemrechte: [RollenSystemRecht.ROLLEN_ERWEITERN, RollenSystemRecht.MPT_ROLLEN_ZUORDNEN],
            };
            await rolleFindService.findRollenAvailableForErweiterung(params);
            expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                expect.objectContaining<RolleFindByParameters>({
                    gatedRollenFindScopes: [{ authorizedMerkmale: [RollenMerkmal.MPT_ROLLE] }],
                }),
            );
        });

        it('should not include MPT rollen when requested but denied on an unbounded (root) scope', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockImplementation((systemrechte: RollenSystemRecht[]) =>
                Promise.resolve(
                    systemrechte[0] === RollenSystemRecht.ROLLEN_ERWEITERN
                        ? { all: true }
                        : { all: false, orgaIds: [] },
                ),
            );
            const params: FindRollenWithPermissionsParams & { requestedSystemrechte?: RollenSystemRecht[] } = {
                permissions: permissionsMock,
                requestedSystemrechte: [RollenSystemRecht.ROLLEN_ERWEITERN, RollenSystemRecht.MPT_ROLLEN_ZUORDNEN],
            };
            await rolleFindService.findRollenAvailableForErweiterung(params);
            expect(rolleRepoMock.findBy.mock.lastCall![0].gatedRollenFindScopes).toBeUndefined();
            expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                expect.objectContaining<RolleFindByParameters>({
                    excludeMerkmale: Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                }),
            );
        });

        it('should not include MPT rollen when caller does not have MPT_ROLLEN_ZUORDNEN permission, but requests it', async () => {
            const traeger: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.TRAEGER,
            });
            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
            });
            permissionsMock.getOrgIdsWithSystemrecht.mockImplementation((systemrechte: RollenSystemRecht[]) =>
                Promise.resolve({
                    all: false,
                    orgaIds: systemrechte[0] === RollenSystemRecht.ROLLEN_ERWEITERN ? [schule.id] : [],
                }),
            );
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([traeger]);
            organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([OrganisationsTyp.SCHULE]);
            const params: FindRollenAvailableForErweiterungParams = {
                permissions: permissionsMock,
                requestedSystemrechte: [RollenSystemRecht.ROLLEN_ERWEITERN, RollenSystemRecht.MPT_ROLLEN_ZUORDNEN],
            };

            await rolleFindService.findRollenAvailableForErweiterung(params);

            expect(rolleRepoMock.findBy.mock.lastCall![0].gatedRollenFindScopes).toBeUndefined();
            expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                expect.objectContaining<RolleFindByParameters>({
                    excludeMerkmale: Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                }),
            );
        });

        it('should exclude MPT rollen when MPT_ROLLEN_ZUORDNEN is not requested', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            const params: FindRollenWithPermissionsParams = {
                permissions: permissionsMock,
            };
            await rolleFindService.findRollenAvailableForErweiterung(params);
            expect(rolleRepoMock.findBy.mock.lastCall![0].gatedRollenFindScopes).toBeUndefined();
            expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                expect.objectContaining<Partial<RolleFindByParameters>>({
                    excludeMerkmale: Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                }),
            );
        });

        it('should not return rollen without extension permission even when gated rights are granted', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });
            const params: FindRollenAvailableForErweiterungParams = {
                permissions: permissionsMock,
                requestedSystemrechte: [RollenSystemRecht.ROLLEN_ERWEITERN, RollenSystemRecht.MPT_ROLLEN_ZUORDNEN],
            };
            await rolleFindService.findRollenAvailableForErweiterung(params);
            expect(rolleRepoMock.findBy).not.toHaveBeenCalled();
        });
    });

    describe('findRollenAvailableForImportPersonenkontext', () => {
        let permissionsMock: DeepMocked<PersonPermissions>;
        beforeEach(() => {
            permissionsMock = createPersonPermissionsMockWithAllGatedMerkmale();
        });

        it('should return empty array if no permitted orgas', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });

            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForImportPersonenkontext({
                permissions: permissionsMock,
                organisationId: 'orga-1',
            });

            expect(result).toEqual([[], 0]);
            expect(permissionsMock.getOrgIdsWithSystemrecht).toHaveBeenCalledWith(
                [RollenSystemRecht.IMPORT_DURCHFUEHREN],
                true,
                false,
            );
        });

        it('should return empty array if requested organisationIds are not permitted', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: ['orga-1'] });

            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForImportPersonenkontext({
                permissions: permissionsMock,
                organisationId: 'orga-2',
            });

            expect(result).toEqual([[], 0]);
            expect(rolleRepoMock.findBy).not.toHaveBeenCalled();
        });

        it('should apply offset and limit', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([OrganisationsTyp.SCHULE]);
            organisationRepoMock.findById.mockResolvedValue(
                DoFactory.createOrganisation(true, { id: 'orga-1', typ: OrganisationsTyp.SCHULE }),
            );
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([]);

            await rolleFindService.findRollenAvailableForImportPersonenkontext({
                permissions: permissionsMock,
                organisationId: 'orga-1',
                offset: 1,
                limit: 1,
            });

            expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                expect.objectContaining<RolleFindByParameters>({
                    offset: 1,
                    limit: 1,
                    excludeMerkmale: Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                }),
            );
        });
    });

    describe('findRollenAuthorizedForGatedSystemrecht', () => {
        const searchStr: string = faker.string.alphanumeric();
        const limit: number = faker.number.int();
        const offset: number = faker.number.int();
        const rolleIds: RolleID[] = [faker.string.uuid()];

        it.each([
            { bounded: false, hasPilotPermission: false },
            { bounded: false, hasPilotPermission: true },
            { bounded: true, hasPilotPermission: false },
            { bounded: true, hasPilotPermission: true },
        ])(
            'should enforce additional Pilot permission (bounded=$bounded, granted=$hasPilotPermission)',
            async ({ bounded, hasPilotPermission }: { bounded: boolean; hasPilotPermission: boolean }) => {
                const permissionsMock: DeepMocked<IPersonPermissions> =
                    createPersonPermissionsMockWithAllGatedMerkmale();
                permissionsMock.getOrgIdsWithSystemrecht.mockImplementation((systemrechte: RollenSystemRecht[]) => {
                    const systemrecht: RollenSystemRecht | undefined = systemrechte[0];
                    return Promise.resolve({
                        all:
                            systemrecht === RollenSystemRecht.MPT_ROLLEN_ZUORDNEN ||
                            (hasPilotPermission && systemrecht === RollenSystemRecht.PILOT_1_ROLLEN_ZUORDNEN),
                        orgaIds: [],
                    });
                });
                permissionsMock.getPermittedMerkmaleForOrga.mockResolvedValue(
                    hasPilotPermission
                        ? [RollenMerkmal.MPT_ROLLE, RollenMerkmal.PILOT_1_ROLLE]
                        : [RollenMerkmal.MPT_ROLLE],
                );
                organisationRepoMock.findParentOrgasForIds.mockResolvedValue([]);
                organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([OrganisationsTyp.SCHULE]);
                rolleRepoMock.findBy.mockResolvedValue([[], 0]);

                await rolleFindService.findRollenAuthorizedForGatedSystemrecht({
                    permissions: permissionsMock,
                    systemrecht: RollenSystemRecht.MPT_ROLLEN_ZUORDNEN,
                    organisationIds: bounded ? ['schule-1'] : undefined,
                });

                const permittedMerkmale: RollenMerkmal[] = hasPilotPermission
                    ? [RollenMerkmal.MPT_ROLLE, RollenMerkmal.PILOT_1_ROLLE]
                    : [RollenMerkmal.MPT_ROLLE];
                expect(rolleRepoMock.findBy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        requireMerkmale: [RollenMerkmal.MPT_ROLLE],
                        excludeMerkmale: RollenmerkmalSystemrechtPaar.GATED_MERKMALE.filter(
                            (merkmal: RollenMerkmal) => merkmal !== RollenMerkmal.MPT_ROLLE,
                        ),
                        gatedRollenFindScopes: [
                            bounded
                                ? {
                                      allowedOrganisationIds: ['schule-1'],
                                      authorizedMerkmale: permittedMerkmale,
                                  }
                                : { authorizedMerkmale: permittedMerkmale },
                        ],
                    }),
                );
                if (bounded) {
                    expect(permissionsMock.getOrgIdsWithSystemrecht).toHaveBeenCalledWith(
                        [RollenSystemRecht.PILOT_1_ROLLEN_ZUORDNEN],
                        true,
                    );
                }
                expect(permissionsMock.getPermittedMerkmaleForOrga).not.toHaveBeenCalled();
            },
        );

        it('should return empty result if the given systemrecht is not a gated systemrecht', async () => {
            const permissionsMock: DeepMocked<IPersonPermissions> = createPersonPermissionsMockWithAllGatedMerkmale();

            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAuthorizedForGatedSystemrecht({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.ROLLEN_VERWALTEN,
                searchStr,
                limit,
                offset,
                rolleIds,
            });

            expect(result).toEqual([[], 0]);
            expect(permissionsMock.getOrgIdsWithSystemrecht).not.toHaveBeenCalled();
            expect(rolleRepoMock.findBy).not.toHaveBeenCalled();
        });

        it('should exclude roles with any other gated Merkmal the user cannot use', async () => {
            const permissionsMock: DeepMocked<IPersonPermissions> = createPersonPermissionsMockWithAllGatedMerkmale();
            permissionsMock.getOrgIdsWithSystemrecht.mockImplementation((systemrechte: RollenSystemRecht[]) =>
                Promise.resolve(
                    systemrechte[0] === RollenSystemRecht.MPT_ROLLEN_ZUORDNEN
                        ? { all: true }
                        : { all: false, orgaIds: [] },
                ),
            );
            permissionsMock.getPermittedMerkmaleForOrga.mockResolvedValue([RollenMerkmal.MPT_ROLLE]);
            rolleRepoMock.findBy.mockResolvedValue([[], 0]);

            await rolleFindService.findRollenAuthorizedForGatedSystemrecht({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.MPT_ROLLEN_ZUORDNEN,
            });

            expect(rolleRepoMock.findBy).toHaveBeenCalledWith(
                expect.objectContaining({
                    requireMerkmale: [RollenMerkmal.MPT_ROLLE],
                    excludeMerkmale: RollenmerkmalSystemrechtPaar.GATED_MERKMALE.filter(
                        (merkmal: RollenMerkmal) => merkmal !== RollenMerkmal.MPT_ROLLE,
                    ),
                    gatedRollenFindScopes: [{ authorizedMerkmale: [RollenMerkmal.MPT_ROLLE] }],
                }),
            );
        });

        it('should not restrict returned rollen if user has permission on all organisations and did not filter by organisations', async () => {
            const permissionsMock: DeepMocked<IPersonPermissions> = createPersonPermissionsMockWithAllGatedMerkmale();

            permissionsMock.getOrgIdsWithSystemrecht.mockImplementation((systemrechte: RollenSystemRecht[]) =>
                Promise.resolve(
                    systemrechte[0] === RollenSystemRecht.MPT_ROLLEN_ZUORDNEN
                        ? { all: true }
                        : systemrechte[0] === RollenSystemRecht.PILOT_1_ROLLEN_ZUORDNEN
                          ? { all: false, orgaIds: ['schule-a'] }
                          : { all: false, orgaIds: [] },
                ),
            );
            rolleRepoMock.findBy.mockResolvedValueOnce([[DoFactory.createRolle(true)], 1]);

            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAuthorizedForGatedSystemrecht({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.MPT_ROLLEN_ZUORDNEN,
                searchStr,
                limit,
                offset,
                rolleIds,
            });

            expect(result[1]).toEqual(1);
            expect(rolleRepoMock.findBy).toHaveBeenCalledWith(
                expect.objectContaining({
                    includeTechnische: false,
                    searchStr,
                    limit,
                    offset,
                    allowedOrganisationIds: undefined,
                    rolleIds,
                    requireMerkmale: [RollenMerkmal.MPT_ROLLE],
                    excludeMerkmale: RollenmerkmalSystemrechtPaar.GATED_MERKMALE.filter(
                        (merkmal: RollenMerkmal) => merkmal !== RollenMerkmal.MPT_ROLLE,
                    ),
                    gatedRollenFindScopes: [
                        { authorizedMerkmale: [RollenMerkmal.MPT_ROLLE] },
                        {
                            allowedOrganisationIds: ['schule-a'],
                            authorizedMerkmale: [RollenMerkmal.MPT_ROLLE, RollenMerkmal.PILOT_1_ROLLE],
                        },
                    ],
                    orderBy: 'artAndName',
                }),
            );
        });

        it('should return empty result if requested organisationIds are not permitted', async () => {
            const permissionsMock: DeepMocked<IPersonPermissions> = createPersonPermissionsMockWithAllGatedMerkmale();

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: ['orga-1'],
            });

            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAuthorizedForGatedSystemrecht({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.MPT_ROLLEN_ZUORDNEN,
                searchStr,
                limit,
                offset,
                organisationIds: ['orga-2'],
                rolleIds,
            });

            expect(result).toEqual([[], 0]);
            expect(organisationRepoMock.findParentOrgasForIds).not.toHaveBeenCalled();
            expect(rolleRepoMock.findBy).not.toHaveBeenCalled();
        });

        it('should use permitted organisations and parents if no organisation filter is provided', async () => {
            const permissionsMock: DeepMocked<IPersonPermissions> = createPersonPermissionsMockWithAllGatedMerkmale();

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: ['orga-1'],
            });
            organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValueOnce([OrganisationsTyp.SCHULE]);
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([
                DoFactory.createOrganisation(true, { id: 'orga-1', administriertVon: 'parent-1' }),
                DoFactory.createOrganisation(true, { id: 'parent-1' }),
            ]);
            rolleRepoMock.findBy.mockResolvedValueOnce([[DoFactory.createRolle(true)], 1]);

            await rolleFindService.findRollenAuthorizedForGatedSystemrecht({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.MPT_ROLLEN_ZUORDNEN,
                searchStr,
                limit,
                offset,
                rolleIds,
            });

            expect(organisationRepoMock.findParentOrgasForIds).toHaveBeenCalledWith(['orga-1']);
            expect(rolleRepoMock.findBy).toHaveBeenCalledWith(
                expect.objectContaining({
                    includeTechnische: false,
                    searchStr,
                    limit,
                    offset,
                    allowedOrganisationIds: ['orga-1', 'parent-1'],
                    rolleIds,
                    requireMerkmale: [RollenMerkmal.MPT_ROLLE],
                    excludeMerkmale: RollenmerkmalSystemrechtPaar.GATED_MERKMALE.filter(
                        (merkmal: RollenMerkmal) => merkmal !== RollenMerkmal.MPT_ROLLE,
                    ),
                    gatedRollenFindScopes: [
                        {
                            allowedOrganisationIds: ['orga-1', 'parent-1'],
                            authorizedMerkmale: Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                        },
                    ],
                    orderBy: 'artAndName',
                    rollenArten: [
                        RollenArt.LEIT,
                        RollenArt.LEHR,
                        RollenArt.LERN,
                        RollenArt.SORGBER,
                        RollenArt.SCHB,
                        RollenArt.NLEHR,
                        RollenArt.EXTERN,
                    ],
                }),
            );
        });

        it('should use permitted organisations and parents if empty organisation filter is provided', async () => {
            const permissionsMock: DeepMocked<IPersonPermissions> = createPersonPermissionsMockWithAllGatedMerkmale();

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: ['orga-1'],
            });
            organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValueOnce([OrganisationsTyp.SCHULE]);
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([
                DoFactory.createOrganisation(true, { id: 'orga-1', administriertVon: 'parent-1' }),
                DoFactory.createOrganisation(true, { id: 'parent-1' }),
            ]);
            rolleRepoMock.findBy.mockResolvedValueOnce([[DoFactory.createRolle(true)], 1]);

            await rolleFindService.findRollenAuthorizedForGatedSystemrecht({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.MPT_ROLLEN_ZUORDNEN,
                searchStr,
                limit,
                offset,
                organisationIds: [],
                rolleIds,
            });

            expect(organisationRepoMock.findParentOrgasForIds).toHaveBeenCalledWith(['orga-1']);
            expect(rolleRepoMock.findBy).toHaveBeenCalledWith(
                expect.objectContaining({
                    includeTechnische: false,
                    searchStr,
                    limit,
                    offset,
                    allowedOrganisationIds: ['orga-1', 'parent-1'],
                    rolleIds,
                    requireMerkmale: [RollenMerkmal.MPT_ROLLE],
                    excludeMerkmale: RollenmerkmalSystemrechtPaar.GATED_MERKMALE.filter(
                        (merkmal: RollenMerkmal) => merkmal !== RollenMerkmal.MPT_ROLLE,
                    ),
                    gatedRollenFindScopes: [
                        {
                            allowedOrganisationIds: ['orga-1', 'parent-1'],
                            authorizedMerkmale: Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                        },
                    ],
                    orderBy: 'artAndName',
                    rollenArten: [
                        RollenArt.LEIT,
                        RollenArt.LEHR,
                        RollenArt.LERN,
                        RollenArt.SORGBER,
                        RollenArt.SCHB,
                        RollenArt.NLEHR,
                        RollenArt.EXTERN,
                    ],
                }),
            );
        });

        it('should intersect requested organisationIds with permitted ones and add parent organisations', async () => {
            const permissionsMock: DeepMocked<IPersonPermissions> = createPersonPermissionsMockWithAllGatedMerkmale();

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: ['orga-1', 'orga-2'],
            });
            organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValueOnce([OrganisationsTyp.SCHULE]);
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([
                DoFactory.createOrganisation(true, { id: 'orga-2', administriertVon: 'parent-2' }),
                DoFactory.createOrganisation(true, { id: 'parent-2' }),
            ]);
            rolleRepoMock.findBy.mockResolvedValueOnce([[DoFactory.createRolle(true)], 1]);

            await rolleFindService.findRollenAuthorizedForGatedSystemrecht({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.MPT_ROLLEN_ZUORDNEN,
                searchStr,
                limit,
                offset,
                organisationIds: ['orga-2', 'orga-3'],
                rolleIds,
            });

            expect(organisationRepoMock.findParentOrgasForIds).toHaveBeenCalledWith(['orga-2']);
            expect(rolleRepoMock.findBy).toHaveBeenCalledWith(
                expect.objectContaining({
                    includeTechnische: false,
                    searchStr,
                    limit,
                    offset,
                    allowedOrganisationIds: ['orga-2', 'parent-2'],
                    rolleIds,
                    requireMerkmale: [RollenMerkmal.MPT_ROLLE],
                    excludeMerkmale: RollenmerkmalSystemrechtPaar.GATED_MERKMALE.filter(
                        (merkmal: RollenMerkmal) => merkmal !== RollenMerkmal.MPT_ROLLE,
                    ),
                    gatedRollenFindScopes: [
                        {
                            allowedOrganisationIds: ['orga-2', 'parent-2'],
                            authorizedMerkmale: Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                        },
                    ],
                    orderBy: 'artAndName',
                    rollenArten: [
                        RollenArt.LEIT,
                        RollenArt.LEHR,
                        RollenArt.LERN,
                        RollenArt.SORGBER,
                        RollenArt.SCHB,
                        RollenArt.NLEHR,
                        RollenArt.EXTERN,
                    ],
                }),
            );
        });
    });

    describe('findRollenAvailableForPersonenkontextCreation', () => {
        let permissionsMock: DeepMocked<PersonPermissions>;
        beforeEach(() => {
            permissionsMock = createPersonPermissionsMockWithAllGatedMerkmale();
            permissionsMock.getPermittedMerkmaleForOrga.mockResolvedValue(
                Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
            );
        });

        describe('when requested systemrecht does not match', () => {
            it('should return early', async () => {
                const schule: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
                const result: Counted<Rolle<true>> =
                    await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                        permissions: permissionsMock,
                        systemrecht: RollenSystemRecht.ANGEBOTE_EINGESCHRAENKT_VERWALTEN,
                        organisationId: schule.id,
                    });
                expect(result).toEqual([[], 0]);
            });
        });

        describe(`when user has ${RollenSystemRecht.MPT_ROLLEN_ZUORDNEN.name}`, () => {
            it('should query the repo correctly', async () => {
                const traeger: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.TRAEGER,
                });
                const schule: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
                permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
                permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);
                permissionsMock.getPermittedMerkmaleForOrga.mockResolvedValue(
                    Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                );
                organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([schule.typ]);
                organisationRepoMock.findParentOrgasForIds.mockResolvedValue([traeger]);

                await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                    organisationId: schule.id,
                    permissions: permissionsMock,
                    systemrecht: RollenSystemRecht.PERSONEN_VERWALTEN,
                    rollenIds: ['rolle-1'],
                    limit: 1,
                    offset: 1,
                    rolleName: 'suche rolle',
                });

                const allowedRollenarten: Array<RollenArt> = Array.from(
                    OrganisationMatchesRollenart.getAllowedRollenartenForOrganisationsTyp(schule.typ),
                );
                expect(rolleRepoMock.findRollenAvailableForPersonenkontextCreation).toHaveBeenLastCalledWith({
                    organisationId: schule.id,
                    allowedOrganisationIds: [schule.id, traeger.id],
                    allowedRollenarten,
                    stickyRollenIds: ['rolle-1'],
                    limit: 1,
                    offset: 1,
                    searchStr: 'suche rolle',
                    gatedBucket: {
                        allowedRollenarten,
                        authorizedMerkmale: Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                    },
                });
            });

            describe(`when user has ${RollenSystemRecht.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN.name}`, () => {
                it('should query the repo correctly', async () => {
                    const traeger: Organisation<true> = DoFactory.createOrganisation(true, {
                        typ: OrganisationsTyp.TRAEGER,
                    });
                    const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                        typ: OrganisationsTyp.SCHULE,
                    });
                    permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [schule.id] });
                    permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);
                    permissionsMock.getPermittedMerkmaleForOrga.mockResolvedValue(
                        Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                    );
                    organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([schule.typ]);
                    organisationRepoMock.findParentOrgasForIds.mockResolvedValue([traeger]);

                    await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                        organisationId: schule.id,
                        permissions: permissionsMock,
                        systemrecht: RollenSystemRecht.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN,
                    });
                    const allowedRollenartenForGatedRollen: Array<RollenArt> = Array.from(
                        OrganisationMatchesRollenart.getAllowedRollenartenForOrganisationsTyp(schule.typ),
                    );
                    expect(rolleRepoMock.findRollenAvailableForPersonenkontextCreation).toHaveBeenLastCalledWith({
                        organisationId: schule.id,
                        allowedOrganisationIds: [schule.id, traeger.id],
                        allowedRollenarten: [RollenArt.LERN],
                        gatedBucket: {
                            allowedRollenarten: allowedRollenartenForGatedRollen,
                            authorizedMerkmale: Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                        },
                    });
                });
            });
        });

        it('should not set a gatedBucket if the caller has no gated permissions', async () => {
            const traeger: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.TRAEGER,
            });
            const schule: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(false);
            permissionsMock.getPermittedMerkmaleForOrga.mockResolvedValue([]);
            organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([schule.typ]);
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([traeger]);

            await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                organisationId: schule.id,
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.PERSONEN_VERWALTEN,
            });

            const allowedRollenarten: Array<RollenArt> = Array.from(
                OrganisationMatchesRollenart.getAllowedRollenartenForOrganisationsTyp(schule.typ),
            );
            expect(rolleRepoMock.findRollenAvailableForPersonenkontextCreation).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    allowedRollenarten,
                }),
            );
        });

        describe(`when user does not have ${RollenSystemRecht.MPT_ROLLEN_ZUORDNEN.name}`, () => {
            it('should query the repo correctly', async () => {
                const traeger: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.TRAEGER,
                });
                const schule: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
                permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
                const permittedMerkmale: RollenMerkmal[] = RollenmerkmalSystemrechtPaar.GATED_MERKMALE.filter(
                    (merkmal: RollenMerkmal) => merkmal !== RollenMerkmal.MPT_ROLLE,
                );
                permissionsMock.getPermittedMerkmaleForOrga.mockResolvedValue(permittedMerkmale);
                organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([schule.typ]);
                organisationRepoMock.findParentOrgasForIds.mockResolvedValue([traeger]);

                await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                    organisationId: schule.id,
                    permissions: permissionsMock,
                    systemrecht: RollenSystemRecht.PERSONEN_VERWALTEN,
                });

                const allowedRollenarten: Array<RollenArt> = Array.from(
                    OrganisationMatchesRollenart.getAllowedRollenartenForOrganisationsTyp(schule.typ),
                );
                expect(rolleRepoMock.findRollenAvailableForPersonenkontextCreation).toHaveBeenLastCalledWith({
                    organisationId: schule.id,
                    allowedOrganisationIds: [schule.id, traeger.id],
                    allowedRollenarten,
                    gatedBucket: {
                        allowedRollenarten,
                        authorizedMerkmale: permittedMerkmale,
                    },
                });
            });

            describe(`when user has ${RollenSystemRecht.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN.name}`, () => {
                it('should query the repo correctly', async () => {
                    const traeger: Organisation<true> = DoFactory.createOrganisation(true, {
                        typ: OrganisationsTyp.TRAEGER,
                    });
                    const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                        typ: OrganisationsTyp.SCHULE,
                    });
                    permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [schule.id] });
                    permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);
                    organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([schule.typ]);
                    organisationRepoMock.findParentOrgasForIds.mockResolvedValue([traeger]);

                    await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                        organisationId: schule.id,
                        permissions: permissionsMock,
                        systemrecht: RollenSystemRecht.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN,
                    });

                    const allowedRollenartenForGatedRollen: Array<RollenArt> = Array.from(
                        OrganisationMatchesRollenart.getAllowedRollenartenForOrganisationsTyp(schule.typ),
                    );
                    expect(rolleRepoMock.findRollenAvailableForPersonenkontextCreation).toHaveBeenLastCalledWith({
                        organisationId: schule.id,
                        allowedOrganisationIds: [schule.id, traeger.id],
                        allowedRollenarten: [RollenArt.LERN],
                        gatedBucket: {
                            allowedRollenarten: allowedRollenartenForGatedRollen,
                            authorizedMerkmale: Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                        },
                    });
                });
            });
        });

        it('should return early, if users rollenart and allowed rollenart mismatch', async () => {
            const traeger: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.TRAEGER,
            });
            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
            });
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [schule.id] });
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);
            organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([schule.typ]);
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([traeger]);

            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.PERSONEN_ANLEGEN,
                organisationId: schule.id,
                rollenartForPerson: RollenArt.SYSADMIN,
            });

            expect(rolleRepoMock.findRollenAvailableForPersonenkontextCreation).not.toHaveBeenCalled();
            expect(result).toEqual([[], 0]);
        });

        it('should return early, if creation is not permitted', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });
            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.PERSONEN_ANLEGEN,
                organisationId: 'does not exist',
            });
            expect(result).toEqual([[], 0]);
        });

        it('should return early, if requested and permitted orga differ', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: ['permitted-orga'] });
            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.PERSONEN_ANLEGEN,
                organisationId: 'does not exist',
            });
            expect(result).toEqual([[], 0]);
        });
    });

    describe('findRollenAvailableForPersonAdministration', () => {
        let permissionsMock: DeepMocked<PersonPermissions>;

        beforeEach(() => {
            permissionsMock = createPersonPermissionsMockWithAllGatedMerkmale();
        });

        describe('when user is Landesadmin', () => {
            beforeEach(() => {
                permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
                permissionsMock.getPermittedMerkmaleForOrga.mockResolvedValue([]);
                rolleRepoMock.findBy.mockResolvedValue([[], 0]);
            });

            describe.each([['rollenName'], [undefined]])('when searchStr is %s', (searchStr?: string) => {
                describe.each([[10], [undefined]])('when limit is %s', (limit?: number) => {
                    describe('when no organisations are selected', () => {
                        test('it should run the correct query', async () => {
                            await rolleFindService.findRollenAvailableForPersonAdministration({
                                permissions: permissionsMock,
                                searchStr,
                                limit,
                            });
                            expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                                getValidationObjectForPersonAdministrationFindByParams({
                                    searchStr,
                                    limit,
                                    expectedExcludeMerkmale: [RollenMerkmal.MPT_ROLLE],
                                }),
                            );
                        });
                    });

                    describe('when 1 organisation is selected', () => {
                        describe.each([[OrganisationsTyp.LAND], [OrganisationsTyp.TRAEGER], [OrganisationsTyp.SCHULE]])(
                            'when organisationTyp is %s',
                            (organisationsTyp: OrganisationsTyp) => {
                                let parent: Organisation<true>;
                                let organisation: Organisation<true>;

                                beforeEach(() => {
                                    parent = DoFactory.createOrganisation<true>(true, { typ: OrganisationsTyp.ROOT });
                                    organisation = DoFactory.createOrganisation(true, {
                                        typ: organisationsTyp,
                                        zugehoerigZu: parent.id,
                                        administriertVon: parent.id,
                                    });
                                    organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([
                                        organisationsTyp,
                                    ]);
                                    organisationRepoMock.findParentOrgasForIds.mockResolvedValue([parent]);
                                });

                                test('it should run the correct query', async () => {
                                    await rolleFindService.findRollenAvailableForPersonAdministration({
                                        permissions: permissionsMock,
                                        searchStr,
                                        limit,
                                        organisationIds: [organisation.id],
                                    });
                                    expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                                        getValidationObjectForPersonAdministrationFindByParams({
                                            searchStr,
                                            limit,
                                            expectedRollenArten: Array.from(
                                                OrganisationMatchesRollenart.getAllowedRollenartenForOrganisationsTyp(
                                                    organisationsTyp,
                                                ),
                                            ),
                                            expectedOrganisationIds: [organisation.id, parent.id],
                                            expectedExcludeMerkmale: [RollenMerkmal.MPT_ROLLE],
                                        }),
                                    );
                                });
                            },
                        );
                    });
                });
            });
        });

        describe('when user is Schuladmin', () => {
            describe.each([[1], [2]])('with %s schulen', (numberOfSchulen: number) => {
                let traeger: Organisation<true>;
                let schulen: Array<Organisation<true>>;

                beforeEach(() => {
                    traeger = DoFactory.createOrganisation<true>(true, { typ: OrganisationsTyp.TRAEGER });
                    schulen = DoFactory.createMany<Organisation<true>>(
                        numberOfSchulen,
                        true,
                        DoFactory.createOrganisation,
                        { typ: OrganisationsTyp.SCHULE, zugehoerigZu: traeger.id, administriertVon: traeger.id },
                    );
                    permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                        all: false,
                        orgaIds: schulen.map((s: Organisation<true>) => s.id),
                    });
                    permissionsMock.getPermittedMerkmaleForOrga.mockResolvedValue([]);
                    organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([OrganisationsTyp.SCHULE]);
                    organisationRepoMock.findParentOrgasForIds.mockResolvedValue([...schulen, traeger]);
                    rolleRepoMock.findBy.mockResolvedValue([[], 0]);
                });

                describe.each([['rollenName'], [undefined]])('when searchStr is %s', (searchStr?: string) => {
                    describe.each([[10], [undefined]])('when limit is %s', (limit?: number) => {
                        describe('when no organisations are selected', () => {
                            test('it should run the correct query', async () => {
                                await rolleFindService.findRollenAvailableForPersonAdministration({
                                    permissions: permissionsMock,
                                    searchStr,
                                    limit,
                                });
                                expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                                    getValidationObjectForPersonAdministrationFindByParams({
                                        searchStr,
                                        limit,
                                        expectedRollenArten: [RollenArt.LEIT, RollenArt.LEHR, RollenArt.LERN],
                                        expectedOrganisationIds: [
                                            ...schulen.map((s: Organisation<true>) => s.id),
                                            traeger.id,
                                        ],
                                        expectedExcludeMerkmale: [RollenMerkmal.MPT_ROLLE],
                                    }),
                                );
                            });
                        });

                        describe('when 1 organisation is selected', () => {
                            test('it should run the correct query', async () => {
                                const organisationIds: Array<string> = [schulen[0]!.id];
                                await rolleFindService.findRollenAvailableForPersonAdministration({
                                    permissions: permissionsMock,
                                    searchStr,
                                    limit,
                                    organisationIds,
                                });
                                expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                                    getValidationObjectForPersonAdministrationFindByParams({
                                        searchStr,
                                        limit,
                                        expectedRollenArten: [RollenArt.LEIT, RollenArt.LEHR, RollenArt.LERN],
                                        expectedOrganisationIds: [...organisationIds, traeger.id],
                                        expectedExcludeMerkmale: [RollenMerkmal.MPT_ROLLE],
                                    }),
                                );
                            });
                        });
                    });
                });

                describe.each([
                    [`when user has ${RollenSystemRechtEnum.MPT_ROLLEN_ZUORDNEN}`, true],
                    [`when user does not have ${RollenSystemRechtEnum.MPT_ROLLEN_ZUORDNEN}`, false],
                ])('%s', (_title: string, hasPermission: boolean) => {
                    let requestedSystemrechte: RollenSystemRecht[];
                    let hasMptPermission: boolean;

                    const shouldExcludeMptRollen: () => boolean = () =>
                        !(hasMptPermission && requestedSystemrechte.includes(RollenSystemRecht.MPT_ROLLEN_ZUORDNEN));

                    // Only MPT_ROLLEN_ZUORDNEN is ever requested in this describe block, so the other gated Merkmale
                    // (PILOT_1_ROLLE, ...) are always excluded; MPT_ROLLE is excluded unless requested and authorized.
                    const expectedExcludeMerkmale: () => RollenMerkmal[] = () =>
                        Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE);

                    const expectPersonAdministrationQueryWithExpectedMptFiltering: () => void = () => {
                        const expectedQuery: Partial<RolleFindByParameters> =
                            getValidationObjectForPersonAdministrationFindByParams({
                                expectedOrganisationIds: [...schulen.map((o: Organisation<true>) => o.id), traeger.id],
                                expectedRollenArten: [RollenArt.LEIT, RollenArt.LEHR, RollenArt.LERN],
                                expectedExcludeMerkmale: expectedExcludeMerkmale(),
                            });
                        if (!shouldExcludeMptRollen()) {
                            expectedQuery.gatedRollenFindScopes = schulen.map((schule: Organisation<true>) => ({
                                allowedOrganisationIds: [schule.id, traeger.id],
                                authorizedMerkmale: [RollenMerkmal.MPT_ROLLE],
                            }));
                        }
                        expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(expect.objectContaining(expectedQuery));
                        if (shouldExcludeMptRollen()) {
                            expect(rolleRepoMock.findBy.mock.lastCall![0].gatedRollenFindScopes).toBeUndefined();
                        }
                    };

                    const runPersonAdministrationQuery: () => Promise<void> = async () => {
                        await rolleFindService.findRollenAvailableForPersonAdministration({
                            permissions: permissionsMock,
                            requestedSystemrechte,
                        });
                    };

                    beforeEach(() => {
                        hasMptPermission = hasPermission;
                        requestedSystemrechte = [
                            RollenSystemRecht.PERSONEN_VERWALTEN,
                            RollenSystemRecht.MPT_ROLLEN_ZUORDNEN,
                        ];
                        permissionsMock.getOrgIdsWithSystemrecht.mockImplementation(
                            (systemrechte: RollenSystemRecht[]) =>
                                Promise.resolve({
                                    all: false,
                                    orgaIds:
                                        systemrechte[0] === RollenSystemRecht.PERSONEN_VERWALTEN || hasPermission
                                            ? schulen.map((schule: Organisation<true>) => schule.id)
                                            : [],
                                }),
                        );
                    });

                    describe('when user requests MPT rollen', () => {
                        it(hasPermission ? 'should return MPT rollen' : 'should not return MPT rollen', async () => {
                            await runPersonAdministrationQuery();
                            expectPersonAdministrationQueryWithExpectedMptFiltering();
                        });
                    });

                    describe('when user does not request MPT rollen', () => {
                        beforeEach(() => {
                            requestedSystemrechte = [RollenSystemRecht.PERSONEN_VERWALTEN];
                        });

                        it('should not return MPT rollen', async () => {
                            await runPersonAdministrationQuery();
                            expectPersonAdministrationQueryWithExpectedMptFiltering();
                        });
                    });
                });
            });

            describe('when no organisations are permitted', () => {
                beforeEach(() => {
                    permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                        all: false,
                        orgaIds: [],
                    });
                });

                test('it should return an empty array', async () => {
                    const result: Counted<Rolle<true>> =
                        await rolleFindService.findRollenAvailableForPersonAdministration({
                            permissions: permissionsMock,
                        });
                    expect(result).toEqual([[], 0]);
                });
            });
        });
    });

    describe.each([
        {
            method: 'findRollenAvailableForPersonAdministration' as const,
            requiredSystemrecht: RollenSystemRecht.PERSONEN_VERWALTEN,
        },
        {
            method: 'findRollenAvailableForErweiterung' as const,
            requiredSystemrecht: RollenSystemRecht.ROLLEN_ERWEITERN,
        },
    ])(
        '$method organisation scope',
        ({
            method,
            requiredSystemrecht,
        }: {
            method: 'findRollenAvailableForPersonAdministration' | 'findRollenAvailableForErweiterung';
            requiredSystemrecht: RollenSystemRecht;
        }) => {
            it.each([
                { hasPilotPermission: true, selected: true },
                { hasPilotPermission: true, selected: false },
                { hasPilotPermission: false, selected: true },
                { hasPilotPermission: false, selected: false },
            ])(
                'should preserve normal roles with separately evaluated Pilot rights (granted=$hasPilotPermission, selected=$selected)',
                async ({ hasPilotPermission, selected }: { hasPilotPermission: boolean; selected: boolean }) => {
                    const permissions: DeepMocked<PersonPermissions> = createMock(PersonPermissions);
                    const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                        typ: OrganisationsTyp.SCHULE,
                    });
                    const rolle: Rolle<true> = DoFactory.createRolle(true, { merkmale: [] });
                    permissions.getOrgIdsWithSystemrecht.mockImplementation((systemrechte: RollenSystemRecht[]) =>
                        Promise.resolve({
                            all: false,
                            orgaIds: systemrechte[0] === requiredSystemrecht || hasPilotPermission ? [schule.id] : [],
                        }),
                    );
                    organisationRepoMock.findParentOrgasForIds.mockResolvedValue([]);
                    organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([schule.typ]);
                    rolleRepoMock.findBy.mockResolvedValue([[rolle], 1]);

                    const result: Counted<Rolle<true>> = await rolleFindService[method]({
                        permissions,
                        organisationIds: selected ? [schule.id] : undefined,
                        requestedSystemrechte: [requiredSystemrecht, RollenSystemRecht.PILOT_1_ROLLEN_ZUORDNEN],
                    });

                    expect(result).toEqual([[rolle], 1]);
                    expect(permissions.getOrgIdsWithSystemrecht).toHaveBeenCalledWith(
                        [requiredSystemrecht],
                        true,
                        true,
                    );
                    expect(permissions.getOrgIdsWithSystemrecht).toHaveBeenCalledWith(
                        [RollenSystemRecht.PILOT_1_ROLLEN_ZUORDNEN],
                        true,
                    );
                    expect(permissions.getPermittedMerkmaleForOrga).not.toHaveBeenCalled();
                    const expectedQuery: Partial<RolleFindByParameters> = {
                        allowedOrganisationIds: [schule.id],
                        excludeMerkmale: Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                    };
                    if (hasPilotPermission) {
                        expectedQuery.gatedRollenFindScopes = [
                            {
                                allowedOrganisationIds: [schule.id],
                                authorizedMerkmale: [RollenMerkmal.PILOT_1_ROLLE],
                            },
                        ];
                    }
                    expect(rolleRepoMock.findBy).toHaveBeenCalledWith(expect.objectContaining(expectedQuery));
                    if (!hasPilotPermission) {
                        expect(rolleRepoMock.findBy.mock.lastCall![0].gatedRollenFindScopes).toBeUndefined();
                    }
                },
            );

            it('should limit gated role scopes to the school with the granted Pilot right', async () => {
                const traeger: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.TRAEGER,
                });
                const schuleA: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SCHULE,
                    administriertVon: traeger.id,
                });
                const schuleB: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SCHULE,
                    administriertVon: traeger.id,
                });
                const permissions: DeepMocked<PersonPermissions> = createMock(PersonPermissions);
                permissions.getOrgIdsWithSystemrecht.mockImplementation((systemrechte: RollenSystemRecht[]) =>
                    Promise.resolve({
                        all: false,
                        orgaIds: systemrechte[0] === requiredSystemrecht ? [schuleA.id, schuleB.id] : [schuleA.id],
                    }),
                );
                organisationRepoMock.findParentOrgasForIds.mockResolvedValue([schuleA, schuleB, traeger]);
                organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([OrganisationsTyp.SCHULE]);
                rolleRepoMock.findBy.mockResolvedValue([[], 0]);

                await rolleFindService[method]({
                    permissions,
                    requestedSystemrechte: [requiredSystemrecht, RollenSystemRecht.PILOT_1_ROLLEN_ZUORDNEN],
                });

                expect(rolleRepoMock.findBy).toHaveBeenCalledWith(
                    expect.objectContaining<RolleFindByParameters>({
                        allowedOrganisationIds: expect.arrayContaining([
                            schuleA.id,
                            schuleB.id,
                            traeger.id,
                        ]) as OrganisationID[],
                        excludeMerkmale: Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                        gatedRollenFindScopes: [
                            {
                                allowedOrganisationIds: [schuleA.id, traeger.id],
                                authorizedMerkmale: [RollenMerkmal.PILOT_1_ROLLE],
                            },
                        ],
                    }),
                );
            });

            it('should resolve only requested gated rights once for a large organisation scope', async () => {
                const schulen: Organisation<true>[] = DoFactory.createMany<Organisation<true>>(
                    100,
                    true,
                    DoFactory.createOrganisation,
                    { typ: OrganisationsTyp.SCHULE },
                );
                const organisationIds: OrganisationID[] = schulen.map((schule: Organisation<true>) => schule.id);
                const permissions: DeepMocked<PersonPermissions> = createMock(PersonPermissions);
                permissions.getOrgIdsWithSystemrecht.mockImplementation((systemrechte: RollenSystemRecht[]) =>
                    Promise.resolve({
                        all: false,
                        orgaIds:
                            systemrechte[0] === requiredSystemrecht ? organisationIds : organisationIds.slice(0, 1),
                    }),
                );
                organisationRepoMock.findParentOrgasForIds.mockResolvedValue([]);
                organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([OrganisationsTyp.SCHULE]);

                await rolleFindService[method]({
                    permissions,
                    organisationIds,
                    requestedSystemrechte: [RollenSystemRecht.PILOT_1_ROLLEN_ZUORDNEN],
                });

                expect(permissions.getOrgIdsWithSystemrecht).toHaveBeenCalledTimes(2);
                expect(permissions.getOrgIdsWithSystemrecht).toHaveBeenCalledWith(
                    [RollenSystemRecht.PILOT_1_ROLLEN_ZUORDNEN],
                    true,
                );
                expect(permissions.getPermittedMerkmaleForOrga).not.toHaveBeenCalled();
                expect(permissions.hasSystemrechtAtOrganisation).not.toHaveBeenCalled();
                expect(rolleRepoMock.findBy).toHaveBeenCalledWith(
                    expect.objectContaining({
                        allowedOrganisationIds: organisationIds,
                        gatedRollenFindScopes: [
                            {
                                allowedOrganisationIds: organisationIds.slice(0, 1),
                                authorizedMerkmale: [RollenMerkmal.PILOT_1_ROLLE],
                            },
                        ],
                    }),
                );
            });

            it('should return no roles without the workflow right even when Pilot rights are granted', async () => {
                const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMockWithAllGatedMerkmale();
                permissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });

                const result: Counted<Rolle<true>> = await rolleFindService[method]({
                    permissions,
                    requestedSystemrechte: [requiredSystemrecht, RollenSystemRecht.PILOT_1_ROLLEN_ZUORDNEN],
                });

                expect(result).toEqual([[], 0]);
                expect(permissions.getOrgIdsWithSystemrecht).toHaveBeenCalledWith([requiredSystemrecht], true, true);
                expect(rolleRepoMock.findBy).not.toHaveBeenCalled();
            });
        },
    );

    describe('getOrganisationIdsWithParents', () => {
        it('should return organisationIds with parents', async () => {
            const orgaIds: OrganisationID[] = ['orga-1', 'orga-2'];
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([
                DoFactory.createOrganisation(true, { id: 'parent-1' }),
            ]);
            const result: OrganisationID[] = await rolleFindService['getOrganisationIdsWithParents'](orgaIds);
            expect(result).toEqual(expect.arrayContaining(['orga-1', 'orga-2', 'parent-1']));
        });

        it('should stop traversing a cyclic organisation hierarchy', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                id: 'orga-1',
                administriertVon: 'parent-1',
            });
            const parent: Organisation<true> = DoFactory.createOrganisation(true, {
                id: 'parent-1',
                administriertVon: 'orga-1',
            });
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([organisation, parent]);

            const result: Map<OrganisationID, OrganisationID[]> = await rolleFindService[
                'getOrganisationIdsWithParentsById'
            ](['orga-1']);

            expect(result.get('orga-1')).toEqual(['orga-1', 'parent-1']);
        });
    });
});
