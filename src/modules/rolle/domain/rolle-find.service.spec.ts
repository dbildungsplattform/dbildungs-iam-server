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
import { FindRollenWithPermissionsParams, RolleFindService } from './rolle-find.service.js';
import { RollenArt, RollenMerkmal } from './rolle.enums.js';
import { Rolle } from './rolle.js';
import { OrganisationMatchesRollenart } from './specification/organisation-matches-rollenart.js';
import { RollenSystemRecht, RollenSystemRechtEnum } from './systemrecht.js';

type RolleFindServiceTestAccess = {
    getOrganisationIdsWithParents(organisationIds: OrganisationID[]): Promise<OrganisationID[]>;
};

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
            permissionsMock = createMock(PersonPermissions);
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
                    excludeMerkmale: [RollenMerkmal.MPT_ROLLE],
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
                        s.add(o.typ!);
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
                                    OrganisationMatchesRollenart.getAllowedRollenartenForOrganisationsTyp(o.typ!),
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
                        s.add(o.typ!);
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
                                    OrganisationMatchesRollenart.getAllowedRollenartenForOrganisationsTyp(o.typ!),
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
                        s.add(o.typ!);
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

        it('should include MPT rollen when caller has MPT_ROLLEN_VERWALTEN permission and requests it', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValue(true);
            const params: FindRollenWithPermissionsParams & { requestedSystemrechte?: RollenSystemRecht[] } = {
                permissions: permissionsMock,
                requestedSystemrechte: [RollenSystemRecht.ROLLEN_ERWEITERN, RollenSystemRecht.MPT_ROLLEN_VERWALTEN],
            };
            await rolleFindService.findRollenAvailableForErweiterung(params);
            expect(rolleRepoMock.findBy).not.toHaveBeenLastCalledWith(
                expect.objectContaining<RolleFindByParameters>({
                    excludeMerkmale: [RollenMerkmal.MPT_ROLLE],
                }),
            );
        });

        it('should not include MPT rollen when caller does not have MPT_ROLLEN_VERWALTEN permission, but requests it', async () => {
            const traeger: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.TRAEGER,
            });
            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
            });
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [schule.id] });
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(false);
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([traeger]);
            organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([OrganisationsTyp.SCHULE]);
            const params: FindRollenWithPermissionsParams & { requestedSystemrechte?: RollenSystemRecht[] } = {
                permissions: permissionsMock,
                requestedSystemrechte: [RollenSystemRecht.ROLLEN_ERWEITERN, RollenSystemRecht.MPT_ROLLEN_VERWALTEN],
            };

            await rolleFindService.findRollenAvailableForErweiterung(params);

            expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                expect.objectContaining<RolleFindByParameters>({
                    excludeMerkmale: [RollenMerkmal.MPT_ROLLE],
                }),
            );
        });

        it('should exclude MPT rollen when MPT_ROLLEN_VERWALTEN is not requested', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            const params: FindRollenWithPermissionsParams = {
                permissions: permissionsMock,
            };
            await rolleFindService.findRollenAvailableForErweiterung(params);
            expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                expect.objectContaining<Partial<RolleFindByParameters>>({
                    excludeMerkmale: [RollenMerkmal.MPT_ROLLE],
                }),
            );
        });

        it('should exclude MPT rollen when requested but caller does not actually hold MPT_ROLLEN_VERWALTEN', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockImplementation((systemrechte: RollenSystemRecht[]) => {
                if (systemrechte.includes(RollenSystemRecht.MPT_ROLLEN_VERWALTEN)) {
                    return Promise.resolve({ all: false, orgaIds: [] });
                }
                return Promise.resolve({ all: true });
            });
            const params: FindRollenWithPermissionsParams & { requestedSystemrechte?: RollenSystemRecht[] } = {
                permissions: permissionsMock,
                requestedSystemrechte: [RollenSystemRecht.ROLLEN_ERWEITERN, RollenSystemRecht.MPT_ROLLEN_VERWALTEN],
            };
            await rolleFindService.findRollenAvailableForErweiterung(params);
            expect(rolleRepoMock.findBy).not.toHaveBeenCalled();
            // expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
            //     expect.objectContaining<Partial<RolleFindByParameters>>({
            //         excludeMerkmale: [RollenMerkmal.MPT_ROLLE],
            //     }),
            // );
        });
    });

    describe('findRollenAvailableForImportPersonenkontext', () => {
        let permissionsMock: DeepMocked<PersonPermissions>;
        beforeEach(() => {
            permissionsMock = createMock(PersonPermissions);
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

        it('should return empty array if allowed organisationIds resolve to empty', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: ['orga-1'] });
            vi.spyOn(
                rolleFindService as unknown as RolleFindServiceTestAccess,
                'getOrganisationIdsWithParents',
            ).mockResolvedValueOnce([]);

            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForImportPersonenkontext({
                permissions: permissionsMock,
                organisationId: 'orga-1',
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
                    excludeMerkmale: [RollenMerkmal.MPT_ROLLE],
                }),
            );
        });
    });

    describe('findMptRollenAuthorized', () => {
        const includeTechnische: boolean = faker.datatype.boolean();
        const searchStr: string = faker.string.alphanumeric();
        const limit: number = faker.number.int();
        const offset: number = faker.number.int();
        const rolleIds: RolleID[] = [faker.string.uuid()];

        it('should not restrict returned rollen if user has permission on all organisations and did not filter by organisations', async () => {
            const permissionsMock: DeepMocked<IPersonPermissions> = createMock(PersonPermissions);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: true,
            });

            rolleRepoMock.findBy.mockResolvedValueOnce([[DoFactory.createRolle(true)], 1]);

            const result: Counted<Rolle<true>> = await rolleFindService.findMptRollenAuthorized({
                permissions: permissionsMock,
                includeTechnische,
                searchStr,
                limit,
                offset,
                rolleIds,
            });

            expect(result[1]).toEqual(1);
            expect(rolleRepoMock.findBy).toHaveBeenCalledWith({
                includeTechnische,
                searchStr,
                limit,
                offset,
                allowedOrganisationIds: undefined,
                rolleIds,
                requireMerkmale: [RollenMerkmal.MPT_ROLLE],
                orderBy: 'artAndName',
            });
        });

        it('should return empty result if requested organisationIds are not permitted', async () => {
            const permissionsMock: DeepMocked<IPersonPermissions> = createMock(PersonPermissions);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: ['orga-1'],
            });

            const result: Counted<Rolle<true>> = await rolleFindService.findMptRollenAuthorized({
                permissions: permissionsMock,
                includeTechnische,
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
            const permissionsMock: DeepMocked<IPersonPermissions> = createMock(PersonPermissions);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: ['orga-1'],
            });
            organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValueOnce([OrganisationsTyp.SCHULE]);
            organisationRepoMock.findParentOrgasForIds.mockResolvedValueOnce([
                DoFactory.createOrganisation(true, { id: 'parent-1' }),
            ]);
            rolleRepoMock.findBy.mockResolvedValueOnce([[DoFactory.createRolle(true)], 1]);

            await rolleFindService.findMptRollenAuthorized({
                permissions: permissionsMock,
                includeTechnische,
                searchStr,
                limit,
                offset,
                rolleIds,
            });

            expect(organisationRepoMock.findParentOrgasForIds).toHaveBeenCalledWith(['orga-1']);
            expect(rolleRepoMock.findBy).toHaveBeenCalledWith({
                includeTechnische,
                searchStr,
                limit,
                offset,
                allowedOrganisationIds: ['orga-1', 'parent-1'],
                rolleIds,
                requireMerkmale: [RollenMerkmal.MPT_ROLLE],
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
            });
        });

        it('should use permitted organisations and parents if empty organisation filter is provided', async () => {
            const permissionsMock: DeepMocked<IPersonPermissions> = createMock(PersonPermissions);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: ['orga-1'],
            });
            organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValueOnce([OrganisationsTyp.SCHULE]);
            organisationRepoMock.findParentOrgasForIds.mockResolvedValueOnce([
                DoFactory.createOrganisation(true, { id: 'parent-1' }),
            ]);
            rolleRepoMock.findBy.mockResolvedValueOnce([[DoFactory.createRolle(true)], 1]);

            await rolleFindService.findMptRollenAuthorized({
                permissions: permissionsMock,
                includeTechnische,
                searchStr,
                limit,
                offset,
                organisationIds: [],
                rolleIds,
            });

            expect(organisationRepoMock.findParentOrgasForIds).toHaveBeenCalledWith(['orga-1']);
            expect(rolleRepoMock.findBy).toHaveBeenCalledWith({
                includeTechnische,
                searchStr,
                limit,
                offset,
                allowedOrganisationIds: ['orga-1', 'parent-1'],
                rolleIds,
                requireMerkmale: [RollenMerkmal.MPT_ROLLE],
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
            });
        });

        it('should intersect requested organisationIds with permitted ones and add parent organisations', async () => {
            const permissionsMock: DeepMocked<IPersonPermissions> = createMock(PersonPermissions);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: ['orga-1', 'orga-2'],
            });
            organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValueOnce([OrganisationsTyp.SCHULE]);
            organisationRepoMock.findParentOrgasForIds.mockResolvedValueOnce([
                DoFactory.createOrganisation(true, { id: 'parent-2' }),
            ]);
            rolleRepoMock.findBy.mockResolvedValueOnce([[DoFactory.createRolle(true)], 1]);

            await rolleFindService.findMptRollenAuthorized({
                permissions: permissionsMock,
                includeTechnische,
                searchStr,
                limit,
                offset,
                organisationIds: ['orga-2', 'orga-3'],
                rolleIds,
            });

            expect(organisationRepoMock.findParentOrgasForIds).toHaveBeenCalledWith(['orga-2']);
            expect(rolleRepoMock.findBy).toHaveBeenCalledWith({
                includeTechnische,
                searchStr,
                limit,
                offset,
                allowedOrganisationIds: ['orga-2', 'parent-2'],
                rolleIds,
                requireMerkmale: [RollenMerkmal.MPT_ROLLE],
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
            });
        });
    });

    describe('findRollenAvailableForPersonenkontextCreation', () => {
        let permissionsMock: DeepMocked<PersonPermissions>;
        beforeEach(() => {
            permissionsMock = createMock(PersonPermissions);
        });

        describe(`when user has ${RollenSystemRecht.MPT_ROLLEN_VERWALTEN.name}`, () => {
            it('should query the repo correctly', async () => {
                const traeger: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.TRAEGER,
                });
                const schule: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
                permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
                permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);
                organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([schule.typ!]);
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
                    OrganisationMatchesRollenart.getAllowedRollenartenForOrganisationsTyp(schule.typ!),
                );
                expect(rolleRepoMock.findRollenAvailableForPersonenkontextCreation).toHaveBeenLastCalledWith({
                    organisationId: schule.id,
                    allowedOrganisationIds: [schule.id, traeger.id],
                    allowedRollenarten,
                    stickyRollenIds: ['rolle-1'],
                    limit: 1,
                    offset: 1,
                    searchStr: 'suche rolle',
                    mpt: {
                        allowedRollenarten,
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
                    organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([schule.typ!]);
                    organisationRepoMock.findParentOrgasForIds.mockResolvedValue([traeger]);

                    await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                        organisationId: schule.id,
                        permissions: permissionsMock,
                        systemrecht: RollenSystemRecht.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN,
                    });

                    const allowedRollenartenForMPTRollen: Array<RollenArt> = Array.from(
                        OrganisationMatchesRollenart.getAllowedRollenartenForOrganisationsTyp(schule.typ!),
                    );
                    expect(rolleRepoMock.findRollenAvailableForPersonenkontextCreation).toHaveBeenLastCalledWith({
                        organisationId: schule.id,
                        allowedOrganisationIds: [schule.id, traeger.id],
                        allowedRollenarten: [RollenArt.LERN],
                        mpt: {
                            allowedRollenarten: allowedRollenartenForMPTRollen,
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
            organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([schule.typ!]);
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([traeger]);

            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.PERSONEN_ANLEGEN,
                organisationId: schule.id,
                rollenartOfUser: RollenArt.SYSADMIN,
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
            permissionsMock = createMock(PersonPermissions);
        });

        describe('when user is Landesadmin', () => {
            beforeEach(() => {
                permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
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
                    organisationRepoMock.findDistinctOrganisationsTypen.mockResolvedValue([OrganisationsTyp.SCHULE]);
                    organisationRepoMock.findParentOrgasForIds.mockResolvedValue([traeger]);
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
                    [`when user has ${RollenSystemRechtEnum.MPT_ROLLEN_VERWALTEN}`, true],
                    [`when user does not have ${RollenSystemRechtEnum.MPT_ROLLEN_VERWALTEN}`, false],
                ])('%s', (_title: string, hasPermission: boolean) => {
                    let requestedSystemrechte: RollenSystemRecht[];
                    let hasMptPermission: boolean;

                    const shouldExcludeMptRollen: () => boolean = () =>
                        !(hasMptPermission && requestedSystemrechte.includes(RollenSystemRecht.MPT_ROLLEN_VERWALTEN));

                    const expectPersonAdministrationQueryWithExpectedMptFiltering: () => void = () => {
                        expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                            getValidationObjectForPersonAdministrationFindByParams({
                                expectedOrganisationIds: [...schulen.map((o: Organisation<true>) => o.id), traeger.id],
                                expectedRollenArten: [RollenArt.LEIT, RollenArt.LEHR, RollenArt.LERN],
                                expectedExcludeMerkmale: shouldExcludeMptRollen()
                                    ? [RollenMerkmal.MPT_ROLLE]
                                    : undefined,
                            }),
                        );
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
                            RollenSystemRecht.MPT_ROLLEN_VERWALTEN,
                        ];
                        permissionsMock.hasSystemrechtAtOrganisation.mockImplementation(
                            (requestedOrganisation: OrganisationID, systemrecht: RollenSystemRecht) => {
                                return Promise.resolve(
                                    hasPermission &&
                                        schulen.some(
                                            (schule: Organisation<true>) => schule.id === requestedOrganisation,
                                        ) &&
                                        systemrecht === RollenSystemRecht.MPT_ROLLEN_VERWALTEN,
                                );
                            },
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

    describe('getOrganisationIdsWithParents', () => {
        it('should return organisationIds with parents', async () => {
            const orgaIds: OrganisationID[] = ['orga-1', 'orga-2'];
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([
                DoFactory.createOrganisation(true, { id: 'parent-1' }),
            ]);
            const result: OrganisationID[] = await rolleFindService['getOrganisationIdsWithParents'](orgaIds);
            expect(result).toEqual(expect.arrayContaining(['orga-1', 'orga-2', 'parent-1']));
        });
    });
});
