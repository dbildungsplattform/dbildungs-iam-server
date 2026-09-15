import { faker } from '@faker-js/faker';
import { Test, TestingModule } from '@nestjs/testing';
import { zip } from 'lodash-es';
import { ConfigTestModule } from '../../../../test/utils/config-test.module.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { LoggingTestModule } from '../../../../test/utils/logging-test.module.js';
import { expectErrResult, expectOkResult } from '../../../../test/utils/test-types.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { OrganisationID } from '../../../shared/types/aggregate-ids.types.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { Rollenerweiterung } from '../../rolle/domain/rollenerweiterung.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../../rolle/repo/rollenerweiterung.repo.js';
import { VidisApiAdapter } from '../../vidis/adapter/domain/vidis-api.adapter.js';
import { OrganisationServiceProviderRepo } from '../repo/organisation-service-provider.repo.js';
import { ServiceProviderRepo } from '../repo/service-provider.repo.js';
import { ServiceProviderKategorie, ServiceProviderMerkmal } from './service-provider.enum.js';
import { ServiceProvider } from './service-provider.js';
import { ServiceProviderService } from './service-provider.service.js';
import {
    ManageableServiceProviderDetailsWithReferencedObjects,
    ManageableServiceProviderWithReferencedObjects,
    ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount,
} from './types.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';

// helper to mock output of some repos
function getIdMap<T>(arr: Array<T & { id: string }>): Map<string, T> {
    const map: Map<string, T> = new Map();
    arr.forEach((value: T & { id: string }) => {
        map.set(value.id, value);
    });
    return map;
}

describe('ServiceProviderService', () => {
    let service: ServiceProviderService;
    let rolleRepo: DeepMocked<RolleRepo>;
    let rollenerweiterungRepo: DeepMocked<RollenerweiterungRepo>;
    let serviceProviderRepo: DeepMocked<ServiceProviderRepo>;
    let organisationRepo: DeepMocked<OrganisationRepository>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [LoggingTestModule, ConfigTestModule],
            providers: [
                ServiceProviderService,
                { provide: RolleRepo, useValue: createMock(RolleRepo) },
                { provide: RollenerweiterungRepo, useValue: createMock(RollenerweiterungRepo) },
                { provide: ServiceProviderRepo, useValue: createMock(ServiceProviderRepo) },
                { provide: OrganisationRepository, useValue: createMock(OrganisationRepository) },
                { provide: VidisApiAdapter, useValue: createMock(VidisApiAdapter) },
                { provide: OrganisationServiceProviderRepo, useValue: createMock(OrganisationServiceProviderRepo) },
            ],
        }).compile();
        service = module.get<ServiceProviderService>(ServiceProviderService);
        rolleRepo = module.get<DeepMocked<RolleRepo>>(RolleRepo);
        rollenerweiterungRepo = module.get<DeepMocked<RollenerweiterungRepo>>(RollenerweiterungRepo);
        serviceProviderRepo = module.get<DeepMocked<ServiceProviderRepo>>(ServiceProviderRepo);
        organisationRepo = module.get<DeepMocked<OrganisationRepository>>(OrganisationRepository);
    });

    describe('getServiceProvidersByRolleIds', () => {
        const serviceProviders: Array<ServiceProvider<true>> = [
            DoFactory.createServiceProvider(true),
            DoFactory.createServiceProvider(true),
            DoFactory.createServiceProvider(true),
            DoFactory.createServiceProvider(true),
        ];
        const serviceProviderIds: Array<ServiceProvider<true>['id']> = serviceProviders.map(
            (sp: ServiceProvider<true>) => sp.id,
        );
        const rollen: Array<Rolle<true>> = [
            DoFactory.createRolle(true, { serviceProviderIds: serviceProviderIds.slice(0, 2) }),
            DoFactory.createRolle(true, { serviceProviderIds: serviceProviderIds.slice(2) }),
            DoFactory.createRolle(true, { serviceProviderIds: serviceProviderIds }),
        ];

        beforeEach(() => {
            rolleRepo.findById.mockImplementation((id: string) =>
                Promise.resolve(rollen.find((r: Rolle<true>) => r.id === id)),
            );
            rolleRepo.findByIds.mockImplementation((ids: Array<string>) => {
                return Promise.resolve(getIdMap(rollen.filter((r: Rolle<true>) => ids.includes(r.id))));
            });
            serviceProviderRepo.findById.mockImplementation((id: string) =>
                Promise.resolve(serviceProviders.find((sp: ServiceProvider<true>) => sp.id === id)),
            );
            serviceProviderRepo.findByIds.mockImplementation((ids: Array<string>) => {
                return Promise.resolve(
                    getIdMap(serviceProviders.filter((r: ServiceProvider<true>) => ids.includes(r.id))),
                );
            });
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('returns serviceProviders', async () => {
            const result: Array<ServiceProvider<true>> = await service.getServiceProvidersByRolleIds(
                rollen.map((r: Rolle<true>) => r.id),
            );
            expect(result.length).toBe(serviceProviders.length);
            serviceProviders.forEach((expected: ServiceProvider<true>) => {
                const actual: Option<ServiceProvider<true>> = result.find(
                    (sp: ServiceProvider<true>) => sp.id === expected.id,
                );
                expect(actual).toBeDefined();
                expect(actual).toEqual<ServiceProvider<true>>(expected);
            });
        });

        it.each([[[] as Array<string>], [['non-existent']]])(
            'returns an empty array if ids are not found',
            async (ids: string[]) => {
                const result: Array<ServiceProvider<true>> = await service.getServiceProvidersByRolleIds(ids);
                expect(result.length).toBe(0);
            },
        );
    });

    describe('getServiceProvidersByOrganisationenAndRollen', () => {
        describe.each([[true], [false]])('when rollen have rollenerweiterungen', (haveRollenerweiterungen: boolean) => {
            const organisations: Array<Organisation<true>> = [
                DoFactory.createOrganisation(true),
                DoFactory.createOrganisation(true),
                DoFactory.createOrganisation(true),
                DoFactory.createOrganisation(true),
                DoFactory.createOrganisation(true),
            ];
            const serviceProviders: Array<ServiceProvider<true>> = [
                DoFactory.createServiceProvider(true),
                DoFactory.createServiceProvider(true),
                DoFactory.createServiceProvider(true),
                DoFactory.createServiceProvider(true),
                DoFactory.createServiceProvider(true),
            ];
            const rollen: Array<Rolle<true>> = serviceProviders.map((sp: ServiceProvider<true>) =>
                DoFactory.createRolle(true, { serviceProviderIds: [sp.id] }),
            );
            beforeEach(() => {
                rolleRepo.findByIds.mockImplementation((ids: Array<string>) => {
                    return Promise.resolve(getIdMap(rollen.filter((r: Rolle<true>) => ids.includes(r.id))));
                });
                rollenerweiterungRepo.findManyByOrganisationAndRolle.mockResolvedValue(
                    haveRollenerweiterungen
                        ? zip(organisations, rollen).map(
                              ([organisation, rolle]: [Organisation<true> | undefined, Rolle<true> | undefined]) =>
                                  DoFactory.createRollenerweiterung(true, {
                                      organisationId: organisation?.id,
                                      rolleId: rolle?.id,
                                  }),
                          )
                        : [],
                );
                serviceProviderRepo.findByIds.mockImplementation((ids: Array<string>) => {
                    return Promise.resolve(
                        getIdMap(ids.map((id: string) => DoFactory.createServiceProvider(true, { id }))),
                    );
                });
            });
            afterEach(() => {
                vi.restoreAllMocks();
            });
            it('returns a list of service providers', async () => {
                const result: Array<ServiceProvider<true>> = await service.getServiceProvidersByOrganisationenAndRollen(
                    zip(organisations, rollen).map(
                        ([o, r]: [Organisation<true> | undefined, Rolle<true> | undefined]) => ({
                            organisationId: o!.id,
                            rolleId: r!.id,
                        }),
                    ),
                );
                expect(result.length).toBe(
                    haveRollenerweiterungen ? organisations.length + serviceProviders.length : serviceProviders.length,
                );
            });
        });
    });

    describe('getAuthorizedForRollenErweiternWithMerkmalRollenerweiterung', () => {
        let organisation: Organisation<true>;
        let serviceProvider: ServiceProvider<true>;
        let rollenerweiterung: Rollenerweiterung<true>;
        let rollenerweiterung2: Rollenerweiterung<true>;
        let rolle: Rolle<true>;

        beforeEach(() => {
            organisation = DoFactory.createOrganisation(true);
            serviceProvider = DoFactory.createServiceProvider(true, {
                providedOnSchulstrukturknoten: organisation.id,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            });
            rolle = DoFactory.createRolle(true, { serviceProviderIds: [serviceProvider.id] });
            rollenerweiterung = DoFactory.createRollenerweiterung(true, {
                organisationId: organisation.id,
                serviceProviderId: serviceProvider.id,
                rolleId: rolle.id,
            });
            rollenerweiterung2 = DoFactory.createRollenerweiterung(true, {
                organisationId: organisation.id,
                serviceProviderId: serviceProvider.id,
                rolleId: rolle.id,
            });
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('throws MissingPermissionsError if person lacks required system rights', async () => {
            const permissions: DeepMocked<PersonPermissions> = createMock(PersonPermissions);
            permissions.hasSystemrechtAtOrganisation = vi.fn().mockResolvedValue(false);

            const result: Result<
                Counted<ManageableServiceProviderWithReferencedObjects>,
                MissingPermissionsError
            > = await service.getAuthorizedForRollenErweiternWithMerkmalRollenerweiterung(organisation.id, permissions);

            expectErrResult(result);
            expect(organisationRepo.findParentOrgasForIds).not.toHaveBeenCalled();
            expect(serviceProviderRepo.findByOrgasWithMerkmal).not.toHaveBeenCalled();
        });

        it('returns authorized serviceProviders and correctly sets hasSomeVerwaltenPermission', async () => {
            const parentOrga: Organisation<true> = DoFactory.createOrganisation(true);
            const permissions: DeepMocked<PersonPermissions> = createMock(PersonPermissions);
            permissions.hasSystemrechtAtOrganisation = vi.fn().mockResolvedValue(true);
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: [parentOrga.id, serviceProvider.providedOnSchulstrukturknoten],
            });

            organisationRepo.findParentOrgasForIds.mockResolvedValue([parentOrga]);
            organisationRepo.findByIds.mockResolvedValue(
                new Map([[serviceProvider.providedOnSchulstrukturknoten, organisation]]),
            );
            serviceProviderRepo.findByOrgasWithMerkmal.mockResolvedValue([[serviceProvider], 1]);
            rolleRepo.findByIds.mockResolvedValue(new Map([[rolle.id, rolle]]));
            rolleRepo.findByServiceProviderIds.mockResolvedValue(new Map([[serviceProvider.id, [rolle]]]));
            rollenerweiterungRepo.findByServiceProviderIds.mockResolvedValue(
                new Map([[serviceProvider.id, [rollenerweiterung, rollenerweiterung2]]]),
            );

            const result: Result<
                Counted<ManageableServiceProviderWithReferencedObjects>,
                MissingPermissionsError
            > = await service.getAuthorizedForRollenErweiternWithMerkmalRollenerweiterung(organisation.id, permissions);

            expect(serviceProviderRepo.findByOrgasWithMerkmal).toHaveBeenCalledWith(
                [organisation.id, parentOrga.id],
                ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
                undefined,
                undefined,
            );
            expectOkResult(result);
            expect(
                result.value[0].map((s: ManageableServiceProviderWithReferencedObjects) => s.serviceProvider),
            ).toContain(serviceProvider);
            expect(result.value[0][0]?.hasSomeVerwaltenPermission).toBe(true);
            expect(result.value[1]).toBe(1);
        });

        it('returns authorized serviceProviders when person has rights and includes parent organisation ids', async () => {
            const parentOrga: Organisation<true> = DoFactory.createOrganisation(true);
            const permissions: DeepMocked<PersonPermissions> = createMock(PersonPermissions);
            permissions.hasSystemrechtAtOrganisation = vi.fn().mockResolvedValue(true);

            organisationRepo.findParentOrgasForIds.mockResolvedValue([parentOrga]);
            organisationRepo.findByIds.mockResolvedValue(
                new Map([[serviceProvider.providedOnSchulstrukturknoten, organisation]]),
            );
            serviceProviderRepo.findByOrgasWithMerkmal.mockResolvedValue([[serviceProvider], 1]);
            rolleRepo.findByIds.mockResolvedValue(new Map([[rolle.id, rolle]]));
            rolleRepo.findByServiceProviderIds.mockResolvedValue(new Map([[serviceProvider.id, [rolle]]]));
            rollenerweiterungRepo.findByServiceProviderIds.mockResolvedValue(
                new Map([[serviceProvider.id, [rollenerweiterung]]]),
            );

            const result: Result<
                Counted<ManageableServiceProviderWithReferencedObjects>,
                MissingPermissionsError
            > = await service.getAuthorizedForRollenErweiternWithMerkmalRollenerweiterung(organisation.id, permissions);

            expect(serviceProviderRepo.findByOrgasWithMerkmal).toHaveBeenCalledWith(
                [organisation.id, parentOrga.id],
                ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
                undefined,
                undefined,
            );
            expectOkResult(result);
            expect(
                result.value[0].map((s: ManageableServiceProviderWithReferencedObjects) => s.serviceProvider),
            ).toContain(serviceProvider);
            expect(result.value[1]).toBe(1);
        });

        it('returns authorized serviceProviders when person has rights and includes parent organisation ids (limit & offset)', async () => {
            const parentOrga: Organisation<true> = DoFactory.createOrganisation(true);
            const permissions: DeepMocked<PersonPermissions> = createMock(PersonPermissions);
            permissions.hasSystemrechtAtOrganisation = vi.fn().mockResolvedValue(true);

            const limit: number = 10;
            const offset: number = 5;

            organisationRepo.findParentOrgasForIds.mockResolvedValue([parentOrga]);
            organisationRepo.findByIds.mockResolvedValue(
                new Map([[serviceProvider.providedOnSchulstrukturknoten, organisation]]),
            );
            serviceProviderRepo.findByOrgasWithMerkmal.mockResolvedValue([[serviceProvider], 1]);
            rolleRepo.findByIds.mockResolvedValue(new Map([[rolle.id, rolle]]));
            rolleRepo.findByServiceProviderIds.mockResolvedValue(new Map([[serviceProvider.id, [rolle]]]));
            rollenerweiterungRepo.findByServiceProviderIds.mockResolvedValue(
                new Map([[serviceProvider.id, [rollenerweiterung]]]),
            );

            const result: Result<
                Counted<ManageableServiceProviderWithReferencedObjects>,
                MissingPermissionsError
            > = await service.getAuthorizedForRollenErweiternWithMerkmalRollenerweiterung(
                organisation.id,
                permissions,
                limit,
                offset,
            );

            expect(serviceProviderRepo.findByOrgasWithMerkmal).toHaveBeenCalledWith(
                [organisation.id, parentOrga.id],
                ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
                limit,
                offset,
            );
            expectOkResult(result);
            expect(
                result.value[0].map((s: ManageableServiceProviderWithReferencedObjects) => s.serviceProvider),
            ).toContain(serviceProvider);
            expect(result.value[1]).toBe(1);
        });
    });

    describe('findManageableById', () => {
        let organisation: Organisation<true>;
        let rolle: Rolle<true>;
        let serviceProvider: ServiceProvider<true>;
        let rollenerweiterung: Rollenerweiterung<true>;
        let permissions: DeepMocked<PersonPermissions>;

        beforeEach(() => {
            organisation = DoFactory.createOrganisation(true);
            rolle = DoFactory.createRolle(true);
            serviceProvider = DoFactory.createServiceProvider(true, {
                providedOnSchulstrukturknoten: organisation.id,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            });
            rollenerweiterung = DoFactory.createRollenerweiterung(true);
            permissions = createMock(PersonPermissions);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('returns service provider when user has "all" permissions', async () => {
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });

            organisationRepo.findByIds.mockResolvedValue(
                new Map([[serviceProvider.providedOnSchulstrukturknoten, organisation]]),
            );
            serviceProviderRepo.findById.mockResolvedValue(serviceProvider);
            rolleRepo.findByIds.mockResolvedValue(new Map([[rolle.id, rolle]]));
            rolleRepo.findByServiceProviderIds.mockResolvedValue(new Map([[serviceProvider.id, [rolle]]]));
            rollenerweiterungRepo.findByServiceProviderIds.mockResolvedValue(
                new Map([[serviceProvider.id, [rollenerweiterung]]]),
            );

            const result: Option<ManageableServiceProviderDetailsWithReferencedObjects> =
                await service.findManageableById(permissions, serviceProvider.id);

            expect(serviceProviderRepo.findById).toHaveBeenCalledWith(serviceProvider.id);
            expect(result?.serviceProvider).toEqual(serviceProvider);
        });

        it('returns service provider even if it has no rollen or rollenerweiterungen', async () => {
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });

            organisationRepo.findByIds.mockResolvedValue(
                new Map([[serviceProvider.providedOnSchulstrukturknoten, organisation]]),
            );
            serviceProviderRepo.findById.mockResolvedValue(serviceProvider);
            rolleRepo.findByIds.mockResolvedValue(new Map());
            rolleRepo.findByServiceProviderIds.mockResolvedValue(new Map());
            rollenerweiterungRepo.findByServiceProviderIds.mockResolvedValue(new Map());

            const result: Option<ManageableServiceProviderDetailsWithReferencedObjects> =
                await service.findManageableById(permissions, serviceProvider.id);

            expect(serviceProviderRepo.findById).toHaveBeenCalledWith(serviceProvider.id);
            expect(result?.serviceProvider).toEqual(serviceProvider);
            expect(result?.rollen).toHaveLength(0);
            expect(result?.rollenerweiterungen).toHaveLength(0);
            expect(result?.rollenerweiterungenWithName).toHaveLength(0);
        });

        it('returns service provider via authorized query when user has limited permissions', async () => {
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [organisation.id],
            });

            const parent: Organisation<true> = DoFactory.createOrganisation(true);
            organisation.administriertVon = parent.id;
            serviceProvider.providedOnSchulstrukturknoten = parent.id;
            organisationRepo.findParentOrgasForIds.mockResolvedValue([parent]);
            organisationRepo.findByIds.mockResolvedValue(
                new Map([[serviceProvider.providedOnSchulstrukturknoten, organisation]]),
            );
            serviceProviderRepo.findById.mockResolvedValue(serviceProvider);
            rolleRepo.findByIds.mockResolvedValue(new Map([[rolle.id, rolle]]));
            rolleRepo.findByServiceProviderIds.mockResolvedValue(new Map([[serviceProvider.id, [rolle]]]));
            rollenerweiterungRepo.findByServiceProviderIds.mockResolvedValue(
                new Map([[serviceProvider.id, [rollenerweiterung]]]),
            );

            const result: Option<ManageableServiceProviderDetailsWithReferencedObjects> =
                await service.findManageableById(permissions, serviceProvider.id);

            expect(organisationRepo.findParentOrgasForIds).toHaveBeenCalledWith([organisation.id]);
            expect(serviceProviderRepo.findById).toHaveBeenCalledWith(serviceProvider.id);
            expect(result?.serviceProvider).toEqual(serviceProvider);
        });

        it('returns None when user has "all" permissions but provider does not exist', async () => {
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });

            serviceProviderRepo.findById.mockResolvedValue(null);

            const result: Option<ManageableServiceProviderDetailsWithReferencedObjects> =
                await service.findManageableById(permissions, 'nonexistent-id');

            expect(result).toBe(undefined);
        });

        it('returns None when authorized fetch does not resolve to the correct administrationsebene', async () => {
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [faker.string.uuid()],
            });
            serviceProviderRepo.findById.mockResolvedValue(serviceProvider);

            organisationRepo.findParentOrgasForIds.mockResolvedValue([]);

            const result: Option<ManageableServiceProviderDetailsWithReferencedObjects> =
                await service.findManageableById(permissions, serviceProvider.id);

            expect(result).toBe(undefined);
        });

        it('sets relevantSystemrechte correctly for ANGEBOTE_VERWALTEN and ANGEBOTE_EINGESCHRAENKT_VERWALTEN', async () => {
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });
            permissions.hasSystemrechtAtOrganisation.mockImplementation(
                (_: OrganisationID, recht: RollenSystemRecht): Promise<boolean> => {
                    if (recht === RollenSystemRecht.ANGEBOTE_VERWALTEN) {
                        return Promise.resolve(true);
                    }
                    if (recht === RollenSystemRecht.ANGEBOTE_EINGESCHRAENKT_VERWALTEN) {
                        return Promise.resolve(true);
                    }
                    return Promise.resolve(false);
                },
            );
            serviceProviderRepo.findById.mockResolvedValue(serviceProvider);
            organisationRepo.findByIds.mockResolvedValue(
                new Map([[serviceProvider.providedOnSchulstrukturknoten, organisation]]),
            );
            rolleRepo.findByIds.mockResolvedValue(new Map([[rolle.id, rolle]]));
            rolleRepo.findByServiceProviderIds.mockResolvedValue(new Map([[serviceProvider.id, [rolle]]]));
            rollenerweiterungRepo.findByServiceProviderIds.mockResolvedValue(
                new Map([[serviceProvider.id, [rollenerweiterung]]]),
            );

            const result: Option<ManageableServiceProviderDetailsWithReferencedObjects> =
                await service.findManageableById(permissions, serviceProvider.id);
            expect(result?.relevantSystemrechte).toContain(RollenSystemRecht.ANGEBOTE_VERWALTEN);
            expect(result?.relevantSystemrechte).toContain(RollenSystemRecht.ANGEBOTE_EINGESCHRAENKT_VERWALTEN);
        });

        it('sets relevantSystemrechte correctly for ROLLEN_ERWEITERN (all = true)', async () => {
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            permissions.hasSystemrechtAtOrganisation.mockResolvedValue(false);
            serviceProviderRepo.findById.mockResolvedValue(serviceProvider);
            organisationRepo.findByIds.mockResolvedValue(
                new Map([[serviceProvider.providedOnSchulstrukturknoten, organisation]]),
            );
            rolleRepo.findByIds.mockResolvedValue(new Map([[rolle.id, rolle]]));
            rolleRepo.findByServiceProviderIds.mockResolvedValue(new Map([[serviceProvider.id, [rolle]]]));
            rollenerweiterungRepo.findByServiceProviderIds.mockResolvedValue(
                new Map([[serviceProvider.id, [rollenerweiterung]]]),
            );

            const result: Option<ManageableServiceProviderDetailsWithReferencedObjects> =
                await service.findManageableById(permissions, serviceProvider.id);
            expect(result?.relevantSystemrechte).toContain(RollenSystemRecht.ROLLEN_ERWEITERN);
        });

        it('sets relevantSystemrechte correctly for ROLLEN_ERWEITERN (orgaIds contains provider)', async () => {
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [organisation.id] });
            permissions.hasSystemrechtAtOrganisation.mockResolvedValue(false);
            serviceProviderRepo.findById.mockResolvedValue(serviceProvider);
            organisationRepo.findByIds.mockResolvedValue(
                new Map([[serviceProvider.providedOnSchulstrukturknoten, organisation]]),
            );
            rolleRepo.findByIds.mockResolvedValue(new Map([[rolle.id, rolle]]));
            rolleRepo.findByServiceProviderIds.mockResolvedValue(new Map([[serviceProvider.id, [rolle]]]));
            rollenerweiterungRepo.findByServiceProviderIds.mockResolvedValue(
                new Map([[serviceProvider.id, [rollenerweiterung]]]),
            );

            const result: Option<ManageableServiceProviderDetailsWithReferencedObjects> =
                await service.findManageableById(permissions, serviceProvider.id);
            expect(result?.relevantSystemrechte).toContain(RollenSystemRecht.ROLLEN_ERWEITERN);
        });

        it('sets relevantSystemrechte correctly for ROLLEN_ERWEITERN (parent orga case)', async () => {
            const parent: Organisation<true> = DoFactory.createOrganisation(true);
            organisation.administriertVon = parent.id;
            serviceProvider.providedOnSchulstrukturknoten = parent.id;

            serviceProviderRepo.findById.mockResolvedValue(serviceProvider);
            permissions.hasSystemrechtAtOrganisation.mockResolvedValue(false);
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [organisation.id] });
            organisationRepo.findParentOrgasForIds.mockResolvedValue([parent]);
            organisationRepo.findByIds.mockResolvedValue(
                new Map([[serviceProvider.providedOnSchulstrukturknoten, organisation]]),
            );
            rolleRepo.findByIds.mockResolvedValue(new Map([[rolle.id, rolle]]));
            rolleRepo.findByServiceProviderIds.mockResolvedValue(new Map([[serviceProvider.id, [rolle]]]));
            rollenerweiterungRepo.findByServiceProviderIds.mockResolvedValue(
                new Map([[serviceProvider.id, [rollenerweiterung]]]),
            );

            const result: Option<ManageableServiceProviderDetailsWithReferencedObjects> =
                await service.findManageableById(permissions, serviceProvider.id);
            expect(result?.relevantSystemrechte).toContain(RollenSystemRecht.ROLLEN_ERWEITERN);
        });
    });

    describe('findAuthorized', () => {
        let organisation: Organisation<true>;
        let rolle: Rolle<true>;
        let rolle2: Rolle<true>;
        let emailServiceProvider: ServiceProvider<true>;
        let unterrichtServiceProvider: ServiceProvider<true>;
        let rollenerweiterung: Rollenerweiterung<true>;
        let rollenerweiterung1: Rollenerweiterung<true>;
        let permissions: DeepMocked<PersonPermissions>;

        beforeEach(() => {
            organisation = DoFactory.createOrganisation(true);
            rolle = DoFactory.createRolle(true);
            rolle2 = DoFactory.createRolle(true);
            emailServiceProvider = DoFactory.createServiceProvider(true, {
                providedOnSchulstrukturknoten: organisation.id,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                kategorie: ServiceProviderKategorie.EMAIL,
            });
            unterrichtServiceProvider = DoFactory.createServiceProvider(true, {
                providedOnSchulstrukturknoten: organisation.id,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                kategorie: ServiceProviderKategorie.UNTERRICHT,
            });
            rollenerweiterung = DoFactory.createRollenerweiterung(true, { serviceProviderId: emailServiceProvider.id });
            rollenerweiterung1 = DoFactory.createRollenerweiterung(true, {
                serviceProviderId: unterrichtServiceProvider.id,
            });
            permissions = createMock(PersonPermissions);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('returns all service providers when user has "all" permissions', async () => {
            const nameA: string = faker.string.alpha(8);
            const nameB: string = faker.string.alpha(8);

            const [unsorted1, unsorted2]: [string, string] =
                nameA.localeCompare(nameB) > 0 ? [nameA, nameB] : [nameB, nameA];

            rolle.name = unsorted1;
            rolle2.name = unsorted2;

            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });

            serviceProviderRepo.findByOrganisationsWithMerkmale.mockResolvedValue([
                [emailServiceProvider, unterrichtServiceProvider],
                2,
            ]);
            organisationRepo.findByIds.mockResolvedValue(
                new Map([[emailServiceProvider.providedOnSchulstrukturknoten, organisation]]),
            );
            rolleRepo.findByIds.mockResolvedValue(
                new Map([
                    [rollenerweiterung.rolleId, rolle],
                    [rollenerweiterung1.rolleId, rolle2],
                ]),
            );
            rolleRepo.findByServiceProviderIds.mockResolvedValue(
                new Map([
                    [emailServiceProvider.id, [rolle]],
                    [unterrichtServiceProvider.id, []],
                ]),
            );
            rollenerweiterungRepo.countByServiceProviderIds.mockResolvedValue({
                [emailServiceProvider.id]: 2,
                [unterrichtServiceProvider.id]: 0,
            });

            const [result, count]: Counted<ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount> =
                await service.findAuthorized(permissions, { limit: 10, offset: 0 });

            expect(permissions.getOrgIdsWithSystemrecht).toHaveBeenCalledWith(
                [RollenSystemRecht.ANGEBOTE_VERWALTEN],
                true,
            );
            expect(serviceProviderRepo.findByOrganisationsWithMerkmale).toHaveBeenCalledWith('all', {
                limit: 10,
                offset: 0,
            });
            expect(result).toHaveLength(2);
            expect(count).toBe(2);
            expect(rolleRepo.findByServiceProviderIds).toHaveBeenCalledWith(
                [emailServiceProvider.id, unterrichtServiceProvider.id],
                20,
            );
            expect(result[0]?.hasRollenerweiterungen).toBe(true);
        });

        it('returns filtered service providers when user has limited permissions', async () => {
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [organisation.id],
            });

            serviceProviderRepo.findByOrganisationsWithMerkmale.mockResolvedValue([[emailServiceProvider], 1]);
            organisationRepo.findByIds.mockResolvedValue(
                new Map([[emailServiceProvider.providedOnSchulstrukturknoten, organisation]]),
            );
            rolleRepo.findByIds.mockResolvedValue(new Map([[rolle.id, rolle]]));
            rolleRepo.findByServiceProviderIds.mockResolvedValue(new Map([[emailServiceProvider.id, [rolle]]]));
            rollenerweiterungRepo.countByServiceProviderIds.mockResolvedValue({
                [emailServiceProvider.id]: 1,
            });

            const [result, count]: Counted<ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount> =
                await service.findAuthorized(permissions, { limit: 10, offset: 0 });

            expect(serviceProviderRepo.findByOrganisationsWithMerkmale).toHaveBeenCalledWith([organisation.id], {
                limit: 10,
                offset: 0,
            });
            expect(result).toHaveLength(1);
            expect(result[0]?.serviceProvider).toEqual(emailServiceProvider);
            expect(count).toBe(1);
        });

        it('respects limit and offset parameters', async () => {
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });

            serviceProviderRepo.findByOrganisationsWithMerkmale.mockResolvedValue([[emailServiceProvider], 100]);
            organisationRepo.findByIds.mockResolvedValue(
                new Map([[emailServiceProvider.providedOnSchulstrukturknoten, organisation]]),
            );
            rolleRepo.findByIds.mockResolvedValue(new Map([[rolle.id, rolle]]));
            rolleRepo.findByServiceProviderIds.mockResolvedValue(new Map([[emailServiceProvider.id, [rolle]]]));
            rollenerweiterungRepo.countByServiceProviderIds.mockResolvedValue({
                [emailServiceProvider.id]: 1,
            });

            const limit: number = 5;
            const offset: number = 10;

            await service.findAuthorized(permissions, { limit, offset });

            expect(serviceProviderRepo.findByOrganisationsWithMerkmale).toHaveBeenCalledWith('all', { limit, offset });
        });

        it('returns empty array when no service providers found', async () => {
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });

            serviceProviderRepo.findByOrganisationsWithMerkmale.mockResolvedValue([[], 0]);

            const [result, count]: Counted<ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount> =
                await service.findAuthorized(permissions);

            expect(result).toHaveLength(0);
            expect(count).toBe(0);
        });

        it('falls back to empty arrays when no rollen or rollenerweiterungen exist', async () => {
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

            serviceProviderRepo.findByOrganisationsWithMerkmale.mockResolvedValue([[emailServiceProvider], 1]);

            organisationRepo.findByIds.mockResolvedValue(
                new Map([[emailServiceProvider.providedOnSchulstrukturknoten, organisation]]),
            );

            // return EMPTY maps (no entry for serviceProvider.id)
            rolleRepo.findByServiceProviderIds.mockResolvedValue(new Map());
            rollenerweiterungRepo.countByServiceProviderIds.mockResolvedValue({});

            // also needed for enrichment step
            rolleRepo.findByIds.mockResolvedValue(new Map());
            organisationRepo.findByIds.mockResolvedValue(new Map());

            const [result]: Counted<ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount> =
                await service.findAuthorized(permissions, { limit: 10, offset: 0 });

            expect(result[0]?.rollen).toEqual([]);
            expect(result[0]?.hasRollenerweiterungen).toBe(false);
        });

        it('returns only service providers matching the provided kategorien filter', async () => {
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });

            const kategorienFilter: ServiceProviderKategorie[] = [ServiceProviderKategorie.EMAIL];

            serviceProviderRepo.findByOrganisationsWithMerkmale.mockResolvedValue([[emailServiceProvider], 1]);
            organisationRepo.findByIds.mockResolvedValue(
                new Map([[emailServiceProvider.providedOnSchulstrukturknoten, organisation]]),
            );
            rolleRepo.findByIds.mockResolvedValue(new Map([[rolle.id, rolle]]));
            rolleRepo.findByServiceProviderIds.mockResolvedValue(new Map([[emailServiceProvider.id, [rolle]]]));
            rollenerweiterungRepo.countByServiceProviderIds.mockResolvedValue({
                [emailServiceProvider.id]: 1,
            });

            const [result, count]: Counted<ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount> =
                await service.findAuthorized(permissions, {
                    kategorien: kategorienFilter,
                });

            expect(serviceProviderRepo.findByOrganisationsWithMerkmale).toHaveBeenCalledWith('all', {
                kategorien: kategorienFilter,
            });
            expect(result).toHaveLength(1);
            expect(result[0]?.serviceProvider.kategorie).toBe(ServiceProviderKategorie.EMAIL);
            expect(count).toBe(1);
        });
    });

    describe('findAllowedProvidersForRollenerweiterungAtOrga', () => {
        let permissions: DeepMocked<PersonPermissions>;
        let organisation: Organisation<true>;
        let parentOrganisation: Organisation<true>;
        let serviceProvider: ServiceProvider<true>;

        beforeEach(() => {
            organisation = DoFactory.createOrganisation(true);
            parentOrganisation = DoFactory.createOrganisation(true);
            organisationRepo.findParentOrgasForIds.mockResolvedValue([parentOrganisation]);
            serviceProvider = DoFactory.createServiceProvider(true, {
                providedOnSchulstrukturknoten: organisation.id,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            });
            organisationRepo.findByIds.mockResolvedValue(new Map([[organisation.id, organisation]]));
            serviceProviderRepo.findByOrgasWithMerkmal.mockResolvedValue([[serviceProvider], 1]);
            permissions = createMock(PersonPermissions);
            permissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [organisation.id],
            });
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('returns allowed providers for rollenerweiterung at orga', async () => {
            const result: Counted<ServiceProvider<true>> = await service.findAllowedProvidersForRollenerweiterungAtOrga(
                organisation.id,
                permissions,
            );

            expect(organisationRepo.findParentOrgasForIds).toHaveBeenCalledWith([organisation.id]);
            expect(serviceProviderRepo.findByOrgasWithMerkmal).toHaveBeenCalledWith(
                [organisation.id, parentOrganisation.id],
                ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
            );
            expect(result[0]).toContain(serviceProvider);
            expect(result[1]).toBe(1);
        });

        it('returns empty array if user has no permissions for the orga', async () => {
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: [],
            });

            const result: Counted<ServiceProvider<true>> = await service.findAllowedProvidersForRollenerweiterungAtOrga(
                organisation.id,
                permissions,
            );

            expect(result[0]).toHaveLength(0);
            expect(result[1]).toBe(0);
        });

        it('returns empty array if no providers found', async () => {
            serviceProviderRepo.findByOrgasWithMerkmal.mockResolvedValue([[], 0]);

            const result: Counted<ServiceProvider<true>> = await service.findAllowedProvidersForRollenerweiterungAtOrga(
                organisation.id,
                permissions,
            );

            expect(result[0]).toHaveLength(0);
            expect(result[1]).toBe(0);
        });

        it('should filter service providers by rollenArten when provided', async () => {
            const matchingProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                providedOnSchulstrukturknoten: organisation.id,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [RollenArt.LERN],
            });
            const nonMatchingProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                providedOnSchulstrukturknoten: organisation.id,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [RollenArt.LEHR],
            });

            serviceProviderRepo.findByOrgasWithMerkmal.mockResolvedValue([[matchingProvider, nonMatchingProvider], 2]);

            const result: Counted<ServiceProvider<true>> = await service.findAllowedProvidersForRollenerweiterungAtOrga(
                organisation.id,
                permissions,
                [RollenArt.LERN],
            );

            expect(result[0]).toEqual([matchingProvider]);
            expect(result[1]).toBe(1);
        });
    });

    describe('findManageableLandRoot', () => {
        describe('when user has all=true ANGEBOTE_VERWALTEN', () => {
            it('should return service providers', async () => {
                const permissions: DeepMocked<PersonPermissions> = createMock(PersonPermissions);
                const orgIds: OrganisationID[] = [faker.string.uuid(), faker.string.uuid()];
                const sps: ServiceProvider<true>[] = [DoFactory.createServiceProvider(true)];

                permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: true });
                organisationRepo.findIdsByTypen.mockResolvedValueOnce(orgIds);
                serviceProviderRepo.findBySchulstrukturknotenPaginated.mockResolvedValueOnce([sps, 1]);

                const result: Result<
                    Counted<ServiceProvider<true>>,
                    MissingPermissionsError
                > = await service.findManageableLandRoot(permissions, undefined, 10, 0);

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value[0]).toEqual(sps);
                    expect(result.value[1]).toBe(1);
                }
                expect(organisationRepo.findIdsByTypen).toHaveBeenCalledWith([
                    OrganisationsTyp.LAND,
                    OrganisationsTyp.ROOT,
                ]);
                expect(serviceProviderRepo.findBySchulstrukturknotenPaginated).toHaveBeenCalledWith(
                    orgIds,
                    undefined,
                    10,
                    0,
                );
            });

            it('should forward searchString, limit and offset to findBySchulstrukturknoten', async () => {
                const permissions: DeepMocked<PersonPermissions> = createMock(PersonPermissions);
                const orgIds: OrganisationID[] = [faker.string.uuid()];
                const sps: ServiceProvider<true>[] = [DoFactory.createServiceProvider(true)];
                const searchString: string = faker.string.alpha(5);
                const limit: number = 7;
                const offset: number = 3;

                permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: true });
                organisationRepo.findIdsByTypen.mockResolvedValueOnce(orgIds);
                serviceProviderRepo.findBySchulstrukturknotenPaginated.mockResolvedValueOnce([sps, 1]);

                await service.findManageableLandRoot(permissions, searchString, limit, offset);

                expect(serviceProviderRepo.findBySchulstrukturknotenPaginated).toHaveBeenCalledWith(
                    orgIds,
                    searchString,
                    limit,
                    offset,
                );
            });

            it('should return empty result when no LAND or ROOT organisations exist', async () => {
                const permissions: DeepMocked<PersonPermissions> = createMock(PersonPermissions);

                permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: true });
                organisationRepo.findIdsByTypen.mockResolvedValueOnce([]);
                serviceProviderRepo.findBySchulstrukturknotenPaginated.mockResolvedValueOnce([[], 0]);

                const result: Result<
                    Counted<ServiceProvider<true>>,
                    MissingPermissionsError
                > = await service.findManageableLandRoot(permissions);

                expectOkResult(result);
                expect(result.value[0]).toHaveLength(0);
                expect(result.value[1]).toBe(0);
                expect(serviceProviderRepo.findBySchulstrukturknotenPaginated).toHaveBeenCalledWith(
                    [],
                    undefined,
                    undefined,
                    undefined,
                );
            });
        });

        describe('when user has limited ANGEBOTE_VERWALTEN', () => {
            it('should return MissingPermissionsError when user does not have root-level ANGEBOTE_VERWALTEN', async () => {
                const permissions: DeepMocked<PersonPermissions> = createMock(PersonPermissions);

                permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [] });

                const result: Result<
                    Counted<ServiceProvider<true>>,
                    MissingPermissionsError
                > = await service.findManageableLandRoot(permissions);

                expectErrResult(result);
                expect(organisationRepo.findIdsByTypen).not.toHaveBeenCalled();
                expect(serviceProviderRepo.findBySchulstrukturknotenPaginated).not.toHaveBeenCalled();
            });
        });
    });
});
