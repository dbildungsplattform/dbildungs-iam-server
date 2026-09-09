import { faker } from '@faker-js/faker';
import { Test, TestingModule } from '@nestjs/testing';
import { uniq } from 'lodash-es';
import { vi } from 'vitest';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { ConfigTestModule, DoFactory } from '../../../../test/utils/index.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { OrganisationID, RolleID } from '../../../shared/types/aggregate-ids.types.js';
import { Ok } from '../../../shared/util/result.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RolleFindByParameters, RolleRepo } from '../repo/rolle.repo.js';
import { FindRollenWithPermissionsParams, RolleFindService } from './rolle-find.service.js';
import { RollenArt, RollenMerkmal } from './rolle.enums.js';
import { Rolle } from './rolle.js';
import { OrganisationMatchesRollenart } from './specification/organisation-matches-rollenart.js';
import { RollenSystemRecht } from './systemrecht.js';

type RolleFindServiceTestAccess = {
    getOrganisationIdsWithParents(organisationIds: OrganisationID[]): Promise<OrganisationID[]>;
};

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
            const params: FindRollenWithPermissionsParams & { requestedSystemrechte?: RollenSystemRecht[] } = {
                permissions: permissionsMock,
                requestedSystemrechte: [RollenSystemRecht.ROLLEN_ERWEITERN, RollenSystemRecht.MPT_ROLLEN_VERWALTEN],
            };
            await rolleFindService.findRollenAvailableForErweiterung(params);
            expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                expect.objectContaining<Partial<RolleFindByParameters>>({
                    excludeMerkmale: undefined,
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
            expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                expect.objectContaining<Partial<RolleFindByParameters>>({
                    excludeMerkmale: [RollenMerkmal.MPT_ROLLE],
                }),
            );
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
            });

            expect(result).toEqual([[], 0]);
            expect(permissionsMock.getOrgIdsWithSystemrecht).toHaveBeenCalledWith(
                [RollenSystemRecht.IMPORT_DURCHFUEHREN],
                true,
                false,
            );
        });

        it('should return empty array when no orgas are requested', async () => {
            const organisationId: OrganisationID = 'orga-1';
            const candidateRolle: Rolle<true> = DoFactory.createRolle(true);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [organisationId] });
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([]);
            organisationRepoMock.findByIds.mockResolvedValue(new Map());
            rolleRepoMock.findBy.mockResolvedValue([[candidateRolle], 1]);

            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForImportPersonenkontext({
                permissions: permissionsMock,
            });

            expect(result).toEqual([[], 0]);
        });

        it('should return empty array if requested organisationIds are not permitted', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: ['orga-1'] });

            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForImportPersonenkontext({
                permissions: permissionsMock,
                organisationIds: ['orga-2'],
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
            });

            expect(result).toEqual([[], 0]);
            expect(rolleRepoMock.findBy).not.toHaveBeenCalled();
        });

        it('should apply offset and limit after filtering candidates', async () => {
            const rollen: Rolle<true>[] = [
                DoFactory.createRolle(true, { name: 'A' }),
                DoFactory.createRolle(true, { name: 'B' }),
                DoFactory.createRolle(true, { name: 'C' }),
            ];
            vi.spyOn(rollen[0] as unknown as Rolle<true>, 'canBeAssignedToOrga').mockResolvedValue(Ok());
            vi.spyOn(rollen[1] as unknown as Rolle<true>, 'canBeAssignedToOrga').mockResolvedValue(Ok());
            vi.spyOn(rollen[2] as unknown as Rolle<true>, 'canBeAssignedToOrga').mockResolvedValue(Ok());

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            rolleRepoMock.findBy.mockResolvedValue([rollen, rollen.length]);
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([]);
            const orgaMap: Map<OrganisationID, Organisation<true>> = new Map<OrganisationID, Organisation<true>>([
                ['orga-1', DoFactory.createOrganisation(true, { id: 'orga-1', typ: OrganisationsTyp.SCHULE })],
            ]);
            organisationRepoMock.findByIds.mockResolvedValue(orgaMap);

            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForImportPersonenkontext({
                permissions: permissionsMock,
                organisationIds: ['orga-1'],
                offset: 1,
                limit: 1,
            });

            expect(result).toEqual([[rollen[1]], rollen.length]);
            expect(rolleRepoMock.findBy).toHaveBeenLastCalledWith(
                expect.objectContaining<RolleFindByParameters>({
                    excludeMerkmale: [RollenMerkmal.MPT_ROLLE],
                }),
            );
        });

        it('should apply offset when no limit is provided', async () => {
            const rollen: Rolle<true>[] = [
                DoFactory.createRolle(true, { name: 'A' }),
                DoFactory.createRolle(true, { name: 'B' }),
                DoFactory.createRolle(true, { name: 'C' }),
            ];
            vi.spyOn(rollen[0] as unknown as Rolle<true>, 'canBeAssignedToOrga').mockResolvedValue(Ok());
            vi.spyOn(rollen[1] as unknown as Rolle<true>, 'canBeAssignedToOrga').mockResolvedValue(Ok());
            vi.spyOn(rollen[2] as unknown as Rolle<true>, 'canBeAssignedToOrga').mockResolvedValue(Ok());

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            rolleRepoMock.findBy.mockResolvedValue([rollen, rollen.length]);
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([]);
            const orgaMap: Map<OrganisationID, Organisation<true>> = new Map<OrganisationID, Organisation<true>>([
                ['orga-1', DoFactory.createOrganisation(true, { id: 'orga-1', typ: OrganisationsTyp.SCHULE })],
            ]);
            organisationRepoMock.findByIds.mockResolvedValue(orgaMap);

            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForImportPersonenkontext({
                permissions: permissionsMock,
                organisationIds: ['orga-1'],
                offset: 1,
            });

            expect(result).toEqual([rollen.slice(1), rollen.length]);
        });

        it('should filter out rollen that cannot be assigned to requested organisation', async () => {
            const organisationId: OrganisationID = 'orga-1';
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                id: organisationId,
                typ: OrganisationsTyp.SCHULE,
            });

            const allowedRolle: Rolle<true> = DoFactory.createRolle(true, {
                administeredBySchulstrukturknoten: organisationId,
                rollenart: RollenArt.LEHR,
            });
            const disallowedRolle: Rolle<true> = DoFactory.createRolle(true, {
                administeredBySchulstrukturknoten: organisationId,
                rollenart: RollenArt.SYSADMIN,
            });

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [organisationId] });
            organisationRepoMock.findParentOrgasForIds.mockResolvedValue([]);
            organisationRepoMock.findByIds.mockResolvedValue(new Map([[organisationId, organisation]]));
            rolleRepoMock.findBy.mockResolvedValue([[allowedRolle, disallowedRolle], 2]);

            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForImportPersonenkontext({
                permissions: permissionsMock,
                organisationIds: [organisationId],
            });

            expect(result[0]).toHaveLength(1);
            expect(result[0]).toEqual([allowedRolle]);
            expect(result[1]).toBe(1);
            expect(permissionsMock.getOrgIdsWithSystemrecht).toHaveBeenCalledWith(
                [RollenSystemRecht.IMPORT_DURCHFUEHREN],
                true,
                false,
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

            const result: Counted<Rolle<true>> = await rolleFindService.findMptRollenAuthorized(
                permissionsMock,
                includeTechnische,
                searchStr,
                limit,
                offset,
                undefined,
                rolleIds,
            );

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

            const result: Counted<Rolle<true>> = await rolleFindService.findMptRollenAuthorized(
                permissionsMock,
                includeTechnische,
                searchStr,
                limit,
                offset,
                ['orga-2'],
                rolleIds,
            );

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

            await rolleFindService.findMptRollenAuthorized(
                permissionsMock,
                includeTechnische,
                searchStr,
                limit,
                offset,
                undefined,
                rolleIds,
            );

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

            await rolleFindService.findMptRollenAuthorized(
                permissionsMock,
                includeTechnische,
                searchStr,
                limit,
                offset,
                [],
                rolleIds,
            );

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

            await rolleFindService.findMptRollenAuthorized(
                permissionsMock,
                includeTechnische,
                searchStr,
                limit,
                offset,
                ['orga-2', 'orga-3'],
                rolleIds,
            );

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

        it('should return early, if no organisation is found', async () => {
            organisationRepoMock.findById.mockResolvedValue(undefined);
            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.PERSONEN_ANLEGEN,
                organisationId: 'does not exist',
            });
            expect(result).toEqual([[], 0]);
        });

        it('should return early, if creation is not permitted', async () => {
            organisationRepoMock.findById.mockResolvedValue(DoFactory.createOrganisation(true));
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(false);
            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.PERSONEN_ANLEGEN,
                organisationId: 'does not exist',
            });
            expect(result).toEqual([[], 0]);
        });

        it('should return early, if allowed rollenarten can not be determined due to missing organisationsTyp', async () => {
            organisationRepoMock.findById.mockResolvedValue(DoFactory.createOrganisation(true, { typ: undefined }));
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);
            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.PERSONEN_ANLEGEN,
                organisationId: 'does not exist',
            });
            expect(result).toEqual([[], 0]);
        });

        it('should use limited rollenarten allowlist for restricted user creation', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
            });

            organisationRepoMock.findById.mockResolvedValue(organisation);

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            vi.spyOn(
                rolleFindService as unknown as RolleFindServiceTestAccess,
                'getOrganisationIdsWithParents',
            ).mockResolvedValue([organisation.id]);

            rolleRepoMock.findRollenAvailableForPersonenkontextCreation.mockResolvedValue([[], 0]);

            await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN,
                organisationId: organisation.id,
            });

            expect(rolleRepoMock.findRollenAvailableForPersonenkontextCreation).toHaveBeenCalled();
        });

        it('should use limited rollenarten allowlist and include MPT configuration when user has MPT permission', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
            });

            organisationRepoMock.findById.mockResolvedValue(organisation);

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

            vi.spyOn(
                rolleFindService as unknown as RolleFindServiceTestAccess,
                'getOrganisationIdsWithParents',
            ).mockResolvedValue([organisation.id]);

            rolleRepoMock.findRollenAvailableForPersonenkontextCreation.mockResolvedValue([[], 0]);

            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN,
                organisationId: organisation.id,
            });

            expect(result).toEqual([[], 0]);

            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenNthCalledWith(
                1,
                organisation.id,
                RollenSystemRecht.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN,
            );

            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenNthCalledWith(
                2,
                organisation.id,
                RollenSystemRecht.MPT_ROLLEN_VERWALTEN,
            );

            expect(rolleRepoMock.findRollenAvailableForPersonenkontextCreation).toHaveBeenCalledWith(
                expect.objectContaining({
                    organisationId: organisation.id,
                    allowedOrganisationIds: [organisation.id],
                    mpt: {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                        allowedRollenarten: expect.any(Array),
                    },
                }),
            );
        });

        it('should not include MPT configuration when user has no MPT permission', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
            });

            organisationRepoMock.findById.mockResolvedValue(organisation);

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

            vi.spyOn(
                rolleFindService as unknown as RolleFindServiceTestAccess,
                'getOrganisationIdsWithParents',
            ).mockResolvedValue([organisation.id]);

            rolleRepoMock.findRollenAvailableForPersonenkontextCreation.mockResolvedValue([[], 0]);

            const result: Counted<Rolle<true>> = await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.PERSONEN_ANLEGEN,
                organisationId: organisation.id,
            });

            expect(result).toEqual([[], 0]);

            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenNthCalledWith(
                1,
                organisation.id,
                RollenSystemRecht.PERSONEN_ANLEGEN,
            );

            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenNthCalledWith(
                2,
                organisation.id,
                RollenSystemRecht.MPT_ROLLEN_VERWALTEN,
            );

            expect(rolleRepoMock.findRollenAvailableForPersonenkontextCreation).toHaveBeenCalledWith(
                expect.objectContaining({
                    organisationId: organisation.id,
                    allowedOrganisationIds: [organisation.id],
                    mpt: undefined,
                }),
            );
        });

        it('should restrict MPT rollenarten to rollenartOfUser if it is allowed for the organisation', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
            });

            organisationRepoMock.findById.mockResolvedValue(organisation);

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

            vi.spyOn(
                rolleFindService as unknown as RolleFindServiceTestAccess,
                'getOrganisationIdsWithParents',
            ).mockResolvedValue([organisation.id]);

            rolleRepoMock.findRollenAvailableForPersonenkontextCreation.mockResolvedValue([[], 0]);

            const rollenartOfUser: RollenArt = RollenArt.LEHR;

            await rolleFindService.findRollenAvailableForPersonenkontextCreation({
                permissions: permissionsMock,
                systemrecht: RollenSystemRecht.PERSONEN_ANLEGEN,
                organisationId: organisation.id,
                rollenartOfUser,
            });

            expect(rolleRepoMock.findRollenAvailableForPersonenkontextCreation).toHaveBeenCalledWith(
                expect.objectContaining({
                    mpt: {
                        allowedRollenarten: [rollenartOfUser],
                    },
                }),
            );
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
